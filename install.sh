#!/bin/bash

echo "=========================================="
echo "   现代图床 - 安装脚本 (Linux/macOS)"
echo "=========================================="
echo

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未检测到Node.js，请先安装Node.js 16或更高版本"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

echo "Node.js版本: $(node --version)"
echo

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "错误: 未检测到npm"
    exit 1
fi

echo "npm版本: $(npm --version)"
echo

# 检查是否需要升级现有安装
if [ -f "package.json" ] && [ -f "images.json" ] && [ ! -f "images.db" ]; then
    echo "检测到现有安装，准备升级到SQLite版本..."
    echo "这将自动迁移您的现有数据到SQLite数据库"
    echo
fi

echo "正在安装依赖包..."
npm install

if [ $? -ne 0 ]; then
    echo "错误: 依赖安装失败"
    echo "可以尝试使用国内镜像: npm install --registry https://registry.npmmirror.com/"
    exit 1
fi

# 检查SQLite升级
if [ -f "images.json" ] && [ ! -f "images.db" ]; then
    echo
    echo "SQLite数据库优化说明:"
    echo "• 服务器启动时会自动创建SQLite数据库"
    echo "• 现有的images.json数据会自动导入"
    echo "• 原JSON文件会自动备份保留"
    echo "• 性能将得到显著提升"
    echo
    echo "详细说明请查看: SQLITE_UPGRADE.md"
fi

echo
echo "=========================================="
echo "安装完成！"
echo "=========================================="
echo
echo "启动服务器: npm start"
echo "访问地址: http://localhost:3000"
echo
echo "首次使用请创建管理员账户"
echo "SQLite优化说明: SQLITE_UPGRADE.md"
echo 