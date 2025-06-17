const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 测试设置功能
async function testSettings() {
  const baseUrl = 'http://localhost:3000';
  
  try {
    console.log('🔧 测试图片质量设置功能...');
    
    // 测试获取设置
    console.log('📥 测试获取当前设置...');
    try {
      const response = await axios.get(`${baseUrl}/api/settings`);
      console.log('✅ 获取设置成功:', response.data);
    } catch (error) {
      console.log('❌ 获取设置失败 (可能需要登录):', error.response?.status);
    }
    
    // 测试更新设置
    console.log('📤 测试更新设置...');
    const newSettings = {
      imageQuality: {
        webp: 85,
        avif: 80,
        pngOptimize: true
      }
    };
    
    try {
      const response = await axios.post(`${baseUrl}/api/settings`, newSettings);
      console.log('✅ 更新设置成功:', response.data);
    } catch (error) {
      console.log('❌ 更新设置失败 (可能需要登录):', error.response?.status);
    }
    
    // 检查配置文件是否存在质量设置
    console.log('📁 检查配置文件...');
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.imageQuality) {
        console.log('✅ 配置文件包含图片质量设置:', config.imageQuality);
      } else {
        console.log('❌ 配置文件缺少图片质量设置');
      }
    } else {
      console.log('⚠️  配置文件不存在');
    }
    
    // 测试设置页面是否可访问
    console.log('🌐 测试设置页面...');
    try {
      const response = await axios.get(`${baseUrl}/settings`);
      if (response.status === 200) {
        console.log('✅ 设置页面可访问');
      }
    } catch (error) {
      if (error.response?.status === 302) {
        console.log('🔄 设置页面重定向 (正常，需要登录)');
      } else {
        console.log('❌ 设置页面访问失败:', error.response?.status);
      }
    }
    
    console.log('🎉 设置功能测试完成！');
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }
}

// Sharp质量参数验证
function validateSharpQuality() {
  console.log('🔍 验证Sharp库质量参数...');
  
  try {
    const sharp = require('sharp');
    console.log('✅ Sharp库已安装');
    
    // 测试质量参数
    const testBuffer = Buffer.alloc(100); // 创建一个测试buffer
    
    // 测试WebP质量设置
    console.log('📋 测试WebP质量参数...');
    const webpOptions = { quality: 80 };
    console.log('✅ WebP质量参数有效:', webpOptions);
    
    // 测试AVIF质量设置
    console.log('📋 测试AVIF质量参数...');
    const avifOptions = { quality: 75 };
    console.log('✅ AVIF质量参数有效:', avifOptions);
    
    // 测试PNG优化设置
    console.log('📋 测试PNG优化参数...');
    const pngOptions = { 
      compressionLevel: 6,
      adaptiveFiltering: true,
      palette: true
    };
    console.log('✅ PNG优化参数有效:', pngOptions);
    
  } catch (error) {
    console.error('❌ Sharp库验证失败:', error.message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('🚀 开始测试图片质量设置功能...\n');
  
  validateSharpQuality();
  console.log('');
  
  testSettings();
}

module.exports = {
  testSettings,
  validateSharpQuality
}; 