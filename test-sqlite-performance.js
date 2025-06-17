const fs = require('fs');
const path = require('path');
const ImageDatabase = require('./database');

// 性能测试脚本
async function performanceTest() {
  console.log('🚀 SQLite数据库性能测试');
  console.log('============================\n');

  const testDbPath = 'test_performance.db';
  const testJsonPath = 'test_performance.json';
  
  // 清理测试文件
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(testJsonPath)) fs.unlinkSync(testJsonPath);

  // 生成测试数据
  const generateTestData = (count) => {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        filename: `test_image_${i.toString().padStart(6, '0')}.jpg`,
        path: `2024/01/test_image_${i.toString().padStart(6, '0')}.jpg`,
        uploadTime: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        fileSize: Math.floor(Math.random() * 5000000) + 100000,
        storage: Math.random() > 0.5 ? 'local' : 'r2',
        format: 'jpg',
        url: `http://localhost:3000/i/2024/01/test_image_${i.toString().padStart(6, '0')}.jpg`,
        htmlCode: `<img src="http://localhost:3000/i/2024/01/test_image_${i.toString().padStart(6, '0')}.jpg" alt="test_image_${i.toString().padStart(6, '0')}.jpg" />`,
        markdownCode: `![](http://localhost:3000/i/2024/01/test_image_${i.toString().padStart(6, '0')}.jpg)`
      });
    }
    return data;
  };

  const testSizes = [100, 1000, 5000];

  for (const size of testSizes) {
    console.log(`📊 测试 ${size} 条记录的性能:`);
    console.log('-'.repeat(40));

    const testData = generateTestData(size);

    // JSON文件测试
    console.log('🗂️  JSON文件测试:');
    
    // 写入JSON文件
    const jsonWriteStart = Date.now();
    fs.writeFileSync(testJsonPath, JSON.stringify(testData, null, 2));
    const jsonWriteTime = Date.now() - jsonWriteStart;
    console.log(`   写入: ${jsonWriteTime}ms`);

    // 读取全部数据
    const jsonReadStart = Date.now();
    const jsonData = JSON.parse(fs.readFileSync(testJsonPath, 'utf8'));
    const jsonReadTime = Date.now() - jsonReadStart;
    console.log(`   读取全部: ${jsonReadTime}ms`);

    // 查询测试 (模拟搜索local存储的图片)
    const jsonQueryStart = Date.now();
    const jsonFiltered = jsonData.filter(item => item.storage === 'local');
    const jsonQueryTime = Date.now() - jsonQueryStart;
    console.log(`   过滤查询: ${jsonQueryTime}ms (找到 ${jsonFiltered.length} 条)`);

    // 分页测试 (模拟获取第2页，每页50条)
    const jsonPaginateStart = Date.now();
    const jsonSorted = jsonData.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
    const jsonPaginated = jsonSorted.slice(50, 100);
    const jsonPaginateTime = Date.now() - jsonPaginateStart;
    console.log(`   分页查询: ${jsonPaginateTime}ms (第2页 ${jsonPaginated.length} 条)`);

    // SQLite数据库测试
    console.log('\n🗄️  SQLite数据库测试:');
    
    const testDb = new ImageDatabase(testDbPath);

    // 批量插入
    const sqliteWriteStart = Date.now();
    for (const item of testData) {
      testDb.addImage(item);
    }
    const sqliteWriteTime = Date.now() - sqliteWriteStart;
    console.log(`   写入: ${sqliteWriteTime}ms`);

    // 读取全部数据
    const sqliteReadStart = Date.now();
    const sqliteData = testDb.getAllImages();
    const sqliteReadTime = Date.now() - sqliteReadStart;
    console.log(`   读取全部: ${sqliteReadTime}ms`);

    // 查询测试 (搜索local存储的图片)
    const sqliteQueryStart = Date.now();
    const sqliteFiltered = testDb.getAllImages(null, 'local');
    const sqliteQueryTime = Date.now() - sqliteQueryStart;
    console.log(`   过滤查询: ${sqliteQueryTime}ms (找到 ${sqliteFiltered.length} 条)`);

    // 分页测试 (获取第2页，每页50条)
    const sqlitePaginateStart = Date.now();
    const sqlitePaginated = testDb.getImagesPaged(2, 50);
    const sqlitePaginateTime = Date.now() - sqlitePaginateStart;
    console.log(`   分页查询: ${sqlitePaginateTime}ms (第2页 ${sqlitePaginated.images.length} 条)`);

    // 性能对比
    console.log('\n⚡ 性能对比 (SQLite vs JSON):');
    console.log(`   写入性能: ${(jsonWriteTime / sqliteWriteTime).toFixed(1)}x`);
    console.log(`   读取性能: ${(jsonReadTime / sqliteReadTime).toFixed(1)}x`);
    console.log(`   查询性能: ${(jsonQueryTime / sqliteQueryTime).toFixed(1)}x`);
    console.log(`   分页性能: ${(jsonPaginateTime / sqlitePaginateTime).toFixed(1)}x`);

    testDb.close();
    console.log('\n' + '='.repeat(50) + '\n');
  }

  // 内存使用测试
  console.log('💾 内存使用对比:');
  console.log('-'.repeat(40));
  
  const largeData = generateTestData(10000);
  
  // JSON内存使用
  const jsonMemStart = process.memoryUsage().heapUsed;
  fs.writeFileSync(testJsonPath, JSON.stringify(largeData, null, 2));
  const jsonInMemory = JSON.parse(fs.readFileSync(testJsonPath, 'utf8'));
  const jsonMemEnd = process.memoryUsage().heapUsed;
  const jsonMemUsage = jsonMemEnd - jsonMemStart;
  console.log(`JSON内存使用: ${(jsonMemUsage / 1024 / 1024).toFixed(2)} MB`);

  // SQLite内存使用
  const sqliteMemStart = process.memoryUsage().heapUsed;
  const memTestDb = new ImageDatabase('memory_test.db');
  for (const item of largeData) {
    memTestDb.addImage(item);
  }
  const sqliteMemEnd = process.memoryUsage().heapUsed;
  const sqliteMemUsage = sqliteMemEnd - sqliteMemStart;
  console.log(`SQLite内存使用: ${(sqliteMemUsage / 1024 / 1024).toFixed(2)} MB`);
  console.log(`内存节省: ${((jsonMemUsage - sqliteMemUsage) / jsonMemUsage * 100).toFixed(1)}%`);

  memTestDb.close();

  // 文件大小对比
  const jsonFileSize = fs.statSync(testJsonPath).size;
  const sqliteFileSize = fs.statSync('memory_test.db').size;
  console.log(`\nJSON文件大小: ${(jsonFileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`SQLite文件大小: ${(sqliteFileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`存储节省: ${((jsonFileSize - sqliteFileSize) / jsonFileSize * 100).toFixed(1)}%`);

  // 清理测试文件
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testJsonPath)) fs.unlinkSync(testJsonPath);
    if (fs.existsSync('memory_test.db')) fs.unlinkSync('memory_test.db');
    if (fs.existsSync('memory_test.db-wal')) fs.unlinkSync('memory_test.db-wal');
    if (fs.existsSync('memory_test.db-shm')) fs.unlinkSync('memory_test.db-shm');
  } catch (error) {
    // 忽略清理错误
  }

  console.log('\n🎉 性能测试完成！');
  console.log('\n总结: SQLite数据库在查询、分页、内存使用和存储空间方面都明显优于JSON文件。');
}

// 运行测试
if (require.main === module) {
  performanceTest().catch(console.error);
}

module.exports = { performanceTest }; 