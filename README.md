# Modern Images（现代图床）Docker 部署指南

本项目是一个基于 Node.js + PostgreSQL 的图床服务，支持本地存储与 Cloudflare R2（S3 兼容）存储，内置上传、图库、分类、设置、API Token 管理等功能。

本文档专注于 **Docker / Docker Compose 部署**，用于替换旧版 README。

---

## 目录
- [快速开始（Docker Compose）](#快速开始docker-compose)
- [必须配置项（安全）](#必须配置项安全)
- [持久化数据与目录说明](#持久化数据与目录说明)
- [升级/更新](#升级更新)
- [常用运维命令](#常用运维命令)
- [反向代理与 HTTPS](#反向代理与-https)
- [使用 R2（可选）](#使用-r2可选)
- [健康检查与故障排查](#健康检查与故障排查)

---

## 快速开始（Docker Compose）

### 1. 准备配置文件

在仓库根目录执行：

```bash
cp .env.example .env
cp config.example.json config.json
```

然后编辑 `.env`，至少修改：
- `SESSION_SECRET`：强随机字符串
- `DB_PASSWORD`：强密码

说明：`docker-compose.yml` 默认会把 `./config.json` bind-mount 到容器内 `/app/config.json`。
如果宿主机上没有先创建 `config.json`，Docker 可能会创建同名目录导致容器启动失败（entrypoint 会提示修复方式）。

### 2. 启动

```bash
docker compose up -d --build
```

启动后：
- Web 访问：`http://localhost:3000`
- 首次初始化页面：`http://localhost:3000/setup`

说明：PostgreSQL 默认**不对宿主机发布端口**（更安全）。应用容器通过 Compose 内部网络使用服务名 `postgres:5432` 连接数据库。

如果你确实需要在宿主机上用 `psql`/GUI 直连数据库（仅建议本地开发临时使用），推荐创建一个 `docker-compose.override.yml`：

```yaml
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
```

或直接进入容器执行：
```bash
docker compose exec postgres psql -U "$DB_USER" -d "$DB_NAME"
```

如果你在服务器上用其它端口对外提供服务，修改 `.env` 的 `APP_PORT`。

---

## 必须配置项（安全）

### SESSION_SECRET（必须）
生产环境必须设置 `SESSION_SECRET`，否则服务会拒绝启动（见 `src/services/session-store.js`）。

建议生成：
```bash
openssl rand -hex 32
```

### config.json（不要提交到 git）
`config.json` 可能包含管理员账号配置、API Token 等敏感信息：
- **不要提交到仓库**（已在 `.gitignore` 中忽略）
- 通过 `config.example.json` 生成一份本地 `config.json` 再挂载

---

## 持久化数据与目录说明

本项目 Compose 默认持久化这些目录/数据：

| 宿主机路径 | 容器路径 | 用途 |
|---|---|---|
| `./uploads/` | `/app/uploads/` | 图片本地存储（local 模式） |
| `./sessions/` | `/app/sessions/` | Session 文件存储（未启用 Redis store 时） |
| `./backups/` | `/app/backups/` | 数据库备份/恢复文件 |
| `./logs/` | `/app/logs/` | 应用日志 |
| `./config.json` | `/app/config.json` | 应用配置（敏感） |
| `postgres_data` | `/var/lib/postgresql/data` | PostgreSQL 数据卷 |

注意：
- `uploads/`、`sessions/`、`backups/`、`logs/` 建议由容器创建并维护权限。
- 如果你切换到 R2 存储，本地 `uploads/` 仍可能用于回退场景或历史数据。

---

## 升级/更新

```bash
git pull
docker compose down
docker compose up -d --build
```

如果你需要清理旧镜像：
```bash
docker image prune
```

---

## 常用运维命令

查看容器状态：
```bash
docker compose ps
```

查看日志：
```bash
docker compose logs -f app
docker compose logs -f postgres
```

重启：
```bash
docker compose restart app
```

停止并删除容器（保留数据卷）：
```bash
docker compose down
```

停止并删除容器 + 删除数据卷（会清空数据库）：
```bash
docker compose down -v
```

---

## 反向代理与 HTTPS

如果你在 Nginx / Caddy / Traefik 后面运行：
- 建议设置 `TRUST_PROXY=1`（默认就是 1），如果有多层代理再调整
- 若全站 HTTPS，建议让 Session Cookie 使用 secure（当前代码默认 `secure=false`，如果要启用可在代码层或部署层调整）

---

## 使用 R2（可选）

在 `.env` 设置：
- `STORAGE_TYPE=r2`
- `R2_ENABLED=true`
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`（形如 `https://<account-id>.r2.cloudflarestorage.com`）
- `R2_BUCKET`
- `R2_CUSTOM_DOMAIN`（可选，自定义域名）

说明：
- R2 不可用时，上传逻辑会回退到本地存储（见 `src/routes/upload.routes.js`）。

---

## 健康检查与故障排查

### 健康检查接口
应用提供：
- `GET /api/health`

Dockerfile 与 compose 的 healthcheck 也会调用该接口。

### 常见问题

1) **容器启动时报 `/app/config.json is a directory`**
- 原因：你 bind-mount 了 `./config.json`，但宿主机不存在该文件，Docker 创建了同名目录
- 解决：
  ```bash
  rm -rf config.json
  cp config.example.json config.json
  docker compose down
  docker compose up -d --build
  ```

2) **启动后一直 unhealthy**
- 先看日志：`docker compose logs -f app`
- 确认数据库容器 healthy：`docker compose ps`

3) **R2 上传失败**
- 检查 `.env` 中 R2 参数是否完整
- 若 `R2_CUSTOM_DOMAIN` 未设置，会按 endpoint/bucket 拼接 URL（见 `src/services/r2-storage.js`）

---

## 许可与贡献
如需二次开发或提交 PR，建议：
- 保持 `config.json` / `.env` 不进入仓库
- 使用 `config.example.json` / `.env.example` 维护默认配置模板
