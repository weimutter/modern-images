const fs = require('fs');
const path = require('path');

function cleanEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;

  let entries = fs.readdirSync(dir);

  entries.forEach(entry => {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      cleanEmptyDirs(fullPath);
    }
  });

  entries = fs.readdirSync(dir);
  if (entries.length === 0 && dir !== path.join(process.cwd(), 'uploads')) {
    fs.rmdirSync(dir);
    console.log(`已删除空文件夹: ${dir}`);
  }
}

function invalidateFileSystemCache(fsCache) {
  if (!fsCache) return;
  fsCache.lastScan = 0;
  fsCache.files = [];
}

async function removeImageRecord(imageDb, imagePath) {
  try {
    return await imageDb.removeImage(imagePath);
  } catch (error) {
    console.error('从数据库删除图片记录失败:', error);
    throw error;
  }
}

module.exports = {
  cleanEmptyDirs,
  invalidateFileSystemCache,
  removeImageRecord
};
