# 现代图床 - Modern Image Hosting

一个现代的图床网站，支持本地存储和Cloudflare R2对象存储，带有完整的登录、API管理功能。

## 新增功能 - 图片分类查看

### 功能概述
现在您可以在图片库中按存储类型查看图片：
- **所有图片**：显示所有上传的图片
- **本地存储**：仅显示存储在本地服务器的图片
- **R2存储**：仅显示存储在Cloudflare R2的图片

### 使用方法
1. 访问图片库页面 (`/gallery`)
2. 在页面顶部找到存储类型下拉选择器
3. 选择您想要查看的存储类型：
   - "所有图片 (总数)" - 显示所有图片
   - "本地存储 (数量)" - 仅显示本地存储的图片
   - "R2存储 (数量)" - 仅显示R2存储的图片
4. 页面会自动刷新并显示对应类型的图片

### 技术实现
- 后端API支持 `storage` 参数过滤
- 前端实时统计各存储类型的图片数量
- 分页功能完全兼容存储类型过滤
- 删除图片后自动更新统计数据

### API接口更新
- `GET /images?storage=local|r2` - 获取指定存储类型的图片
- `GET /images/paged?storage=local|r2&page=1&limit=50` - 分页获取指定存储类型的图片
- `GET /api/storage-stats` - 获取各存储类型的图片统计信息

## 功能特性

- 🖼️ **多种图片格式支持** - JPEG、PNG、GIF、WebP、AVIF
- 🔄 **格式转换** - 支持转换为WebP和AVIF格式
- ⚙️ **图片质量设置** - 可配置WebP、AVIF、JPEG转换质量，支持PNG优化
- 📁 **双存储模式** - 本地存储 + Cloudflare R2对象存储
- 🔐 **安全认证** - 用户登录系统，保护上传功能
- 🚀 **API接口** - 完整的上传API，支持第三方工具集成
- 📱 **响应式设计** - 适配各种屏幕尺寸
- 🌙 **深色模式** - 支持明暗主题切换
- 📊 **图片管理** - 查看、复制、删除已上传图片
- 📋 **多种复制格式** - 直链、HTML、Markdown、论坛格式
- 📱 **手机端一键复制功能**

## 手机端复制功能

### 新增功能
- **手机端复制按钮**：在手机端浏览图片时，每张图片右上角会显示一个复制图标
- **一键复制菜单**：点击复制图标会弹出底部菜单，提供多种复制选项：
  - 复制图片链接
  - 复制 HTML 代码
  - 复制 Markdown 代码
  - 复制论坛格式
  - 在新标签页打开

### 使用方法
1. 在手机端打开图床网站
2. 浏览图片库或上传新图片
3. 点击图片右上角的复制图标（📋）
4. 从弹出的菜单中选择需要的复制格式
5. 链接将自动复制到剪贴板

### 设计特点
- **仅手机端显示**：复制按钮只在屏幕宽度小于768px时显示
- **优雅的动画**：底部滑出菜单，支持点击背景关闭
- **触摸优化**：按钮大小和间距针对触摸操作优化
- **暗色模式支持**：完美适配明亮和暗色主题

## 安装和部署

### 1. 环境要求

- Node.js 16+ 
- npm 或 yarn
- PM2（推荐用于生产环境）

### 2. 安装依赖

```bash
npm install
```

### 3. 启动服务

#### 开发环境
```bash
npm start
# 或直接运行
node server.js
```

#### 生产环境（推荐使用PM2）

安装PM2：
```bash
npm install -g pm2
```

使用提供的启动脚本：
```bash
# 给脚本添加执行权限
chmod +x start-pm2.sh

# 启动服务（默认端口3000）
./start-pm2.sh

# 或指定端口启动
./start-pm2.sh 8080
```

手动使用PM2：
```bash
# 启动服务
PORT=3000 pm2 start server.js --name image-hosting

# 查看状态
pm2 status

# 查看日志
pm2 logs image-hosting

# 重启服务
pm2 restart image-hosting

# 停止服务
pm2 stop image-hosting
```

### 4. 初始设置

首次访问会自动跳转到设置页面，创建管理员账户。

## Cloudflare R2配置

### 1. 创建R2 Bucket

1. 登录 [Cloudflare控制台](https://dash.cloudflare.com)
2. 在左侧菜单中选择 "R2 Object Storage"
3. 点击 "创建存储桶" 创建一个新的Bucket
4. 记录Bucket名称

### 2. 创建API令牌

1. 在R2页面点击 "管理R2 API令牌"
2. 点击 "创建API令牌"
3. 选择适当的权限（建议选择"对象读写"）
4. 复制生成的 Access Key ID 和 Secret Access Key

### 3. 获取Endpoint

您的R2 Endpoint格式为：
```
https://[账户ID].r2.cloudflarestorage.com
```

账户ID可以在Cloudflare控制台右侧边栏找到。

### 4. 配置图床

1. 在图床网站中访问 "存储配置" 页面
2. 选择 "Cloudflare R2对象存储"
3. 填写以下信息：
   - **Access Key ID**: 步骤2中获取的Key ID
   - **Secret Access Key**: 步骤2中获取的Secret
   - **Endpoint**: 步骤3中的Endpoint URL
   - **Bucket名称**: 步骤1中创建的Bucket名称
   - **区域**: 保持 "auto"
   - **自定义域名**: （可选）如果配置了自定义域名

4. 点击 "测试R2连接" 验证配置
5. 测试成功后，启用R2存储并保存配置

### 5. 自定义域名（可选）

为了获得更好的访问速度和自定义URL，建议配置自定义域名：

1. 在Cloudflare控制台的R2页面中找到您的Bucket
2. 点击 "设置" → "自定义域"
3. 添加您的域名（如：cdn.yourdomain.com）
4. 按照提示完成DNS设置
5. 在图床的存储配置中填写自定义域名

## API使用

### 1. 创建API令牌

1. 访问 "API管理" 页面
2. 点击 "创建新令牌"
3. 输入令牌名称并创建
4. 复制生成的令牌

### 2. 上传图片

#### 基本用法

```bash
curl -X POST http://your-domain.com/api/upload \
  -H "X-API-Token: your-api-token" \
  -F "images=@/path/to/image.jpg"
```

#### 指定存储策略

API现在支持通过 `storage` 参数灵活指定存储策略，不受网页存储设置影响：

```bash
# 强制使用R2对象存储
curl -X POST "http://your-domain.com/api/upload?storage=r2" \
  -H "X-API-Token: your-api-token" \
  -F "images=@/path/to/image.jpg"

# 强制使用本地存储
curl -X POST "http://your-domain.com/api/upload?storage=local" \
  -H "X-API-Token: your-api-token" \
  -F "images=@/path/to/image.jpg"

# 跟随全局配置（默认行为）
curl -X POST "http://your-domain.com/api/upload?storage=auto" \
  -H "X-API-Token: your-api-token" \
  -F "images=@/path/to/image.jpg"
```

#### 结合格式转换和存储策略

```bash
# 转换为WebP格式并强制使用R2存储
curl -X POST "http://your-domain.com/api/upload?format=webp&storage=r2" \
  -H "X-API-Token: your-api-token" \
  -F "images=@/path/to/image.jpg"

# 保持原格式并使用本地存储
curl -X POST "http://your-domain.com/api/upload?format=original&storage=local" \
  -H "X-API-Token: your-api-token" \
  -F "images=@/path/to/image.jpg"
```

#### 支持的参数

- **storage**: 存储策略
  - `r2`: 强制使用Cloudflare R2对象存储
  - `local`: 强制使用本地存储
  - `auto`: 跟随全局配置（默认值）
- **format**: 图片格式
  - `original`: 保持原格式（默认）
  - `webp`: 转换为WebP格式
  - `avif`: 转换为AVIF格式
- **picgo**: PicGo兼容性
  - `true`: 返回PicGo兼容格式

#### POST Body方式传递参数

除了通过URL参数，也可以通过POST body传递参数：

```bash
curl -X POST http://your-domain.com/api/upload \
  -H "X-API-Token: your-api-token" \
  -F "images=@/path/to/image.jpg" \
  -F "storage=r2" \
  -F "format=webp"
```

### 3. PicGo配置

#### 基本配置

1. 在PicGo中选择 "自定义Web图床"
2. 填写以下配置：
   - **API地址**: `http://your-domain.com/api/upload?picgo=true`
   - **POST参数名**: `images`
   - **JSON路径**: `result`
   - **自定义Header**: `{"X-API-Token": "your-api-token"}`

#### 指定存储策略的PicGo配置

```json
{
  "API地址": "http://your-domain.com/api/upload?picgo=true&storage=r2",
  "POST参数名": "images",
  "JSON路径": "result",
  "自定义Header": {"X-API-Token": "your-api-token"}
}
```

### 4. 响应格式

#### 标准响应

```json
{
  "success": true,
  "images": [
    {
      "filename": "abc123def001.jpg",
      "path": "api/2024/01/abc123def001.jpg",
      "uploadTime": "2024-01-15 10:30:00",
      "fileSize": 125420,
      "storage": "r2",
      "format": "jpg",
      "url": "https://cdn.example.com/api/2024/01/abc123def001.jpg",
      "htmlCode": "<img src=\"https://cdn.example.com/api/2024/01/abc123def001.jpg\" alt=\"abc123def001.jpg\" />",
      "markdownCode": "![](https://cdn.example.com/api/2024/01/abc123def001.jpg)"
    }
  ]
}
```

#### PicGo兼容响应

```json
{
  "success": true,
  "result": [
    "https://cdn.example.com/api/2024/01/abc123def001.jpg"
  ]
}
```

## 文件结构

```
├── server.js          # 主服务器文件
├── config.json        # 配置文件（自动生成）
├── package.json       # 项目依赖
├── views/             # HTML页面
│   ├── index.html     # 主页
│   ├── login.html     # 登录页
│   ├── setup.html     # 初始设置页
│   ├── gallery.html   # 图片库
│   ├── api-management.html  # API管理
│   └── storage-config.html  # 存储配置
├── public/            # 静态资源
│   ├── css/          # 样式文件
│   └── js/           # JavaScript文件
└── uploads/          # 本地存储目录（如果使用本地存储）
```

## 环境变量

可以通过环境变量配置端口：

```bash
PORT=3000 npm start
```

## 注意事项

1. **安全性**: 请确保在生产环境中使用HTTPS
2. **备份**: 定期备份配置文件和本地存储的图片
3. **存储切换**: 更改存储方式不会影响已上传的文件
4. **R2费用**: 注意Cloudflare R2的使用费用，合理使用
5. **API存储策略**: 
   - 使用 `storage=r2` 时，如果R2配置不完整或连接失败，将返回错误而不会回退
   - 使用 `storage=auto` 时，如果R2不可用会自动回退到本地存储
   - 使用 `storage=local` 时，始终使用本地存储，忽略R2配置

## 故障排除

### R2连接失败

1. 检查Access Key ID和Secret Access Key是否正确
2. 确认Endpoint URL格式正确
3. 验证Bucket名称是否存在
4. 检查API令牌权限是否足够

### 上传失败

1. 检查文件格式是否支持
2. 确认文件大小是否超出限制
3. 验证网络连接是否正常
4. 查看服务器日志获取详细错误信息

### API存储策略问题

1. **"R2存储不可用"错误**
   - 检查R2配置是否完整（Access Key、Secret、Endpoint、Bucket）
   - 确认R2服务是否已启用
   - 验证API令牌权限是否足够

2. **强制R2存储失败**
   - 使用 `storage=r2` 时不会回退到本地存储
   - 检查R2连接状态和配置
   - 可以先使用 `storage=auto` 进行测试

3. **存储策略参数无效**
   - 确认参数值正确：`r2`、`local`、`auto`
   - 可以通过URL参数或POST body传递
   - 参数大小写敏感

### 图片显示问题

1. **原有图片无法显示**
   - 如果在使用新API功能后发现原有图片无法显示
   - 访问 `/migrate` 页面使用图片迁移工具
   - 该工具会将所有现有图片添加到数据库记录中
   - 迁移后所有图片都将正常显示

2. **使用迁移工具**
   - 登录管理界面，访问"迁移工具"页面
   - 查看系统状态了解需要迁移的图片数量
   - 点击"开始迁移图片"执行一次性迁移
   - 迁移完成后刷新图片库确认结果

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。 