const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class ImageDatabase {
  constructor(dbPath = 'images.db') {
    this.dbPath = dbPath;
    this.db = null;
    this.init();
  }

  init() {
    try {
      // 创建或打开数据库
      this.db = new Database(this.dbPath);
      
      // 启用WAL模式以提高并发性能
      this.db.pragma('journal_mode = WAL');
      
      // 创建表结构
      this.createTables();
      
      console.log('SQLite数据库初始化成功');
    } catch (error) {
      console.error('SQLite数据库初始化失败:', error);
      throw error;
    }
  }

  createTables() {
    const createImagesTable = `
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        upload_time TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        storage TEXT NOT NULL DEFAULT 'local',
        format TEXT NOT NULL,
        url TEXT NOT NULL,
        html_code TEXT NOT NULL,
        markdown_code TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_images_path ON images(path)',
      'CREATE INDEX IF NOT EXISTS idx_images_upload_time ON images(upload_time)',
      'CREATE INDEX IF NOT EXISTS idx_images_storage ON images(storage)',
      'CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at)'
    ];

    this.db.exec(createImagesTable);
    createIndexes.forEach(indexSql => {
      this.db.exec(indexSql);
    });
  }

  // 添加图片记录
  addImage(imageData) {
    try {
      const insert = this.db.prepare(`
        INSERT INTO images (filename, path, upload_time, file_size, storage, format, url, html_code, markdown_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = insert.run(
        imageData.filename,
        imageData.path,
        imageData.uploadTime,
        imageData.fileSize,
        imageData.storage,
        imageData.format,
        imageData.url,
        imageData.htmlCode,
        imageData.markdownCode
      );
      
      return result.lastInsertRowid;
    } catch (error) {
      console.error('添加图片记录失败:', error);
      throw error;
    }
  }

  // 删除图片记录
  removeImage(imagePath) {
    try {
      const deleteStmt = this.db.prepare('DELETE FROM images WHERE path = ?');
      const result = deleteStmt.run(imagePath);
      return result.changes > 0;
    } catch (error) {
      console.error('删除图片记录失败:', error);
      throw error;
    }
  }

  // 获取所有图片
  getAllImages(limit = null, storageType = null) {
    try {
      let sql = 'SELECT * FROM images';
      const params = [];
      
      if (storageType) {
        sql += ' WHERE storage = ?';
        params.push(storageType);
      }
      
      sql += ' ORDER BY upload_time DESC';
      
      if (limit && limit > 0) {
        sql += ' LIMIT ?';
        params.push(limit);
      }
      
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      
      // 转换为原有格式
      return rows.map(row => ({
        filename: row.filename,
        path: row.path,
        uploadTime: row.upload_time,
        fileSize: row.file_size,
        storage: row.storage,
        format: row.format,
        url: row.url,
        htmlCode: row.html_code,
        markdownCode: row.markdown_code,
        _id: row.id
      }));
    } catch (error) {
      console.error('获取图片列表失败:', error);
      throw error;
    }
  }

  // 分页获取图片
  getImagesPaged(page = 1, limit = 50, storageType = null) {
    try {
      let countSql = 'SELECT COUNT(*) as total FROM images';
      let dataSql = 'SELECT * FROM images';
      const params = [];
      
      if (storageType) {
        countSql += ' WHERE storage = ?';
        dataSql += ' WHERE storage = ?';
        params.push(storageType);
      }
      
      // 获取总数
      const countStmt = this.db.prepare(countSql);
      const { total } = countStmt.get(...params);
      
      // 获取分页数据
      dataSql += ' ORDER BY upload_time DESC LIMIT ? OFFSET ?';
      const offset = (page - 1) * limit;
      const dataStmt = this.db.prepare(dataSql);
      const rows = dataStmt.all(...params, limit, offset);
      
      // 转换为原有格式
      const images = rows.map(row => ({
        filename: row.filename,
        path: row.path,
        uploadTime: row.upload_time,
        fileSize: row.file_size,
        storage: row.storage,
        format: row.format,
        url: row.url,
        htmlCode: row.html_code,
        markdownCode: row.markdown_code,
        _id: row.id
      }));
      
      return {
        images,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('分页获取图片失败:', error);
      throw error;
    }
  }

  // 根据路径查找图片
  findImageByPath(imagePath) {
    try {
      const stmt = this.db.prepare('SELECT * FROM images WHERE path = ?');
      const row = stmt.get(imagePath);
      
      if (row) {
        return {
          filename: row.filename,
          path: row.path,
          uploadTime: row.upload_time,
          fileSize: row.file_size,
          storage: row.storage,
          format: row.format,
          url: row.url,
          htmlCode: row.html_code,
          markdownCode: row.markdown_code,
          _id: row.id
        };
      }
      return null;
    } catch (error) {
      console.error('查找图片失败:', error);
      throw error;
    }
  }

  // 获取存储统计
  getStorageStats() {
    try {
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM images');
      const localStmt = this.db.prepare('SELECT COUNT(*) as count FROM images WHERE storage = ?');
      const r2Stmt = this.db.prepare('SELECT COUNT(*) as count FROM images WHERE storage = ?');
      
      const total = totalStmt.get().count;
      const local = localStmt.get('local').count;
      const r2 = r2Stmt.get('r2').count;
      
      return { total, local, r2 };
    } catch (error) {
      console.error('获取存储统计失败:', error);
      throw error;
    }
  }

  // 从JSON文件导入数据
  importFromJson(jsonPath) {
    try {
      if (!fs.existsSync(jsonPath)) {
        console.log('JSON文件不存在，跳过导入');
        return { imported: 0, skipped: 0, errors: 0 };
      }

      const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (!Array.isArray(jsonData)) {
        throw new Error('JSON文件格式无效');
      }

      let imported = 0;
      let skipped = 0;
      let errors = 0;

      // 使用事务批量插入
      const insertMany = this.db.transaction((images) => {
        for (const image of images) {
          try {
            // 检查是否已存在
            if (this.findImageByPath(image.path)) {
              skipped++;
              continue;
            }

            this.addImage(image);
            imported++;
          } catch (error) {
            console.error('导入图片失败:', image.path, error.message);
            errors++;
          }
        }
      });

      insertMany(jsonData);

      console.log(`JSON导入完成: 导入${imported}条, 跳过${skipped}条, 错误${errors}条`);
      return { imported, skipped, errors };
    } catch (error) {
      console.error('从JSON导入失败:', error);
      throw error;
    }
  }

  // 备份到JSON文件
  exportToJson(jsonPath) {
    try {
      const images = this.getAllImages();
      // 转换为原JSON格式（移除_id字段）
      const exportData = images.map(img => {
        const { _id, ...imageData } = img;
        return imageData;
      });
      
      fs.writeFileSync(jsonPath, JSON.stringify(exportData, null, 2));
      console.log(`数据已备份到 ${jsonPath}`);
      return exportData.length;
    } catch (error) {
      console.error('导出到JSON失败:', error);
      throw error;
    }
  }

  // 关闭数据库连接
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // 获取数据库状态
  getStatus() {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM images');
      const { count } = stmt.get();
      return {
        dbImageCount: count,
        dbPath: this.dbPath,
        isConnected: !!this.db
      };
    } catch (error) {
      console.error('获取数据库状态失败:', error);
      return {
        dbImageCount: 0,
        dbPath: this.dbPath,
        isConnected: false
      };
    }
  }
}

module.exports = ImageDatabase; 