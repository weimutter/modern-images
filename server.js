/**
 * 图床系统 - 服务器入口文件
 * 现代化模块架构重构版本
 */

// 首先加载环境变量
require('dotenv').config();

// 导入核心模块
const ImageDatabase = require('./database');

// 导入配置和服务
const ConfigLoader = require('./src/config/config-loader');
const R2StorageService = require('./src/services/r2-storage');
const SessionStoreService = require('./src/services/session-store');
const DatabaseInitializer = require('./src/services/db-initializer');

// 导入Express应用创建器
const createApp = require('./src/app');

// File system cache to avoid repeated scans
const fileSystemCache = {
  lastScan: 0,
  files: [],
  cacheTimeout: 60000 // 1 minute cache
};

// Performance counters
const performanceMetrics = {
  uploadCount: 0,
  processingTime: [],
  memoryUsage: [],
  lastCleanup: Date.now()
};

// ============= 主启动函数 =============

let server = null;

async function startServer() {
  // 初始化PostgreSQL数据库
  const imageDb = new ImageDatabase();

  // 先连接数据库，再启动 HTTP 服务
  try {
    await imageDb.init();
  } catch (err) {
    console.error('数据库初始化失败:', err.message);
    console.log('服务将继续运行，但数据库功能可能不可用');
  }

  // 初始化其他服务
  const configLoader = new ConfigLoader();
  const r2StorageService = new R2StorageService();
  const sessionStoreService = new SessionStoreService();
  const dbInitializer = new DatabaseInitializer(imageDb);

  // 初始化数据库（导入JSON、恢复备份等）
  try {
    await dbInitializer.initialize();
  } catch (err) {
    console.error('数据库数据初始化失败:', err.message);
  }

  // 启动自动备份（如果启用）
  if (process.env.AUTO_BACKUP_ENABLED === 'true') {
    const intervalHours = parseInt(process.env.AUTO_BACKUP_INTERVAL_HOURS) || 24;
    dbInitializer.startAutoBackup(intervalHours);
  }

  // 创建Express应用
  const app = createApp({
    configLoader,
    imageDb,
    r2StorageService,
    sessionStoreService,
    fileSystemCache,
    performanceMetrics
  });

  // 启动服务器
  const port = process.env.PORT || 3000;

  server = app.listen(port, () => {
    console.log(`========================================`);
    console.log(`图床系统已启动`);
    console.log(`端口: ${port}`);
    console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`数据库: ${imageDb.isConnected() ? '已连接' : '未连接'}`);
    console.log(`存储: ${process.env.STORAGE_TYPE || 'local'}`);
    if (r2StorageService.isAvailable()) {
      console.log(`R2存储: 已启用`);
    }
    console.log(`========================================`);
  });

  // ============= 优雅关闭 =============

  async function gracefulShutdown(signal) {
    console.log(`收到${signal}信号，正在优雅关闭服务器...`);

    // 1. 停止接受新连接
    if (server) {
      server.close(() => {
        console.log('HTTP 服务器已关闭');
      });
    }

    // 2. 关闭数据库连接
    try {
      await imageDb.close();
      console.log('数据库连接已关闭');
    } catch (err) {
      console.error('关闭数据库连接失败:', err.message);
    }

    // 3. 超时强制退出
    setTimeout(() => {
      console.error('优雅关闭超时，强制退出');
      process.exit(1);
    }, 10000).unref();

    process.exit(0);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return { app, server };
}

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

function createAppAndServices() {
  // 初始化PostgreSQL数据库
  const imageDb = new ImageDatabase();

  const configLoader = new ConfigLoader();
  const r2StorageService = new R2StorageService();
  const sessionStoreService = new SessionStoreService();
  const dbInitializer = new DatabaseInitializer(imageDb);

  const app = createApp({
    configLoader,
    imageDb,
    r2StorageService,
    sessionStoreService,
    fileSystemCache,
    performanceMetrics
  });

  return {
    app,
    imageDb,
    r2StorageService,
    sessionStoreService,
    configLoader,
    dbInitializer
  };
}

module.exports = {
  createAppAndServices,
  startServer
};

if (require.main === module) {
  startServer().catch(err => {
    console.error('服务器启动失败:', err);
    process.exit(1);
  });
}
