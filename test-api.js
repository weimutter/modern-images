#!/usr/bin/env node

const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

// 配置
const config = {
  baseUrl: 'http://localhost:3000',
  apiToken: 'your-api-token-here', // 请替换为您的API token
  testImagePath: './test-image.jpg' // 测试图片路径
};

// 测试用例
const testCases = [
  {
    name: '默认存储策略（auto）',
    params: {}
  },
  {
    name: '强制使用本地存储',
    params: { storage: 'local' }
  },
  {
    name: '强制使用R2存储',
    params: { storage: 'r2' }
  },
  {
    name: '本地存储 + WebP格式',
    params: { storage: 'local', format: 'webp' }
  },
  {
    name: 'R2存储 + AVIF格式',
    params: { storage: 'r2', format: 'avif' }
  },
  {
    name: 'PicGo格式 + R2存储',
    params: { storage: 'r2', picgo: 'true' }
  }
];

// 检查测试图片是否存在
function checkTestImage() {
  if (!fs.existsSync(config.testImagePath)) {
    console.log('❌ 测试图片不存在，正在创建一个简单的测试图片...');
    
    // 创建一个简单的测试图片（1x1像素的PNG）
    const testImageData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    fs.writeFileSync(config.testImagePath, testImageData);
    console.log('✅ 测试图片已创建');
  }
}

// 执行单个测试
async function runTest(testCase) {
  console.log(`\n🧪 测试: ${testCase.name}`);
  
  try {
    const form = new FormData();
    form.append('images', fs.createReadStream(config.testImagePath));
    
    // 添加其他参数到form data
    Object.keys(testCase.params).forEach(key => {
      if (key !== 'picgo') { // picgo参数通过URL传递
        form.append(key, testCase.params[key]);
      }
    });
    
    // 构建URL
    let url = `${config.baseUrl}/api/upload`;
    const urlParams = new URLSearchParams();
    
    if (testCase.params.picgo) {
      urlParams.append('picgo', testCase.params.picgo);
    }
    
    if (urlParams.toString()) {
      url += `?${urlParams.toString()}`;
    }
    
    const response = await axios.post(url, form, {
      headers: {
        'X-API-Token': config.apiToken,
        ...form.getHeaders()
      },
      timeout: 30000
    });
    
    if (response.data.success) {
      console.log('✅ 上传成功');
      
      if (testCase.params.picgo === 'true') {
        console.log('📸 PicGo格式响应:', response.data.result);
      } else {
        const image = response.data.images[0];
        console.log(`📁 存储方式: ${image.storage}`);
        console.log(`🖼️  图片格式: ${image.format}`);
        console.log(`🔗 图片URL: ${image.url}`);
        console.log(`📊 文件大小: ${image.fileSize} bytes`);
      }
    } else {
      console.log('❌ 上传失败:', response.data.error);
    }
    
  } catch (error) {
    if (error.response) {
      console.log('❌ 上传失败:', error.response.data.error || error.response.statusText);
    } else {
      console.log('❌ 网络错误:', error.message);
    }
  }
}

// 主函数
async function main() {
  console.log('🚀 API存储策略测试工具');
  console.log('='.repeat(50));
  
  // 检查配置
  if (config.apiToken === 'your-api-token-here') {
    console.log('❌ 请先在脚本中设置您的API token');
    process.exit(1);
  }
  
  // 检查测试图片
  checkTestImage();
  
  // 运行所有测试
  for (const testCase of testCases) {
    await runTest(testCase);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
  }
  
  console.log('\n✨ 所有测试完成！');
  
  // 清理测试图片
  if (fs.existsSync(config.testImagePath)) {
    fs.unlinkSync(config.testImagePath);
    console.log('🧹 测试图片已清理');
  }
}

// 运行测试
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runTest, testCases }; 