# 生产部署方案：GitHub Pages + Docker 后端

## 架构

```
GitHub Pages (username.github.io/open-agricola)
  ├── index.html + JS/CSS    (Vite 构建产物)
  └── bga-img/               (BGA 卡牌图片，静态打包)

Docker 单容器 (api.your-domain.com)
  └── Node.js 后端
      ├── HTTP API (/api/*)
      ├── WebSocket (/ws)
      └── Card art uploads (/card-art/*)
```

**前后端完全分离**：前端部署在 GitHub Pages（免费 CDN），后端用 Docker Compose 一键部署。

## 前端部署 (GitHub Pages)

### 构建配置

前端需要在构建时注入后端 API 地址：

```bash
VITE_API_BASE=https://api.your-domain.com npm run build
```

前端代码中所有 API/WS 调用需要使用这个环境变量：
- HTTP: `${VITE_API_BASE}/api/...`
- WebSocket: `wss://api.your-domain.com/ws`

### BGA 卡牌图片

在 Vite 构建流程中将 BGA 图片复制到 `dist/bga-img/`，前端用相对路径 `/bga-img/xxx.png` 引用。

### GitHub Actions 自动部署（可选）

可以配置 `.github/workflows/deploy-pages.yml`，push 到 platform 分支时自动构建并部署到 GitHub Pages。

### SPA 路由

项目使用 URL params 路由（`?page=login`），不是 path-based，所以 GitHub Pages 原生支持，不需要 404.html hack。

## 后端部署 (Docker Compose)

### Dockerfile（多阶段构建）

**Stage 1: build**
- 基础镜像：Node 22 Alpine
- 安装 canvas 原生构建依赖：`cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev python3 make g++`
- `npm ci` 安装全部依赖
- 编译 TypeScript（仅 server 需要）

**Stage 2: production**
- 基础镜像：Node 22 Alpine
- 安装 canvas 运行时库（不含 -dev 包）：`cairo pango jpeg giflib librsvg pixman`
- `npm ci --omit=dev` 只装生产依赖
- 从 Stage 1 复制：`shared/`, `server/`, `package.json`, `package-lock.json`, `tsconfig*.json`
- 入口：`node --import tsx server/index.ts`
- 暴露端口 5175
- 健康检查：`GET /api/health`

**注意**：不需要复制 `dist/`（前端在 GitHub Pages），不需要 Nginx 容器。

### docker-compose.yml

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "${BACKEND_PORT:-5175}:5175"
    volumes:
      - app-data:/app/data          # SQLite DB + card art
      - app-output:/app/output      # JSON room state (legacy)
    environment:
      - NODE_ENV=production
      - PERSIST_ROOMS=sqlite
      - ALLOW_ANONYMOUS_WS=false
      - BACKEND_HOST=0.0.0.0
      - BACKEND_PORT=5175
    env_file:
      - .env                        # 可选，覆盖上面的默认值
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:5175/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  app-data:
  app-output:
```

### .env.example

```env
# 后端端口（对外暴露）
BACKEND_PORT=5175

# 生产环境必需
NODE_ENV=production
PERSIST_ROOMS=sqlite
ALLOW_ANONYMOUS_WS=false
```

### .dockerignore

```
node_modules
dist
output
data
.git
*.log
e2e-tests
tests
docs
```

## 需要的代码改动

### 1. 前端：API 地址可配置

**涉及文件：**
- `src/contexts/AuthContext.tsx` — `apiFetch()` 需要用 `import.meta.env.VITE_API_BASE` 作为 base URL
- `src/services/gameTransport.ts` — HTTP/WS 连接地址需要可配置
- `src/app/WorkshopPage.tsx` — workshop API 调用
- `src/app/LobbyPage.tsx` — lobby API 调用
- `src/app/SettingsPage.tsx` — settings API 调用
- `src/app/GameContainerApi.tsx` — game API 调用

**方案：** 创建一个 `src/config.ts` 导出 `API_BASE` 和 `WS_BASE`：

```typescript
export const API_BASE = import.meta.env.VITE_API_BASE || ''  // 开发时空字符串=同源
export const WS_BASE = import.meta.env.VITE_WS_BASE ||
  API_BASE.replace(/^http/, 'ws') ||
  `ws://${window.location.hostname}:5175`
```

### 2. 前端：BGA 图片路径

**涉及文件：**
- `vite.config.ts` — 移除 dev-only 的 BGA 图片 serve 插件，改为构建时复制

**方案：** 使用 `vite-plugin-static-copy` 或在 `package.json` 的 build script 中加 `cp -r` 命令，将 BGA 图片目录复制到 `dist/bga-img/`。

### 3. 后端：CORS 配置

**涉及文件：**
- `server/index.ts` — CORS `Access-Control-Allow-Origin` 不能再用 `*`，需要配置为 GitHub Pages 的域名

**方案：** 环境变量 `CORS_ORIGIN`，默认 `*`（开发），生产设为 `https://username.github.io`。

### 4. 后端：card-art URL

**涉及文件：**
- `server/index.ts` — card art 上传返回的 URL 需要是完整 URL（不是相对路径 `/card-art/xxx`）

**方案：** 返回完整 URL `${BACKEND_URL}/card-art/xxx`，或者前端拼接。

## 部署步骤

### 首次部署后端

```bash
# 1. 克隆仓库
git clone <repo> && cd open-agricola && git checkout platform

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 设置域名等

# 3. 一键启动
docker compose up -d --build

# 4. 验证
curl http://your-server:5175/api/health
```

### 首次部署前端

```bash
# 1. 构建前端（指向后端地址）
VITE_API_BASE=https://api.your-domain.com npm run build

# 2. 部署到 GitHub Pages（手动或 CI）
# 方式 A：gh-pages 分支
npx gh-pages -d dist

# 方式 B：GitHub Actions 自动化（见下方 workflow）
```

### GitHub Actions Workflow（可选）

```yaml
# .github/workflows/deploy-pages.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [platform]
    paths: ['src/**', 'shared/**', 'index.html', 'vite.config.ts']

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: VITE_API_BASE=${{ vars.API_BASE }} npm run build
      - run: cp -r path/to/bga-img dist/bga-img  # BGA 图片
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

## TLS / HTTPS

后端如果需要 HTTPS（生产必需，因为 GitHub Pages 是 HTTPS，混合内容会被浏览器阻止）：

**方案 A：云服务商 Load Balancer**（推荐）
- 使用 AWS ALB / Cloudflare Tunnel / DigitalOcean LB 等做 TLS 终止
- Docker 容器只需暴露 HTTP

**方案 B：加一个 Nginx 容器**
```yaml
# docker-compose.yml 中增加
nginx:
  image: nginx:alpine
  ports:
    - "443:443"
  volumes:
    - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    - ./deploy/certs:/etc/nginx/certs:ro
  depends_on:
    app:
      condition: service_healthy
```

**方案 C：Caddy（自动 HTTPS）**
```yaml
caddy:
  image: caddy:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy-data:/data
```

Caddyfile:
```
api.your-domain.com {
    reverse_proxy app:5175
}
```

## 验证清单

- [ ] `docker compose build` 成功
- [ ] `docker compose up -d` 后 `curl /api/health` 返回 ok
- [ ] GitHub Pages 部署后能访问登录页
- [ ] 注册 → 登录 → 创建房间 → 游戏正常
- [ ] WebSocket 连接正常（跨域 wss://）
- [ ] `docker compose down && up` 后数据持久（SQLite volume）
- [ ] Card art 上传和显示正常
- [ ] Workshop 功能正常

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `Dockerfile` | 新建 | 多阶段构建，Node 22 Alpine，仅后端 |
| `docker-compose.yml` | 新建 | 单服务 + volume |
| `.dockerignore` | 新建 | 排除不需要的文件 |
| `.env.example` | 新建 | 环境变量模板 |
| `src/config.ts` | 新建 | API_BASE / WS_BASE 配置 |
| `src/contexts/AuthContext.tsx` | 修改 | 使用 API_BASE |
| `src/services/gameTransport.ts` | 修改 | 使用 API_BASE / WS_BASE |
| `src/app/*.tsx` | 修改 | API 调用使用 API_BASE |
| `server/index.ts` | 修改 | CORS origin 可配置 |
| `vite.config.ts` | 修改 | BGA 图片构建时复制 |
| `.github/workflows/deploy-pages.yml` | 新建（可选） | GitHub Actions 自动部署 |
