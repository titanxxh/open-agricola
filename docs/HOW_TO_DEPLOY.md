# How to Deploy Open Agricola

本文档面向想要自行部署 Open Agricola 平台的开发者。

## 架构概览

```
┌──────────────────────────────┐      ┌───────────────────────────────┐
│  GitHub Pages (CDN)          │      │  Docker 单容器 (你的服务器)      │
│                              │      │                               │
│  index.html + JS/CSS         │─────▶│  Node.js 后端                  │
│  bga-img/ (卡牌图片)          │ HTTPS│    ├── HTTP API  /api/*       │
│                              │      │    ├── WebSocket /ws          │
└──────────────────────────────┘      │    ├── Card art  /card-art/*  │
                                      │    └── SQLite    ./data/*.db  │
                                      └───────────────────────────────┘
```

前端和后端完全分离——前端是纯静态文件，后端是一个 Docker 容器。

---

## 前置条件

- **服务器**：一台有公网 IP 的 Linux 机器（1 CPU / 1GB RAM 足够）
- **Docker** + **Docker Compose** v2
- **域名**（推荐）：用于 HTTPS。如 `api.your-domain.com`
- **GitHub 仓库**：Fork 本项目，用于 GitHub Pages 部署前端
- **BGA 卡牌图片**（可选）：`bga-agricola/img` 目录，不影响游戏规则逻辑

---

## 一、部署后端

### 1. 克隆仓库

```bash
git clone https://github.com/YOUR_USER/open-agricola-platform.git
cd open-agricola-platform
git checkout platform
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 必须配置
BACKEND_PORT=5175
NODE_ENV=production
PERSIST_ROOMS=sqlite
ALLOW_ANONYMOUS_WS=false

# 生产环境 CORS — 设置为你的 GitHub Pages URL
CORS_ORIGIN=https://YOUR_USER.github.io
```

### 3. 构建并启动

```bash
docker compose up -d --build
```

### 4. 验证

```bash
curl http://localhost:5175/api/health
# 应返回: {"ok":true}
```

查看日志：

```bash
docker compose logs -f app
```

### 5. 更新部署

```bash
git pull
docker compose up -d --build
```

数据（SQLite 数据库、card art）存储在 Docker volume 中，重启不会丢失。

---

## 二、配置 HTTPS（生产必需）

GitHub Pages 默认 HTTPS，浏览器会阻止 HTTPS 页面向 HTTP 后端发请求（混合内容）。后端必须配置 HTTPS。

### 方案 A：Caddy 自动 HTTPS（推荐，最简单）

创建 `deploy/Caddyfile`：

```
api.your-domain.com {
    reverse_proxy app:5175
}
```

在 `docker-compose.yml` 中添加 Caddy 服务：

```yaml
services:
  app:
    build: .
    # ... 现有配置 ...
    # 注意：移除 ports 映射，让 Caddy 来转发
    expose:
      - "5175"

  caddy:
    image: caddy:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on:
      - app

volumes:
  app-data:
  app-output:
  caddy-data:
```

Caddy 会自动申请和续期 Let's Encrypt 证书。将域名 DNS A 记录指向服务器 IP 即可。

### 方案 B：云服务商 Load Balancer

如果使用 AWS / DigitalOcean / Cloudflare 等，在 LB 层做 TLS 终止，Docker 容器只暴露 HTTP。

### 方案 C：Nginx + Let's Encrypt

更传统的方案，需要手动配置证书续期。参考 `certbot` 文档。

---

## 三、部署前端

### 方式 A：GitHub Actions 自动部署（推荐）

项目已包含 `.github/workflows/deploy-pages.yml`。

**步骤：**

1. 在 GitHub 仓库 Settings → Pages → Source 选 **GitHub Actions**

2. 在 Settings → Variables → Repository variables 中添加：

   | Variable | 值 | 示例 |
   |----------|---|------|
   | `VITE_API_BASE` | 后端完整 URL | `https://api.your-domain.com` |
   | `VITE_WS_BASE` | WebSocket URL（可选，自动从 API_BASE 推导） | `wss://api.your-domain.com/ws` |

3. Push 到 `platform` 分支，GitHub Actions 会自动构建并部署

4. 访问 `https://YOUR_USER.github.io/open-agricola-platform/`

### 方式 B：手动构建并部署

```bash
# 构建前端，注入后端地址
VITE_API_BASE=https://api.your-domain.com npm run build

# 部署到 GitHub Pages
npx gh-pages -d dist
```

### BGA 卡牌图片

构建脚本会自动从 `$BGA_IMAGE_DIR`（默认 `../bga-agricola/img`）复制图片到 `dist/bga-img/`。如果该目录不存在，构建仍会成功，只是游戏内不显示卡牌图片（不影响规则）。

如果你有 BGA 图片，确保构建时它在正确的路径：

```bash
BGA_IMAGE_DIR=/path/to/bga-agricola/img VITE_API_BASE=https://api.your-domain.com npm run build
```

---

## 四、验证清单

部署完成后逐项验证：

- [ ] `curl https://api.your-domain.com/api/health` 返回 `{"ok":true}`
- [ ] 访问前端 URL，能看到登录页
- [ ] 注册新用户
- [ ] 登录成功，进入大厅
- [ ] 创建房间，开始游戏
- [ ] WebSocket 连接正常（浏览器 Console 无 WS 错误）
- [ ] 双人模式：两个浏览器窗口加入同一房间
- [ ] Workshop：创建/浏览自定义卡牌
- [ ] Card art 上传和显示正常
- [ ] `docker compose down && docker compose up -d` 后数据仍在（SQLite 持久化）

---

## 环境变量参考

### 后端（Docker / .env）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BACKEND_PORT` | `5175` | HTTP/WS 监听端口 |
| `BACKEND_HOST` | `0.0.0.0` | 绑定地址 |
| `NODE_ENV` | — | 设为 `production` 启用生产模式 |
| `PERSIST_ROOMS` | `sqlite` | 房间持久化方式 (`sqlite` / `json`) |
| `ALLOW_ANONYMOUS_WS` | `true`(dev) / `false`(prod) | 是否允许匿名 WebSocket |
| `CORS_ORIGIN` | `*` | 允许的前端域名，生产环境必须设置 |
| `DB_PATH` | `./data/open-agricola.db` | SQLite 文件路径 |
| `CARD_ART_DIR` | `./data/card-art` | 上传的卡牌图片存储路径 |

### 前端（构建时注入）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_BASE` | `''`（空=同源） | 后端 API 地址，如 `https://api.your-domain.com` |
| `VITE_WS_BASE` | 从 API_BASE 推导 | WebSocket 地址，如 `wss://api.your-domain.com/ws` |
| `BGA_IMAGE_DIR` | `../bga-agricola/img` | BGA 卡牌图片目录（构建时复制） |

---

## 常见问题

### WebSocket 连接失败

- 确认后端 HTTPS 配置正确（GitHub Pages 是 HTTPS，WS 必须用 `wss://`）
- 确认反向代理支持 WebSocket upgrade（Caddy 默认支持）
- 检查 `VITE_WS_BASE` 是否正确设置

### CORS 错误

- 检查 `.env` 中 `CORS_ORIGIN` 是否与前端域名完全匹配（含 `https://`，不含尾部 `/`）
- 如果使用自定义域名，确保 `CORS_ORIGIN` 与实际访问域名一致

### 卡牌图片不显示

- 不影响游戏功能，仅影响显示
- 确认 BGA 图片目录存在且路径正确
- 如果使用 GitHub Actions，需要在 CI 环境中提供 BGA 图片（或接受不显示）

### 数据备份

SQLite 数据库存储在 Docker volume `app-data` 中：

```bash
# 备份
docker compose cp app:/app/data/open-agricola.db ./backup.db

# 恢复
docker compose cp ./backup.db app:/app/data/open-agricola.db
docker compose restart app
```

### 本地开发（不需要 Docker）

本地开发不受部署配置影响，继续使用：

```bash
npm install
./restart-intranet.sh
```

`VITE_API_BASE` 未设置时默认为空字符串（同源），开发模式下前端自动连接 `localhost:5175`。
