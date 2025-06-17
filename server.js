const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const crypto = require('crypto'); // 用于生成唯一文件名
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const ImageDatabase = require('./database'); // 引入SQLite数据库模块

// 读取配置文件（登录凭据）
const configPath = path.join(__dirname, 'config.json');
let config = require(configPath);

// 初始化SQLite数据库
const imageDb = new ImageDatabase('images.db');

// 图片记录文件路径 (用于向后兼容和数据迁移)
const imagesDbPath = path.join(__dirname, 'images.json');

// 自动导入JSON数据到SQLite (如果JSON文件存在且SQLite为空)
if (fs.existsSync(imagesDbPath)) {
  const dbStatus = imageDb.getStatus();
  if (dbStatus.dbImageCount === 0) {
    console.log('检测到现有JSON数据，正在导入到SQLite数据库...');
    try {
      const result = imageDb.importFromJson(imagesDbPath);
      console.log(`JSON数据导入完成: 导入${result.imported}条记录`);
      
      // 备份原JSON文件
      const backupPath = imagesDbPath + '.backup.' + Date.now();
      fs.copyFileSync(imagesDbPath, backupPath);
      console.log(`原JSON文件已备份到: ${backupPath}`);
    } catch (error) {
      console.error('JSON数据导入失败:', error);
    }
  }
}

// 保存图片记录 (使用SQLite)
function saveImagesDb() {
  // 该函数保留用于向后兼容，但实际操作已在addImageRecord中完成
  console.log('注意: saveImagesDb函数已迁移到SQLite，无需手动调用');
}

// 添加图片记录 (使用SQLite)
function addImageRecord(imageData) {
  try {
    imageDb.addImage(imageData);
  } catch (error) {
    console.error('添加图片记录到数据库失败:', error);
    throw error;
  }
}

// 删除图片记录 (使用SQLite)
function removeImageRecord(imagePath) {
  try {
    return imageDb.removeImage(imagePath);
  } catch (error) {
    console.error('从数据库删除图片记录失败:', error);
    throw error;
  }
}

// 初始化R2客户端
let r2Client = null;

function initR2Client() {
  if (config.storage.r2.enabled && config.storage.r2.accessKeyId && config.storage.r2.secretAccessKey && config.storage.r2.endpoint) {
    r2Client = new S3Client({
      region: config.storage.r2.region || 'auto',
      endpoint: config.storage.r2.endpoint,
      credentials: {
        accessKeyId: config.storage.r2.accessKeyId,
        secretAccessKey: config.storage.r2.secretAccessKey,
      },
    });
    console.log('R2客户端已初始化');
  } else {
    r2Client = null;
    console.log('R2配置不完整，使用本地存储');
  }
}

// 初始化时设置R2客户端
initR2Client();

// 检查R2是否可用
function isR2Available() {
  return r2Client && 
         config.storage.r2.enabled && 
         config.storage.r2.accessKeyId && 
         config.storage.r2.secretAccessKey && 
         config.storage.r2.endpoint && 
         config.storage.r2.bucket;
}

// 检查认证配置是否已重置
function isAuthReset(authConfig) {
  return (!authConfig.username || authConfig.username.trim() === '') &&
         (!authConfig.hashedPassword || authConfig.hashedPassword.trim() === '');
}

// 清理所有session文件
function clearAllSessions() {
  const sessionsDir = path.join(__dirname, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    try {
      const files = fs.readdirSync(sessionsDir);
      for (const file of files) {
        if (file.startsWith('sess_')) {
          fs.unlinkSync(path.join(sessionsDir, file));
        }
      }
      console.log('所有session文件已清理');
    } catch (error) {
      console.error('清理session文件时发生错误:', error);
    }
  }
}

// 监听配置文件变化
fs.watchFile(configPath, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    try {
      // 检查文件是否存在
      if (fs.existsSync(configPath)) {
        // 保存当前的API配置
        const currentApiConfig = config.api;
        const currentStorageConfig = config.storage;
        
        // 重新读取配置文件
        delete require.cache[configPath];
        const newConfig = require(configPath);
        
        // 检查认证信息是否被重置
        if (isAuthReset(newConfig.auth)) {
          console.log('检测到认证信息被重置');
          // 清理所有session文件
          clearAllSessions();
          // 重置认证信息，但保留其他配置
          config = {
            auth: {
              isConfigured: false,
              username: '',
              hashedPassword: '',
              salt: ''  // 为了安全，当认证信息重置时，也重置salt
            },
            api: currentApiConfig,  // 保留原有的API配置
            storage: currentStorageConfig  // 保留原有的存储配置
          };
          // 保存更新后的配置
          saveConfig();
          console.log('认证信息已重置，所有登录session已清理，其他配置保持不变');
        } else {
          // 如果认证信息没有被重置，直接使用新的配置
          config = newConfig;
          console.log('配置文件已更新');
          // 重新初始化R2客户端
          initR2Client();
        }
      } else {
        // 如果文件不存在，创建默认配置
        config = {
          auth: {
            isConfigured: false,
            username: '',
            hashedPassword: '',
            salt: ''
          },
          api: {
            enabled: true,
            tokens: [],
            defaultFormat: 'original'
          },
          storage: {
            type: 'local',
            r2: {
              enabled: false,
              accessKeyId: '',
              secretAccessKey: '',
              endpoint: '',
              bucket: '',
              region: 'auto',
              customDomain: ''
            }
          }
        };
        // 保存默认配置
        saveConfig();
        console.log('配置文件已重置为默认状态');
      }
    } catch (error) {
      console.error('更新配置文件时发生错误:', error);
    }
  }
});

// 保存配置文件的函数
function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// 密码加密相关函数
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

// R2上传函数
async function uploadToR2(fileBuffer, filename) {
  if (!r2Client || !config.storage.r2.bucket) {
    throw new Error('R2客户端未初始化或bucket未配置');
  }

  console.log(`开始上传到R2: ${filename}`);
  console.log(`文件大小: ${fileBuffer.length} bytes`);
  console.log(`Bucket: ${config.storage.r2.bucket}`);
  console.log(`Endpoint: ${config.storage.r2.endpoint}`);

  const uploadParams = {
    Bucket: config.storage.r2.bucket,
    Key: filename,
    Body: fileBuffer,
    ContentType: getContentType(filename),
  };

  console.log(`上传参数:`, {
    Bucket: uploadParams.Bucket,
    Key: uploadParams.Key,
    ContentType: uploadParams.ContentType,
    BodySize: uploadParams.Body.length
  });

  try {
    const command = new PutObjectCommand(uploadParams);
    const result = await r2Client.send(command);
    console.log(`R2上传成功:`, result);
    
    // 构建文件URL
    let fileUrl;
    if (config.storage.r2.customDomain) {
      fileUrl = `https://${config.storage.r2.customDomain}/${filename}`;
    } else {
      // 使用R2的标准公共URL格式
      // Endpoint格式通常是: https://account-id.r2.cloudflarestorage.com
      // 公共URL格式是: https://bucket.account-id.r2.cloudflarestorage.com/filename
      const endpointHost = config.storage.r2.endpoint.replace('https://', '').replace('http://', '');
      fileUrl = `https://${config.storage.r2.bucket}.${endpointHost}/${filename}`;
    }
    
    console.log(`生成的文件URL: ${fileUrl}`);
    return fileUrl;
  } catch (error) {
    console.error(`R2上传失败:`, error);
    throw error;
  }
}

// R2删除函数
async function deleteFromR2(filename) {
  if (!r2Client || !config.storage.r2.bucket) {
    throw new Error('R2客户端未初始化或bucket未配置');
  }

  const deleteParams = {
    Bucket: config.storage.r2.bucket,
    Key: filename,
  };

  const command = new DeleteObjectCommand(deleteParams);
  await r2Client.send(command);
}

// 获取文件的Content-Type
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

const app = express();
const port = process.env.PORT || 3000;

// 信任代理，支持反向代理（Nginx、Cloudflare等）
app.set('trust proxy', true);

// 创建一个函数来正确检测协议（支持反向代理）
function getProtocol(req) {
  // 检查各种可能的HTTPS标头
  if (req.secure || 
      req.get('x-forwarded-proto') === 'https' || 
      req.get('x-forwarded-ssl') === 'on' ||
      req.get('x-forwarded-scheme') === 'https') {
    return 'https';
  }
  
  // 特殊处理Cloudflare的CF-Visitor头
  const cfVisitor = req.get('cf-visitor');
  if (cfVisitor) {
    try {
      const visitor = JSON.parse(cfVisitor);
      if (visitor.scheme === 'https') {
        return 'https';
      }
    } catch (e) {
      // 忽略JSON解析错误，继续其他检查
    }
  }
  
  return 'http';
}

// 创建一个函数来构建正确的基础URL
function getBaseUrl(req) {
  const protocol = getProtocol(req);
  return `${protocol}://${req.get('host')}`;
}

// 配置 express 解析表单数据
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 配置 session 中间件（生产环境中请将 secret 设置为安全的随机串，并完善更多安全配置）
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, 'sessions'), // session 文件存储路径
    retries: 0, // 重试次数
    ttl: 30 * 24 * 60 * 60, // session 文件默认 TTL（秒），30天
    logFn: function() {} // 禁用日志输出
  }),
  secret: 'somesecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 生产环境中如果使用 HTTPS 请设置为 true
    httpOnly: true,
    maxAge: null // 默认为会话 cookie，具体过期时间在登录时设置
  }
}));

// 检查是否需要初始配置的中间件
function checkInitialSetup(req, res, next) {
  if (!config.auth.isConfigured && req.path !== '/setup' && req.path !== '/perform-setup') {
    return res.redirect('/setup');
  }
  next();
}

// 鉴权中间件，检测用户是否登录
function isAuthenticated(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
}

// API鉴权中间件，检测请求是否包含有效的API令牌
function apiAuthenticated(req, res, next) {
  const token = req.headers['x-api-token'] || req.query.token;
  
  if (!token) {
    return res.status(401).json({ success: false, message: '缺少API令牌' });
  }
  
  if (!config.api.enabled) {
    return res.status(403).json({ success: false, message: 'API功能未启用' });
  }
  
  const validToken = config.api.tokens.find(t => t.token === token);
  if (!validToken) {
    return res.status(401).json({ success: false, message: '无效的API令牌' });
  }
  
  // 将API令牌信息添加到请求对象中，以便后续使用
  req.apiToken = validToken;
  next();
}

// 公共静态资源（CSS、JS等）
// 注意：不再直接暴露 /uploads 目录，而是通过 /i 路由隐藏真实根目录
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
// 对于上传后的图片，设置静态资源路由，添加 AVIF MIME 类型支持
app.use('/i', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: function (res, filePath) {
    if (filePath.endsWith('.avif')) {
      res.setHeader('Content-Type', 'image/avif');
    }
  }
}));

// 使用内存存储，以便后续利用 sharp 进行图片转换
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedMimetypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (allowedMimetypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'), false);
    }
  }
});

// 确保目录存在的函数
function ensureDirExistence(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 确保 sessions 目录存在
const sessionsDir = path.join(__dirname, 'sessions');
ensureDirExistence(sessionsDir);

// 获取当前日期的年月日文件夹路径
function getYearMonthPath() {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return path.join(year, month, day);
}

// 递归获取目录下所有文件
function getAllFiles(dir, fileList = []) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        getAllFiles(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    });
  }
  return fileList;
}

// 清理空文件夹的递归函数
function cleanEmptyDirs(dir) {
  if (fs.existsSync(dir)) {
    let entries = fs.readdirSync(dir);
    
    // 先递归清理子目录
    entries.forEach(entry => {
      const fullPath = path.join(dir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        cleanEmptyDirs(fullPath);
      }
    });
    
    // 重新检查当前目录
    entries = fs.readdirSync(dir);
    if (entries.length === 0 && dir !== path.join(__dirname, 'uploads')) {
      // 不删除uploads根目录，只删除其子目录
      fs.rmdirSync(dir);
      console.log(`已删除空文件夹: ${dir}`);
    }
  }
}

// 生成API令牌的函数
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 合并数据库记录和文件系统扫描的图片列表
function mergeImagesFromDbAndFileSystem(req) {
  const baseUrl = getBaseUrl(req);
  let images = imageDb.getAllImages(); // 从SQLite数据库获取
  
  // 创建一个路径集合，用于检查哪些文件已经在数据库中
  const recordedPaths = new Set(images.map(img => img.path));
  
  // 扫描文件系统查找未记录的图片
  const uploadsDir = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const uploadedFiles = getAllFiles(uploadsDir);
    uploadedFiles.forEach(filePath => {
      const stats = fs.statSync(filePath);
      const relativePath = path.relative(uploadsDir, filePath);
      const normalizedPath = relativePath.replace(/\\/g, '/');
      
      // 只添加未在数据库中记录的图片
      if (!recordedPaths.has(normalizedPath)) {
        const filename = path.basename(filePath);
        const imageUrl = `${baseUrl}/i/${normalizedPath}`;
        
        images.push({
          filename: filename,
          path: normalizedPath,
          uploadTime: stats.mtime.toISOString(),
          fileSize: stats.size,
          storage: 'local',
          format: path.extname(filename).substring(1),
          url: imageUrl,
          htmlCode: `<img src="${imageUrl}" alt="${filename}" />`,
          markdownCode: `![${filename}](${imageUrl})`
        });
      }
    });
  }
  
  return images;
}

/* ---------------- 初始配置相关路由 ---------------- */

// 初始设置页面
app.get('/setup', (req, res) => {
  if (config.auth.isConfigured) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'views', 'setup.html'));
});

// 执行初始设置
app.post('/perform-setup', (req, res) => {
  if (config.auth.isConfigured) {
    return res.status(400).json({ success: false, message: '系统已经配置过了' });
  }

  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码都是必需的' });
  }

  const salt = generateSalt();
  const hashedPassword = hashPassword(password, salt);

  config.auth.username = username;
  config.auth.hashedPassword = hashedPassword;
  config.auth.salt = salt;
  config.auth.isConfigured = true;

  saveConfig();
  
  // 自动登录，初始设置完成后默认记住登录状态
  req.session.authenticated = true;
  req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
  console.log('初始设置完成，自动登录并设置 30 天过期时间');
  res.json({ success: true, message: '初始设置完成' });
});

/* ---------------- 登录相关路由 ---------------- */

// 登录页面
app.get('/login', checkInitialSetup, (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// 登录处理
app.post('/login', checkInitialSetup, (req, res) => {
  const { username, password, rememberMe } = req.body;
  const hashedPassword = hashPassword(password, config.auth.salt);
  
  if (username === config.auth.username && hashedPassword === config.auth.hashedPassword) {
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
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
});

// 注销
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('注销时销毁 session 出错:', err);
    } else {
      console.log('用户已注销，session 已销毁');
    }
    res.redirect('/login');
  });
});

// 检查认证状态API
app.get('/api/auth-status', (req, res) => {
  res.json({
    isConfigured: config.auth.isConfigured,
    isAuthenticated: !!req.session.authenticated
  });
});

// 受保护的首页（图床主页面）
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// 调试页面
app.get('/debug', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'debug.html'));
});

// HTTPS链接测试页面
app.get('/test-https', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'test-https.html'));
});

/* ---------------- 存储配置相关路由 ---------------- */

// 存储配置页面
app.get('/storage-config', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'storage-config.html'));
});

// 获取存储配置
app.get('/api/storage-config', isAuthenticated, (req, res) => {
  res.json({
    success: true,
    config: {
      type: config.storage.type,
      r2: {
        enabled: config.storage.r2.enabled,
        endpoint: config.storage.r2.endpoint,
        bucket: config.storage.r2.bucket,
        region: config.storage.r2.region,
        customDomain: config.storage.r2.customDomain,
        // 不返回敏感信息
        hasCredentials: !!(config.storage.r2.accessKeyId && config.storage.r2.secretAccessKey)
      }
    }
  });
});

// 更新存储配置
app.post('/api/storage-config', isAuthenticated, (req, res) => {
  const { type, r2 } = req.body;
  
  if (!['local', 'r2'].includes(type)) {
    return res.status(400).json({ success: false, message: '无效的存储类型' });
  }
  
  config.storage.type = type;
  
  if (r2) {
    // 只更新提供的字段
    if (r2.enabled !== undefined) config.storage.r2.enabled = r2.enabled;
    if (r2.accessKeyId !== undefined) config.storage.r2.accessKeyId = r2.accessKeyId;
    if (r2.secretAccessKey !== undefined) config.storage.r2.secretAccessKey = r2.secretAccessKey;
    if (r2.endpoint !== undefined) config.storage.r2.endpoint = r2.endpoint;
    if (r2.bucket !== undefined) config.storage.r2.bucket = r2.bucket;
    if (r2.region !== undefined) config.storage.r2.region = r2.region;
    if (r2.customDomain !== undefined) config.storage.r2.customDomain = r2.customDomain;
  }
  
  saveConfig();
  initR2Client(); // 重新初始化R2客户端
  
  res.json({ success: true, message: '存储配置已更新' });
});

// 调试接口：检查R2配置状态
app.get('/api/debug/r2-status', isAuthenticated, (req, res) => {
  const status = {
    storageType: config.storage.type,
    r2Config: {
      enabled: config.storage.r2.enabled,
      hasAccessKey: !!config.storage.r2.accessKeyId,
      hasSecretKey: !!config.storage.r2.secretAccessKey,
      endpoint: config.storage.r2.endpoint,
      bucket: config.storage.r2.bucket,
      region: config.storage.r2.region,
      customDomain: config.storage.r2.customDomain
    },
    clientStatus: {
      hasR2Client: !!r2Client,
      clientConfig: r2Client ? {
        region: r2Client.config.region,
        endpoint: r2Client.config.endpoint
      } : null
    }
  };
  
  res.json({
    success: true,
    status: status
  });
});

/* ---------------- 系统设置相关路由 ---------------- */

// 系统设置页面
app.get('/settings', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// 获取系统设置
app.get('/api/settings', isAuthenticated, (req, res) => {
  res.json({
    success: true,
    imageQuality: config.imageQuality || {
      webp: 80,
      avif: 75,
      pngOptimize: true
    }
  });
});

// 更新系统设置
app.post('/api/settings', isAuthenticated, (req, res) => {
  try {
    const { imageQuality } = req.body;
    
    // 更新图片质量设置
    if (imageQuality) {
      if (!config.imageQuality) {
        config.imageQuality = {};
      }
      
      if (imageQuality.webp !== undefined && imageQuality.webp >= 10 && imageQuality.webp <= 100) {
        config.imageQuality.webp = imageQuality.webp;
      }
      
      if (imageQuality.avif !== undefined && imageQuality.avif >= 10 && imageQuality.avif <= 100) {
        config.imageQuality.avif = imageQuality.avif;
      }
      
      if (imageQuality.pngOptimize !== undefined) {
        config.imageQuality.pngOptimize = imageQuality.pngOptimize;
      }
    }
    
    saveConfig();
    
    res.json({ 
      success: true, 
      message: '设置已保存',
      imageQuality: config.imageQuality
    });
  } catch (error) {
    console.error('保存设置失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '保存设置失败: ' + error.message 
    });
  }
});

/* ---------------- API管理相关路由 ---------------- */

// API管理页面
app.get('/api-management', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'api-management.html'));
});

// 获取所有API令牌
app.get('/api/tokens', isAuthenticated, (req, res) => {
  res.json({
    success: true, 
    enabled: config.api.enabled,
    tokens: config.api.tokens,
    defaultFormat: config.api.defaultFormat
  });
});

// 切换API启用状态
app.post('/api/toggle', isAuthenticated, (req, res) => {
  config.api.enabled = !config.api.enabled;
  saveConfig();
  res.json({
    success: true, 
    enabled: config.api.enabled
  });
});

// 设置API默认格式
app.post('/api/format', isAuthenticated, (req, res) => {
  const { format } = req.body;
  
  if (!['original', 'webp', 'avif'].includes(format)) {
    return res.status(400).json({ 
      success: false, 
      message: '无效的格式选项' 
    });
  }
  
  config.api.defaultFormat = format;
  saveConfig();
  
  res.json({
    success: true,
    format: format
  });
});

// 创建新的API令牌
app.post('/api/tokens', isAuthenticated, (req, res) => {
  const { name, expiresAt } = req.body;
  
  if (!name) {
    return res.status(400).json({ success: false, message: '令牌名称不能为空' });
  }
  
  const newToken = {
    id: Date.now().toString(),
    name: name,
    token: generateToken(),
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt || null
  };
  
  config.api.tokens.push(newToken);
  saveConfig();
  
  res.json({
    success: true,
    token: newToken
  });
});

// 删除API令牌
app.delete('/api/tokens/:id', isAuthenticated, (req, res) => {
  const tokenId = req.params.id;
  const tokenIndex = config.api.tokens.findIndex(t => t.id === tokenId);
  
  if (tokenIndex === -1) {
    return res.status(404).json({ success: false, message: '找不到指定的令牌' });
  }
  
  config.api.tokens.splice(tokenIndex, 1);
  saveConfig();
  
  res.json({
    success: true,
    message: '令牌已成功删除'
  });
});

/* ---------------- 上传与图片接口（需登录） ---------------- */

// 上传接口：处理图片上传、存储位置及格式转换，同时自动重命名，并在文件名上增加三位数的上传顺序定位
app.post('/upload', isAuthenticated, upload.array('images'), async (req, res) => {
  try {
    // format: "original", "webp", "avif"，默认 original
    const formatOption = req.body.format || 'original';
    
    let resultImages = [];
    // 获取年月日文件夹路径及基本 URL
    const yearMonthPath = getYearMonthPath();
    const baseUrl = getBaseUrl(req);
    // 设置相同的上传时间，确保同一批次上传的文件时间一致
    const uploadTime = new Date();
    
    // 遍历每个上传文件，使用上传列表中的顺序生成三位数定位
    // 由于前端已从后往前传输文件，这里需要反向计算orderIndex以保持正确的文件名顺序
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const orderIndex = (req.files.length - i).toString().padStart(3, '0');
      const ext = path.extname(file.originalname).toLowerCase();
      let outputFormat = '';
      let outputFilename = '';
      let fileBuffer = file.buffer;
      
      // 自动重命名：使用 16 位随机十六进制字符串作为文件名，再加上三位数定位
      const uniqueId = crypto.randomBytes(8).toString('hex');
      
      // 获取原始格式
      const originalFormat = ext.replace('.', '').toLowerCase();
      
      // 根据上传选项进行图片格式转换与重命名
      if (formatOption === 'webp') {
        outputFormat = 'webp';
        outputFilename = uniqueId + orderIndex + '.webp';
        // 只有当原始格式不是webp时才进行转换
        if (originalFormat !== 'webp') {
          const quality = config.imageQuality?.webp || 80;
          fileBuffer = await sharp(file.buffer).toFormat('webp', { quality }).toBuffer();
        }
      } else if (formatOption === 'avif') {
        outputFormat = 'avif';
        outputFilename = uniqueId + orderIndex + '.avif';
        // 只有当原始格式不是avif时才进行转换
        if (originalFormat !== 'avif') {
          const quality = config.imageQuality?.avif || 75;
          fileBuffer = await sharp(file.buffer).toFormat('avif', { quality }).toBuffer();
        }
      } else {
        // 保持原始格式，但可能需要优化
        outputFormat = originalFormat;
        outputFilename = uniqueId + orderIndex + ext;
        
        // 对于PNG格式，应用优化设置
        if (originalFormat === 'png' && config.imageQuality?.pngOptimize !== false) {
          fileBuffer = await sharp(file.buffer).png({ 
            compressionLevel: 6,  // 0-9，6是一个好的平衡点
            adaptiveFiltering: true,
            palette: true  // 尝试使用调色板模式以减小文件大小
          }).toBuffer();
        }
        // 其他格式保持原样，不进行处理
      }
      
      let imageUrl = '';
      let storage = 'local';
      let relativePath = path.join(yearMonthPath, outputFilename);

      // 检查是否使用R2存储
      if (config.storage.type === 'r2' && config.storage.r2.enabled && r2Client) {
        console.log(`尝试使用R2存储上传文件: ${outputFilename}`);
        console.log(`当前存储配置:`, {
          type: config.storage.type,
          r2Enabled: config.storage.r2.enabled,
          hasR2Client: !!r2Client,
          bucket: config.storage.r2.bucket,
          endpoint: config.storage.r2.endpoint
        });
        
        try {
          const r2Path = relativePath.replace(/\\/g, '/'); // 确保使用正斜杠
          console.log(`R2文件路径: ${r2Path}`);
          imageUrl = await uploadToR2(fileBuffer, r2Path);
          storage = 'r2';
          console.log(`R2上传成功，图片URL: ${imageUrl}`);
        } catch (r2Error) {
          console.error('R2上传失败，回退到本地存储:', r2Error);
          console.error('错误详情:', r2Error.message);
          console.error('错误堆栈:', r2Error.stack);
          
          // 回退到本地存储
          const uploadDir = path.join(__dirname, 'uploads', yearMonthPath);
          ensureDirExistence(uploadDir);
          const destination = path.join(uploadDir, outputFilename);
          fs.writeFileSync(destination, fileBuffer);
          fs.utimesSync(destination, uploadTime, uploadTime);
          const urlPath = relativePath.replace(/\\/g, '/');
          imageUrl = `${baseUrl}/i/${urlPath}`;
          console.log(`回退到本地存储成功，图片URL: ${imageUrl}`);
        }
      } else {
        console.log('使用本地存储');
        console.log(`存储配置检查:`, {
          storageType: config.storage.type,
          r2Enabled: config.storage.r2.enabled,
          hasR2Client: !!r2Client
        });
        
        // 存储到uploads目录
        const uploadDir = path.join(__dirname, 'uploads', yearMonthPath);
        ensureDirExistence(uploadDir);
        const destination = path.join(uploadDir, outputFilename);
        fs.writeFileSync(destination, fileBuffer);
        fs.utimesSync(destination, uploadTime, uploadTime);
        const urlPath = relativePath.replace(/\\/g, '/');
        imageUrl = `${baseUrl}/i/${urlPath}`;
        console.log(`本地存储成功，图片URL: ${imageUrl}`);
      }
      
      // 获取文件大小信息
      const fileSize = fileBuffer.length;
      
      const imageData = {
        filename: outputFilename,
        path: relativePath.replace(/\\/g, '/'),
        uploadTime: uploadTime.toISOString(),
        fileSize: fileSize,
        storage: storage,
        format: outputFormat,
        url: imageUrl,
        htmlCode: `<img src="${imageUrl}" alt="${outputFilename}" />`,
        markdownCode: `![](${imageUrl})`
      };
      
      // 添加到图片记录
      addImageRecord(imageData);
      
      resultImages.push({
        ...imageData,
        uploadTime: uploadTime.toLocaleString() // 返回本地化的时间字符串
      });
    }
    
    res.json({
      success: true,
      images: resultImages
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ---------------- API上传接口 ---------------- */

// API上传接口：处理图片上传，并将图片存储在api专用目录中
app.post('/api/upload', apiAuthenticated, upload.array('images'), async (req, res) => {
  try {
    // 优先使用请求中指定的格式，如果没有则使用默认格式设置
    const formatOption = req.query.format || config.api.defaultFormat || 'original';
    
    // 获取存储策略参数，支持通过API参数指定存储方式
    // 可选值: 'r2', 'local', 'auto'(跟随全局设置)
    const storageParam = req.query.storage || req.body.storage || 'auto';
    
    let resultImages = [];
    // 获取年月日文件夹路径及基本 URL
    const yearMonthPath = path.join('api', getYearMonthPath());
    const baseUrl = getBaseUrl(req);
    // 设置相同的上传时间，确保同一批次上传的文件时间一致
    const uploadTime = new Date();
    
    // 遍历每个上传文件，使用上传列表中的顺序生成三位数定位
    // 由于前端已从后往前传输文件，这里需要反向计算orderIndex以保持正确的文件名顺序
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const orderIndex = (req.files.length - i).toString().padStart(3, '0');
      const ext = path.extname(file.originalname).toLowerCase();
      let outputFormat = '';
      let outputFilename = '';
      let fileBuffer = file.buffer;
      
      // 自动重命名：使用 16 位随机十六进制字符串作为文件名，再加上三位数定位
      const uniqueId = crypto.randomBytes(8).toString('hex');
      
      // 获取原始格式
      const originalFormat = ext.replace('.', '').toLowerCase();
      
      // 根据上传选项进行图片格式转换与重命名
      if (formatOption === 'webp') {
        outputFormat = 'webp';
        outputFilename = uniqueId + orderIndex + '.webp';
        // 只有当原始格式不是webp时才进行转换
        if (originalFormat !== 'webp') {
          const quality = config.imageQuality?.webp || 80;
          fileBuffer = await sharp(file.buffer).toFormat('webp', { quality }).toBuffer();
        }
      } else if (formatOption === 'avif') {
        outputFormat = 'avif';
        outputFilename = uniqueId + orderIndex + '.avif';
        // 只有当原始格式不是avif时才进行转换
        if (originalFormat !== 'avif') {
          const quality = config.imageQuality?.avif || 75;
          fileBuffer = await sharp(file.buffer).toFormat('avif', { quality }).toBuffer();
        }
      } else {
        // 保持原始格式，但可能需要优化
        outputFormat = originalFormat;
        outputFilename = uniqueId + orderIndex + ext;
        
        // 对于PNG格式，应用优化设置
        if (originalFormat === 'png' && config.imageQuality?.pngOptimize !== false) {
          fileBuffer = await sharp(file.buffer).png({ 
            compressionLevel: 6,  // 0-9，6是一个好的平衡点
            adaptiveFiltering: true,
            palette: true  // 尝试使用调色板模式以减小文件大小
          }).toBuffer();
        }
        // 其他格式保持原样，不进行处理
      }
      
      let imageUrl = '';
      let storage = 'local';
      let relativePath = path.join(yearMonthPath, outputFilename);

      // 决定使用哪种存储策略
      let shouldUseR2 = false;
      let storageError = null;
      
      if (storageParam === 'r2') {
        // 强制使用R2存储，检查R2是否可用
        shouldUseR2 = true;
        if (!isR2Available()) {
          storageError = 'R2存储不可用：请检查R2配置或联系管理员';
        }
      } else if (storageParam === 'local') {
        // 强制使用本地存储
        shouldUseR2 = false;
      } else {
        // auto: 跟随全局配置
        shouldUseR2 = config.storage.type === 'r2' && isR2Available();
      }

      // 如果指定了R2存储但不可用，返回错误
      if (storageParam === 'r2' && storageError) {
        throw new Error(storageError);
      }

      // 检查是否使用R2存储
      if (shouldUseR2 && isR2Available()) {
        try {
          const r2Path = relativePath.replace(/\\/g, '/'); // 确保使用正斜杠
          imageUrl = await uploadToR2(fileBuffer, r2Path);
          storage = 'r2';
          console.log(`API上传成功使用R2存储: ${r2Path}`);
        } catch (r2Error) {
          console.error('R2上传失败:', r2Error);
          
          // 如果是强制使用R2存储，不回退到本地存储
          if (storageParam === 'r2') {
            throw new Error(`R2上传失败: ${r2Error.message}`);
          }
          
          // 否则回退到本地存储
          console.log('回退到本地存储');
          const uploadDir = path.join(__dirname, 'uploads', yearMonthPath);
          ensureDirExistence(uploadDir);
          const destination = path.join(uploadDir, outputFilename);
          fs.writeFileSync(destination, fileBuffer);
          fs.utimesSync(destination, uploadTime, uploadTime);
          const urlPath = relativePath.replace(/\\/g, '/');
          imageUrl = `${baseUrl}/i/${urlPath}`;
          console.log(`API上传回退到本地存储: ${urlPath}`);
        }
      } else {
        // 存储到api/uploads目录
        const uploadDir = path.join(__dirname, 'uploads', yearMonthPath);
        ensureDirExistence(uploadDir);
        const destination = path.join(uploadDir, outputFilename);
        fs.writeFileSync(destination, fileBuffer);
        fs.utimesSync(destination, uploadTime, uploadTime);
        const urlPath = relativePath.replace(/\\/g, '/');
        imageUrl = `${baseUrl}/i/${urlPath}`;
        console.log(`API上传使用本地存储: ${urlPath}`);
      }
      
      // 获取文件大小信息
      const fileSize = fileBuffer.length;
      
      const imageData = {
        filename: outputFilename,
        path: relativePath.replace(/\\/g, '/'),
        uploadTime: uploadTime.toISOString(),
        fileSize: fileSize,
        storage: storage,
        format: outputFormat,
        url: imageUrl,
        htmlCode: `<img src="${imageUrl}" alt="${outputFilename}" />`,
        markdownCode: `![](${imageUrl})`
      };
      
      // 添加到图片记录
      addImageRecord(imageData);
      
      resultImages.push({
        ...imageData,
        uploadTime: uploadTime.toLocaleString() // 返回本地化的时间字符串
      });
    }
    
    // 根据PicGo等客户端的需求，返回不同格式的响应
    if (req.query.picgo === 'true') {
      // PicGo兼容格式
      return res.json({
        success: true,
        result: resultImages.map(img => img.url)
      });
    }
    
    res.json({
      success: true,
      images: resultImages
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 接口：获取所有图片（支持limit参数和存储类型过滤）
app.get('/images', isAuthenticated, async (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  const storageType = req.query.storage; // 可以是 'local', 'r2', 或不设置（获取所有）
  
  // 合并数据库记录和文件系统中的图片
  let images = mergeImagesFromDbAndFileSystem(req);
  
  // 根据存储类型过滤
  if (storageType) {
    images = images.filter(img => img.storage === storageType);
  }
  
  // 按上传时间排序（最新的在前）
  images.sort((a, b) => {
    const dateA = new Date(a.uploadTime);
    const dateB = new Date(b.uploadTime);
    return dateB - dateA;
  });
  
  if (limit > 0) {
    images = images.slice(0, limit);
  }
  
  // 转换时间格式为本地化字符串
  images = images.map(img => ({
    ...img,
    uploadTime: new Date(img.uploadTime).toLocaleString()
  }));
  
  res.json({ success: true, images: images });
});

// 分页获取图片（支持存储类型过滤）
app.get('/images/paged', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const storageType = req.query.storage; // 可以是 'local', 'r2', 或不设置（获取所有）
    
    // 使用SQLite分页查询获取更好的性能
    const result = imageDb.getImagesPaged(page, limit, storageType);
    
    // 对于已经在数据库中的图片，直接返回结果
    let { images, pagination } = result;
    
    // 如果没有存储类型过滤，需要合并文件系统中未记录的图片
    if (!storageType) {
      const baseUrl = getBaseUrl(req);
      const recordedPaths = new Set(images.map(img => img.path));
      
      // 扫描文件系统查找未记录的图片
      const uploadsDir = path.join(__dirname, 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const uploadedFiles = getAllFiles(uploadsDir);
        const unrecordedImages = [];
        
        uploadedFiles.forEach(filePath => {
          const stats = fs.statSync(filePath);
          const relativePath = path.relative(uploadsDir, filePath);
          const normalizedPath = relativePath.replace(/\\/g, '/');
          
          // 只添加未在数据库中记录的图片
          if (!recordedPaths.has(normalizedPath)) {
            const filename = path.basename(filePath);
            const imageUrl = `${baseUrl}/i/${normalizedPath}`;
            
            unrecordedImages.push({
              filename: filename,
              path: normalizedPath,
              uploadTime: stats.mtime.toISOString(),
              fileSize: stats.size,
              storage: 'local',
              format: path.extname(filename).substring(1),
              url: imageUrl,
              htmlCode: `<img src="${imageUrl}" alt="${filename}" />`,
              markdownCode: `![${filename}](${imageUrl})`
            });
          }
        });
        
        // 如果有未记录的图片，需要重新合并并分页
        if (unrecordedImages.length > 0) {
          const allImages = [...images, ...unrecordedImages];
          allImages.sort((a, b) => {
            const dateA = new Date(a.uploadTime);
            const dateB = new Date(b.uploadTime);
            return dateB - dateA;
          });
          
          const totalImages = allImages.length;
          const totalPages = Math.ceil(totalImages / limit);
          const startIndex = (page - 1) * limit;
          const endIndex = Math.min(startIndex + limit, totalImages);
          
          images = allImages.slice(startIndex, endIndex);
          pagination = {
            total: totalImages,
            page: page,
            limit: limit,
            totalPages: totalPages
          };
        }
      }
    }
    
    // 转换时间格式为本地化字符串
    const pagedImages = images.map(img => ({
      ...img,
      uploadTime: new Date(img.uploadTime).toLocaleString()
    }));
    
    res.json({
      success: true,
      images: pagedImages,
      pagination: pagination
    });
  } catch (error) {
    console.error('分页获取图片失败:', error);
    res.status(500).json({ success: false, message: `获取图片列表失败: ${error.message}` });
  }
});

// 获取图片存储统计信息
app.get('/api/storage-stats', isAuthenticated, async (req, res) => {
  try {
    // 使用SQLite获取统计信息，性能更好
    const stats = imageDb.getStorageStats();
    
    // 检查文件系统中未记录的图片
    const images = imageDb.getAllImages();
    const recordedPaths = new Set(images.map(img => img.path));
    
    const uploadsDir = path.join(__dirname, 'uploads');
    let unrecordedCount = 0;
    
    if (fs.existsSync(uploadsDir)) {
      const uploadedFiles = getAllFiles(uploadsDir);
      unrecordedCount = uploadedFiles.filter(filePath => {
        const relativePath = path.relative(uploadsDir, filePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');
        return !recordedPaths.has(normalizedPath);
      }).length;
    }
    
    // 更新统计信息包含未记录的图片
    const finalStats = {
      total: stats.total + unrecordedCount,
      local: stats.local + unrecordedCount, // 文件系统中的图片都是本地存储
      r2: stats.r2
    };
    
    res.json({ success: true, stats: finalStats });
  } catch (error) {
    console.error('获取存储统计失败:', error);
    res.status(500).json({ success: false, message: `获取存储统计失败: ${error.message}` });
  }
});

// 图片库页面路由
app.get('/gallery', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'gallery.html'));
});

// 迁移工具页面路由
app.get('/migrate', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'migrate.html'));
});

// 系统状态API
app.get('/api/system-status', isAuthenticated, (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    
    // 统计SQLite数据库中的图片记录
    const dbStatus = imageDb.getStatus();
    const dbImageCount = dbStatus.dbImageCount;
    
    // 统计文件系统中的图片
    let fsImageCount = 0;
    const uploadsDir = path.join(__dirname, 'uploads');
    
    if (fs.existsSync(uploadsDir)) {
      const uploadedFiles = getAllFiles(uploadsDir);
      fsImageCount = uploadedFiles.length;
    }
    
    // 计算需要迁移的图片数量
    const images = imageDb.getAllImages();
    const recordedPaths = new Set(images.map(img => img.path));
    let needMigrationCount = 0;
    
    if (fs.existsSync(uploadsDir)) {
      const uploadedFiles = getAllFiles(uploadsDir);
      uploadedFiles.forEach(filePath => {
        const relativePath = path.relative(uploadsDir, filePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        if (!recordedPaths.has(normalizedPath)) {
          needMigrationCount++;
        }
      });
    }
    
    res.json({
      success: true,
      status: {
        dbImageCount: dbImageCount,
        fsImageCount: fsImageCount,
        needMigrationCount: needMigrationCount,
        dbPath: dbStatus.dbPath,
        dbConnected: dbStatus.isConnected,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('获取系统状态失败:', error);
    res.status(500).json({ success: false, message: `获取系统状态失败: ${error.message}` });
  }
});

/* ---------------- 图片删除API ---------------- */

// 删除图片API（支持单张或多张删除）
app.post('/api/delete', isAuthenticated, async (req, res) => {
  try {
    let images = req.body.images;
    if (!Array.isArray(images)) {
      return res.status(400).json({ success: false, message: '无效的请求格式.' });
    }
    
    for (let image of images) {
      if (!image.storage || !image.path) continue;
      
      if (image.storage === 'local') {
        const filePath = path.join(__dirname, 'uploads', image.path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        } else {
          console.warn("文件不存在: ", filePath);
        }
      } else if (image.storage === 'r2') {
        try {
          await deleteFromR2(image.path);
          console.log("R2文件已删除: ", image.path);
        } catch (error) {
          console.error("R2文件删除失败: ", image.path, error);
        }
      }
      
      // 从图片记录中删除
      removeImageRecord(image.path);
    }
    
    // 在删除图片后清理空文件夹
    cleanEmptyDirs(path.join(__dirname, 'uploads'));
    
    res.json({ success: true, message: '图片删除成功.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 测试R2连接
app.post('/api/test-r2', isAuthenticated, async (req, res) => {
  try {
    if (!config.storage.r2.enabled) {
      return res.status(400).json({ success: false, message: 'R2存储未启用' });
    }
    
    if (!r2Client) {
      return res.status(400).json({ success: false, message: 'R2客户端未初始化，请检查配置' });
    }
    
    // 创建一个测试文件
    const testFilename = `test-${Date.now()}.txt`;
    const testBuffer = Buffer.from('This is a test file for R2 connection');
    
    console.log(`开始R2连接测试，上传文件: ${testFilename}`);
    await uploadToR2(testBuffer, testFilename);
    
    // 测试完成后删除测试文件
    try {
      await deleteFromR2(testFilename);
      console.log(`测试文件删除成功: ${testFilename}`);
    } catch (deleteError) {
      console.log('删除测试文件失败（可忽略）:', deleteError.message);
    }
    
    res.json({ success: true, message: 'R2连接测试成功！请确保Bucket已设置为公开访问。' });
  } catch (error) {
    console.error('R2连接测试失败:', error);
    res.status(500).json({ success: false, message: `R2连接测试失败: ${error.message}` });
  }
});

// 迁移现有图片到数据库记录
app.post('/api/migrate-images', isAuthenticated, async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    
    // 创建一个路径集合，用于检查哪些文件已经在数据库中
    const images = imageDb.getAllImages();
    const recordedPaths = new Set(images.map(img => img.path));
    
    let migratedCount = 0;
    let errorCount = 0;
    const uploadsDir = path.join(__dirname, 'uploads');
    
    if (fs.existsSync(uploadsDir)) {
      const uploadedFiles = getAllFiles(uploadsDir);
      
      // 准备批量插入的数据
      const imagesToMigrate = [];
      
      uploadedFiles.forEach(filePath => {
        const stats = fs.statSync(filePath);
        const relativePath = path.relative(uploadsDir, filePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        // 只添加未在数据库中记录的图片
        if (!recordedPaths.has(normalizedPath)) {
          const filename = path.basename(filePath);
          const imageUrl = `${baseUrl}/i/${normalizedPath}`;
          
          const imageData = {
            filename: filename,
            path: normalizedPath,
            uploadTime: stats.mtime.toISOString(),
            fileSize: stats.size,
            storage: 'local',
            format: path.extname(filename).substring(1),
            url: imageUrl,
            htmlCode: `<img src="${imageUrl}" alt="${filename}" />`,
            markdownCode: `![${filename}](${imageUrl})`
          };
          
          imagesToMigrate.push(imageData);
        }
      });
      
      // 批量添加到SQLite数据库
      for (const imageData of imagesToMigrate) {
        try {
          imageDb.addImage(imageData);
          migratedCount++;
        } catch (error) {
          console.error('迁移图片失败:', imageData.path, error.message);
          errorCount++;
        }
      }
    }
    
    let message = `迁移完成！共添加了 ${migratedCount} 张图片到数据库记录中。`;
    if (errorCount > 0) {
      message += ` ${errorCount} 张图片迁移失败。`;
    }
    
    res.json({ 
      success: true, 
      message: message,
      migratedCount: migratedCount,
      errorCount: errorCount
    });
  } catch (error) {
    console.error('图片迁移失败:', error);
    res.status(500).json({ success: false, message: `图片迁移失败: ${error.message}` });
  }
});

// 数据库备份API - 将SQLite数据导出为JSON
app.post('/api/backup-database', isAuthenticated, async (req, res) => {
  try {
    const backupPath = path.join(__dirname, `images_backup_${Date.now()}.json`);
    const count = imageDb.exportToJson(backupPath);
    
    res.json({
      success: true,
      message: `数据库备份成功！共备份了 ${count} 条记录。`,
      backupPath: path.basename(backupPath),
      recordCount: count
    });
  } catch (error) {
    console.error('数据库备份失败:', error);
    res.status(500).json({ success: false, message: `数据库备份失败: ${error.message}` });
  }
});

// 手动导入JSON数据到SQLite
app.post('/api/import-json', isAuthenticated, async (req, res) => {
  try {
    const jsonPath = path.join(__dirname, 'images.json');
    
    if (!fs.existsSync(jsonPath)) {
      return res.status(400).json({ success: false, message: 'images.json文件不存在' });
    }
    
    const result = imageDb.importFromJson(jsonPath);
    
    res.json({
      success: true,
      message: `JSON数据导入完成！导入${result.imported}条，跳过${result.skipped}条，错误${result.errors}条。`,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors
    });
  } catch (error) {
    console.error('JSON数据导入失败:', error);
    res.status(500).json({ success: false, message: `JSON数据导入失败: ${error.message}` });
  }
});

// 数据库状态详情API
app.get('/api/database-status', isAuthenticated, (req, res) => {
  try {
    const status = imageDb.getStatus();
    const stats = imageDb.getStorageStats();
    
    res.json({
      success: true,
      database: {
        ...status,
        storageStats: stats
      }
    });
  } catch (error) {
    console.error('获取数据库状态失败:', error);
    res.status(500).json({ success: false, message: `获取数据库状态失败: ${error.message}` });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// 优雅关闭处理
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  imageDb.close();
  console.log('数据库连接已关闭');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  imageDb.close();
  console.log('数据库连接已关闭');
  process.exit(0);
});