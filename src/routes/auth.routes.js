const express = require('express');
const path = require('path');
const { generateSalt, hashPassword } = require('../utils/password');

/**
 * 简易登录速率限制器
 * 同一 IP 在 windowMs 内最多允许 maxAttempts 次失败尝试
 */
class LoginRateLimiter {
  constructor({ maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map(); // ip -> { count, firstAttempt }
    // 每 5 分钟清理过期记录
    this.cleanupTimer = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  _cleanup() {
    const now = Date.now();
    for (const [ip, record] of this.attempts) {
      if (now - record.firstAttempt > this.windowMs) {
        this.attempts.delete(ip);
      }
    }
  }

  isBlocked(ip) {
    const record = this.attempts.get(ip);
    if (!record) return false;
    if (Date.now() - record.firstAttempt > this.windowMs) {
      this.attempts.delete(ip);
      return false;
    }
    return record.count >= this.maxAttempts;
  }

  recordFailure(ip) {
    const now = Date.now();
    const record = this.attempts.get(ip);
    if (!record || now - record.firstAttempt > this.windowMs) {
      this.attempts.set(ip, { count: 1, firstAttempt: now });
    } else {
      record.count++;
    }
  }

  reset(ip) {
    this.attempts.delete(ip);
  }
}

/**
 * 认证相关路由
 */
function createAuthRoutes(configLoader, checkInitialSetup) {
  const router = express.Router();
  const config = configLoader.getConfig();
  const loginLimiter = new LoginRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

  // 初始设置页面
  router.get('/setup', (req, res) => {
    if (config.auth.isConfigured) {
      return res.redirect('/');
    }
    res.sendFile(path.join(process.cwd(), 'views', 'setup.html'));
  });

  // 执行初始设置
  router.post('/perform-setup', async (req, res) => {
    if (config.auth.isConfigured) {
      return res.status(400).json({ success: false, message: '系统已经配置过了' });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码都是必需的' });
    }

    const salt = generateSalt();
    const hashedPwd = hashPassword(password, salt);

    config.auth.username = username;
    config.auth.hashedPassword = hashedPwd;
    config.auth.salt = salt;
    config.auth.isConfigured = true;

    await configLoader.saveConfig();

    // 自动登录，初始设置完成后默认记住登录状态
    req.session.authenticated = true;
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    console.log('初始设置完成，自动登录并设置 30 天过期时间');
    res.json({ success: true, message: '初始设置完成' });
  });

  // 登录页面
  router.get('/login', checkInitialSetup, (req, res) => {
    if (req.session.authenticated) {
      return res.redirect('/');
    }
    res.sendFile(path.join(process.cwd(), 'views', 'login.html'));
  });

  // 登录处理
  router.post('/login', checkInitialSetup, (req, res) => {
    const clientIp = req.ip;

    // 检查是否被速率限制
    if (loginLimiter.isBlocked(clientIp)) {
      console.warn(`登录速率限制触发: IP=${clientIp}`);
      return res.status(429).json({ success: false, message: '登录尝试过于频繁，请15分钟后再试' });
    }

    const { username, password, rememberMe } = req.body;
    const hashedPwd = hashPassword(password, config.auth.salt);

    if (username === config.auth.username && hashedPwd === config.auth.hashedPassword) {
      // 登录成功，清除失败记录
      loginLimiter.reset(clientIp);
      req.session.authenticated = true;

      // 根据用户选择设置 session 过期时间
      if (rememberMe) {
        // 记住我：设置 30 天过期时间
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
        console.log('用户选择记住登录，session 过期时间设置为 30 天');
      } else {
        // 不记住：浏览器关闭后过期
        req.session.cookie.maxAge = null;
        console.log('用户未选择记住登录，session 将在浏览器关闭后过期');
      }

      return res.json({ success: true });
    } else {
      // 登录失败，记录失败次数
      loginLimiter.recordFailure(clientIp);
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
  });

  // 注销
  router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('注销时销毁 session 出错:', err);
      } else {
        console.log('用户已注销，session 已销毁');
      }
      res.redirect('/login');
    });
  });

  // 健康检查端点（用于 Docker 健康检查和负载均衡器）
  router.get('/api/health', (req, res) => {
    // 需要imageDb实例，这里通过依赖注入传入
    const imageDb = req.app.locals.imageDb;

    // 基础健康检查：服务器正在运行
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: imageDb.isConnected() ? 'connected' : 'disconnected'
    };

    // 如果数据库未连接，返回 503 状态
    if (!imageDb.isConnected()) {
      return res.status(503).json({
        ...health,
        status: 'unhealthy'
      });
    }

    res.status(200).json(health);
  });

  // 检查认证状态API
  router.get('/api/auth-status', (req, res) => {
    res.json({
      isConfigured: config.auth.isConfigured,
      isAuthenticated: !!req.session.authenticated
    });
  });

  return router;
}

module.exports = createAuthRoutes;
