#!/bin/bash

# 测试脚本中的关键函数

# 引入颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试端口检查函数
check_port_available() {
    local port=$1
    if command -v netstat &> /dev/null; then
        if netstat -tuln | grep -q ":$port "; then
            return 1
        fi
    elif command -v ss &> /dev/null; then
        if ss -tuln | grep -q ":$port "; then
            return 1
        fi
    fi
    return 0
}

# 测试PM2检查函数
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}⚠️  PM2 未安装或不可用${NC}"
        return 1
    fi
    return 0
}

echo "=== 脚本函数测试 ==="
echo

echo "1. 测试PM2可用性："
if check_pm2; then
    echo -e "${GREEN}✅ PM2 可用${NC}"
else
    echo -e "${RED}❌ PM2 不可用${NC}"
fi

echo
echo "2. 测试端口检查功能："
test_ports=(3000 8080 80 443 22)

for port in "${test_ports[@]}"; do
    if check_port_available "$port"; then
        echo -e "端口 $port: ${GREEN}可用${NC}"
    else
        echo -e "端口 $port: ${RED}被占用${NC}"
    fi
done

echo
echo "3. 测试依赖检查："

# 快速检查方法（推荐）
echo "   快速检查方法:"
if [ -d "node_modules/session-file-store" ]; then
    echo -e "   ${GREEN}✅ session-file-store 目录存在${NC}"
else
    echo -e "   ${YELLOW}⚠️  session-file-store 目录不存在${NC}"
fi

# npm方法（可能慢）
echo "   npm方法（带超时）:"
if command -v timeout &> /dev/null; then
    if timeout 5s npm list session-file-store &>/dev/null; then
        echo -e "   ${GREEN}✅ npm检查通过${NC}"
    else
        echo -e "   ${YELLOW}⚠️  npm检查失败或超时${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  系统不支持timeout命令${NC}"
fi

echo
echo "4. 测试基本文件结构："
key_files=("server.js" "package.json" "config.json")
for file in "${key_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "   $file: ${GREEN}存在${NC}"
    else
        echo -e "   $file: ${RED}缺失${NC}"
    fi
done

echo
echo "测试完成！" 