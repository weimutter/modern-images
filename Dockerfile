# 使用多阶段构建
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 生产阶段
FROM node:18-alpine

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 安装必要的系统依赖
RUN apk add --no-cache \
    sqlite \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# 设置工作目录
WORKDIR /app

# 从builder阶段复制node_modules
COPY --from=builder /app/node_modules ./node_modules

# 复制应用文件
COPY . .

# 创建必要的目录并设置权限
RUN mkdir -p uploads sessions database && \
    chown -R nodejs:nodejs /app

# 暴露端口
EXPOSE 3000

# 切换到非root用户
USER nodejs

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 3000, path: '/', timeout: 2000 }; \
    http.get(options, (res) => process.exit(res.statusCode === 200 ? 0 : 1)) \
    .on('error', () => process.exit(1));"

# 启动应用
CMD ["node", "server.js"] 