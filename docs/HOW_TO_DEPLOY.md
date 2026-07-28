# How to Deploy Open Agricola

本文档面向想要自行部署 Open Agricola 平台的开发者。

## 架构概览

```
┌──────────────────────────────┐      ┌───────────────────────────────┐
│  GitHub Pages (CDN)          │      │  VPS (你的服务器)               │
│                              │      │                               │
│  index.html + JS/CSS         │─────▶│  Node.js 后端                  │
│  bga-img/ (卡牌图片)          │      │    ├── HTTP API  /api/*       │
│                              │      │    ├── WebSocket /ws          │
└──────────────────────────────┘      │    ├── Card art  /card-art/*  │
                                      │    └── SQLite    ./data/*.db  │
                                      └───────────────────────────────┘
```

前端和后端完全分离——前端是纯静态文件（GitHub Pages），后端是一个 Docker 容器（VPS）。

---

## 一、部署后端

后端部署分两种情况：
- **情况 A**：全新 VPS，只有公网 IP，没有域名
- **情况 B**：有域名 + 已有 HTTPS（Nginx + Let's Encrypt / Certbot）

两种情况都需要先完成基础步骤。

### 1. 基础步骤（两种情况通用）

#### 容量基准规格

单实例容量统一以 **2 vCPU / 2 GiB 内存**为测量锚点，真实命令与 Replay 写入复测见
[`docs/performance/replay-room-capacity.md`](performance/replay-room-capacity.md)。
该规格最多保留 **30 个普通 `waiting + playing` Room**；只有相同探针的新报告可以上调。

#### 安装 Docker

```bash
# 一键安装 Docker（Ubuntu/Debian/CentOS）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录 SSH 让 docker 组生效
```

#### 拉取代码

```bash
git clone https://github.com/YOUR_USER/open-agricola.git
cd open-agricola
git checkout platform
```

#### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`（后续步骤会覆盖部分值，先填通用的）：

```env
BACKEND_PORT=5175
NODE_ENV=production
PERSIST_ROOMS=sqlite
ALLOW_ANONYMOUS_WS=false
REPLAY_NEW_ROOMS_ENABLED=false
REPLAY_VIEWER_BUILD_ID=
REPLAY_VIEWER_ROOT=./data/replay-viewers
REPLAY_ASSET_ROOT=./data/replay-assets
REPLAY_TRUST_PROXY=false
GAME_BUILD_ID=
# CORS_ORIGIN 等后续根据情况设置
```

后端直接暴露端口时保持 `REPLAY_TRUST_PROXY=false`。只有后端仅能经可信 Caddy/Nginx 到达，且代理会覆盖 `X-Forwarded-For` 时才设为 `true`。
仓库的 `docker-compose.prod.yml` 使用隔离的 Caddy 作为唯一入口，因此已固定为 `REPLAY_TRUST_PROXY=true`。

首次启用 Replay 时必须使用 `PERSIST_ROOMS=sqlite`。先生成并追加发布 Viewer Build：

```bash
REPLAY_VIEWER_ROOT="$PWD/data/replay-viewers" \
BGA_IMAGE_DIR="../bga-agricola/img" \
pnpm run build:replay-viewer
# stdout 最后一行是 REPLAY_VIEWER_BUILD_ID
```

`BGA_IMAGE_DIR` 必须指向固定版本的完整 `img/`；CI 使用 `bga-devs/bga-agricola@20397289f6b82ec9667a13e7803ca3038eeb6bb6`。命令会把棋盘图、卡图、字体和其他静态资源一起复制进独立只读 Viewer，再生成逐文件 SHA-256 清单，以清单本身的 SHA-256 作为目录名，并在发布后重新校验完整目录；运行时不再依赖 BGA CDN，已存在的同 ID 目录不会覆盖。

`docker-compose.prod.yml` 使用 `app-data:/app/data` named volume。保持 `REPLAY_NEW_ROOMS_ENABLED=false` 启动一次后，把 Build 追加进去，再启用录制：

运行下方命令前，把上一步 stdout 最后一行填入 `.env` 的 `REPLAY_VIEWER_BUILD_ID`，并把 `git rev-parse HEAD` 的输出填入 `GAME_BUILD_ID`。

```bash
set -a
source .env
set +a
test -n "$REPLAY_VIEWER_BUILD_ID"
test -n "$GAME_BUILD_ID"
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app \
  mkdir -p "/app/data/replay-viewers/$REPLAY_VIEWER_BUILD_ID"
docker compose -f docker-compose.prod.yml cp \
  "data/replay-viewers/$REPLAY_VIEWER_BUILD_ID/." \
  "app:/app/data/replay-viewers/$REPLAY_VIEWER_BUILD_ID"
# 复制完成后，在 .env 改为 REPLAY_NEW_ROOMS_ENABLED=true
docker compose -f docker-compose.prod.yml up -d --force-recreate app
```

清单、内容 Hash 或入口校验失败时拒绝创建新 Room。开关、Build ID 和自定义卡运行时版本在 Room 创建时锁定；自定义卡图复制到 `REPLAY_ASSET_ROOT` 的内容寻址文件。已有 Replay Room 会继续按锁定值记录，开关关闭期间不会迁移旧进行局。

Bug Report 使用独立 GitHub App，只安装到 `titanxxh/open-agricola-issues`：

1. Repository permissions 只开启 `Issues: Read and write`，安装范围只选 issues-only 仓库。
2. Callback URL 设为 `<PUBLIC_API_BASE>/api/v1/issue-submission-connection/github/callback`。
3. Webhook URL 设为 `<PUBLIC_API_BASE>/api/v1/github-app/webhook`，配置独立 webhook secret，并订阅 GitHub App authorization 和 Issues 事件。
4. 在 `.env` 填写 App ID、Client ID/secret、单行 `\n` 转义的 private key、webhook secret、installation ID 和 issues-only repository ID。
5. 生成 32 字节随机加密密钥，使用 JSON key ring 配置 `BUG_REPORT_TOKEN_ENCRYPTION_KEYS`，并让 `BUG_REPORT_TOKEN_ACTIVE_KEY_ID` 指向其中一个 key。
6. 保持 `BUG_REPORTS_ENABLED=false` 启动并完成迁移；验证 Hosted 与本人 GitHub 两条链路后再改为 `true`。关闭开关只隐藏新入口，不会丢弃既有草稿或交付队列。

启用后，`PUBLIC_APP_ORIGIN` 缺失或不是有效的 HTTP(S) 前端地址会让健康检查返回 `503`，并暂停 OAuth、新草稿和交付，避免创建缺少对局链接的 Issue。

```env
BUG_REPORTS_ENABLED=false
BUG_REPORT_GITHUB_APP_ID=
BUG_REPORT_GITHUB_CLIENT_ID=
BUG_REPORT_GITHUB_CLIENT_SECRET=
BUG_REPORT_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
BUG_REPORT_GITHUB_WEBHOOK_SECRET=
BUG_REPORT_GITHUB_INSTALLATION_ID=
BUG_REPORT_GITHUB_REPOSITORY_ID=
BUG_REPORT_TOKEN_ENCRYPTION_KEYS={"v1":"<32-byte-base64-key>"}
BUG_REPORT_TOKEN_ACTIVE_KEY_ID=v1
```

#### 构建并启动

```bash
docker compose up -d --build
```

#### 验证

```bash
curl http://localhost:5175/api/health
# 应返回: {"ok":true}
```

查看日志：

```bash
docker compose logs -f app
```

---

### 情况 A：全新 VPS，只有公网 IP，没有域名

> 适用于：刚买的 VPS，没有域名，想用最简单的方式让后端跑起来。

#### 方案 A1：纯 HTTP（仅限测试，前端也需 HTTP）

最简单的方式。缺点：**GitHub Pages 是 HTTPS，无法直接连接 HTTP 后端**（浏览器会拦截混合内容）。所以前端也必须用 HTTP 方式部署（不用 GitHub Pages，用 VPS 自身提供静态文件）。

**步骤：**

1. 编辑 `.env`：

   ```env
   CORS_ORIGIN=*
   ```

2. 修改 `docker-compose.yml`，在 app 容器中挂载前端构建产物：

   ```bash
   # 本地构建前端（指向 VPS 公网 IP）
   VITE_API_BASE=http://YOUR_VPS_IP:5175 pnpm run build
   ```

3. 把 `dist/` 目录上传到 VPS，然后用简单 HTTP 服务器托管：

   ```bash
   # 在 VPS 上
   cd dist
   python3 -m http.server 8080 &
   ```

4. 访问 `http://YOUR_VPS_IP:8080`

5. WebSocket 地址：`ws://YOUR_VPS_IP:5175/ws`

> ⚠️ 此方案不安全（明文传输密码），仅用于本地测试或内网。

#### 方案 A2：Caddy 自签 / IP 直连 + 自动 HTTPS（推荐，需要域名）

如果你有域名（即使是免费的），Caddy 可以自动申请 Let's Encrypt 证书，零配置 HTTPS。

**获取免费域名（可选）：**

- [DuckDNS](https://www.duckdns.org/) — 免费子域名，如 `your-game.duckdns.org`
- [No-IP](https://www.noip.com/) — 免费 DDNS
- [FreeDNS](https://freedns.afraid.org/) — 免费子域名

**步骤：**

1. 把域名 DNS A 记录指向你的 VPS IP

2. 创建 `deploy/Caddyfile`：

   ```
   your-game.duckdns.org {
       reverse_proxy app:5175
   }
   ```

3. 创建 `docker-compose.prod.yml`（不覆盖原文件）：

   ```yaml
   services:
     app:
       build: .
       expose:
         - "5175"
       environment:
         - NODE_ENV=production
         - BACKEND_PORT=5175
         - BACKEND_HOST=0.0.0.0
         - PERSIST_ROOMS=sqlite
         - ALLOW_ANONYMOUS_WS=false
         - DB_PATH=./data/open-agricola.db
         - CARD_ART_DIR=./data/card-art
         - REPLAY_NEW_ROOMS_ENABLED=${REPLAY_NEW_ROOMS_ENABLED:-false}
         - REPLAY_VIEWER_BUILD_ID=${REPLAY_VIEWER_BUILD_ID:-}
         - REPLAY_VIEWER_ROOT=${REPLAY_VIEWER_ROOT:-./data/replay-viewers}
         - REPLAY_ASSET_ROOT=${REPLAY_ASSET_ROOT:-./data/replay-assets}
         - REPLAY_TRUST_PROXY=true
         - GAME_BUILD_ID=${GAME_BUILD_ID:-}
         - CORS_ORIGIN=https://YOUR_USER.github.io
       volumes:
         - app-data:/app/data
         - app-output:/app/output
       restart: unless-stopped

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
       restart: unless-stopped

   volumes:
     app-data:
     app-output:
     caddy-data:
   ```

4. 启动：

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

5. 验证：

   ```bash
   curl https://your-game.duckdns.org/api/health
   ```

6. 前端 `VITE_API_BASE` 设为 `https://your-game.duckdns.org`

> Caddy 会自动申请和续期 Let's Encrypt 证书，你无需手动管理。

---

### 情况 B：已有域名 + HTTPS（Nginx + Let's Encrypt）

> 适用于：VPS 上已经跑了 Nginx，已通过 Certbot 配了 HTTPS 证书。

这种情况最简单——Docker 只暴露 HTTP 端口，Nginx 做反向代理 + TLS 终止。

**步骤：**

1. 编辑 `.env`：

   ```env
   CORS_ORIGIN=https://YOUR_USER.github.io
   ```

2. 确保 `docker-compose.yml` 端口映射绑定到 `127.0.0.1`（仅本地可访问）：

   ```yaml
   ports:
     - "127.0.0.1:5175:5175"
   ```

3. 启动 Docker：

   ```bash
   docker compose up -d --build
   ```

4. 为后端 API 添加一个 Nginx server block 或 location。

   因为下面配置会覆盖 `X-Forwarded-For`，同时在后端 `.env` 设置 `REPLAY_TRUST_PROXY=true`。

   **方式一：子域名（推荐）**，如 `api.your-domain.com`

   先申请子域名证书：

   ```bash
   sudo certbot --nginx -d api.your-domain.com
   ```

   然后添加 Nginx 配置 `/etc/nginx/sites-available/open-agricola-api`：

   ```nginx
   server {
       listen 443 ssl;
       server_name api.your-domain.com;

       ssl_certificate     /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:5175;
           proxy_http_version 1.1;

           # WebSocket 支持（必须，否则多人游戏不工作）
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";

           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;

           # WebSocket 超时设长一些
           proxy_read_timeout 86400s;
           proxy_send_timeout 86400s;
       }
   }

   server {
       listen 80;
       server_name api.your-domain.com;
       return 301 https://$host$request_uri;
   }
   ```

   **方式二：子路径**，如 `your-domain.com/agricola-api/`

   在现有 server block 里添加：

   ```nginx
   location /agricola-api/ {
       rewrite ^/agricola-api/(.*) /$1 break;
       proxy_pass http://127.0.0.1:5175;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_read_timeout 86400s;
       proxy_send_timeout 86400s;
   }
   ```

5. 启用配置并重载 Nginx：

   ```bash
   # 仅子域名方式需要
   sudo ln -s /etc/nginx/sites-available/open-agricola-api /etc/nginx/sites-enabled/

   sudo nginx -t          # 测试配置
   sudo systemctl reload nginx
   ```

6. 验证：

   ```bash
   curl https://api.your-domain.com/api/health
   ```

7. 前端 `VITE_API_BASE` 设为 `https://api.your-domain.com`（或 `https://your-domain.com/agricola-api`）

> **关键：Nginx 必须转发 WebSocket**。如果忘了 `Upgrade` / `Connection` 头，HTTP API 正常但多人游戏会断连。

---

## 二、部署前端（GitHub Pages）

### 前置条件

- GitHub 仓库 Settings → Pages → Source 选 **GitHub Actions**
- 仓库 Settings → Environments → `github-pages` → Deployment branches 允许你的分支（如 `platform`）

### 配置

在 Settings → Secrets and variables → Actions → **Variables** 标签中添加：

| Variable | 值 | 示例 |
|----------|---|------|
| `VITE_API_BASE` | 后端完整 URL | `https://api.your-domain.com` 或 `http://VPS_IP:5175`（仅 HTTP 方案） |
| `VITE_WS_BASE` | WebSocket URL（可选，自动推导） | `wss://api.your-domain.com/ws` |

### 触发部署

Push 到 `platform` 分支会自动触发 `.github/workflows/deploy-pages.yml`。也可以在 Actions 页面手动触发（workflow_dispatch）。

部署成功后访问：`https://YOUR_USER.github.io/open-agricola/`

### 手动构建（不用 GitHub Actions）

```bash
VITE_API_BASE=https://api.your-domain.com pnpm run build
pnpm dlx gh-pages -d dist
```

### BGA 卡牌图片

构建时自动从 `$BGA_IMAGE_DIR`（默认 `../bga-agricola/img`）复制图片。如果目录不存在，构建仍然成功，只是游戏内不显示卡牌图片（不影响规则）。

---

## 三、更新部署

### 后端

```bash
cd open-agricola
git pull
docker compose up -d --build
# 或 Caddy 方案：
docker compose -f docker-compose.prod.yml up -d --build
```

数据（SQLite 数据库、card art）存储在 Docker volume 中，重建容器不会丢失。

### 前端

Push 到 `platform` 分支即可自动重新部署。

---

## Auth OAuth

生产环境必须配置 OAuth 登录/注册。直接调用 `/api/auth/register` 已禁用。

必需后端环境变量：

- `PUBLIC_APP_ORIGIN`：用户在浏览器中打开的前端地址；GitHub Pages 子路径部署要包含 base path，例如 `https://your-user.github.io/open-agricola/`。
- `PUBLIC_API_BASE`：用户浏览器可访问的后端 origin，例如 `https://api.your-domain.com`，用于 OAuth provider callback URL 和邮箱验证链接；生产环境必填。
- `CORS_ORIGIN`：前后端不同源时必须等于前端 origin。
- `ACCOUNT_GITHUB_OAUTH_CLIENT_ID` / `ACCOUNT_GITHUB_OAUTH_CLIENT_SECRET`：账号登录/注册用 GitHub OAuth App 凭据。
- `ACCOUNT_GOOGLE_OAUTH_CLIENT_ID` / `ACCOUNT_GOOGLE_OAUTH_CLIENT_SECRET`：账号登录/注册用 Google OAuth Client 凭据。

OAuth callback URL 填后端 origin：

```text
https://<backend-origin>/api/auth/oauth/github/callback
https://<backend-origin>/api/auth/oauth/google/callback
```

生产环境不要设置：

- `ALLOW_ANONYMOUS_WS=true`
- `ENABLE_AUTH_TEST_HELPERS=1`

---

## 四、验证清单

部署完成后逐项验证：

- [ ] `curl https://your-backend/api/health` 返回 `{"ok":true}`
- [ ] 访问前端 URL，能看到登录页
- [ ] 首次部署时先用 `ACCOUNT_REGISTRATION_POLICY=open` 注册 `ADMIN_USERS` 中的第一个管理员账号
- [ ] 管理员能进入 Settings 生成邀请码后，将 `ACCOUNT_REGISTRATION_POLICY` 改为 `invite_only` 并重启后端
- [ ] 通过 GitHub 或 Google + 邀请码注册新用户
- [ ] 登录成功，进入大厅
- [ ] 创建房间，开始游戏
- [ ] WebSocket 连接正常（浏览器 Console 无 WS 错误）
- [ ] 双人模式：两个浏览器窗口加入同一房间
- [ ] 进行局与结束局原参与者都能打开三步 Bug Report，非参与者被拒绝
- [ ] 本人 GitHub 与 Hosted Identity 各创建一个 Issue，正文只含现象、Reporter ID 和对局锚点
- [ ] Settings 能断开 Issue Submission Connection，GitHub 撤销授权后连接状态失效
- [ ] Workshop：创建/浏览自定义卡牌
- [ ] Card art 上传和显示正常
- [ ] `docker compose down && docker compose up -d` 后数据仍在（SQLite 持久化）

---

## 五、环境变量参考

### 后端（Docker / .env）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BACKEND_PORT` | `5175` | HTTP/WS 监听端口 |
| `BACKEND_HOST` | `0.0.0.0` | 绑定地址 |
| `NODE_ENV` | — | 设为 `production` 启用生产模式 |
| `PERSIST_ROOMS` | `sqlite` | 房间持久化方式 (`sqlite` / `json`) |
| `ALLOW_ANONYMOUS_WS` | `true`(dev) / `false`(prod) | 是否允许匿名 WebSocket |
| `CORS_ORIGIN` | `*` | 允许的前端域名，生产环境必须设置 |
| `PUBLIC_APP_ORIGIN` | — | 前端公开地址；Pages 子路径部署要包含 `/open-agricola/` |
| `PUBLIC_API_BASE` | — | 后端公开 origin，用于 OAuth provider callback URL 和邮箱验证链接；生产环境必填 |
| `EMAIL_DELIVERY` | `log` | 邮件发送模式；生产用户名密码注册必须设为 `resend` |
| `RESEND_API_KEY` | — | Resend API key，只给后端容器 |
| `EMAIL_FROM` | — | 发信地址，例如 `Open Agricola <no-reply@mail.example.com>` |
| `EMAIL_REPLY_TO` | — | 可选回复地址 |
| `ACCOUNT_GITHUB_OAUTH_CLIENT_ID` | — | 账号 GitHub OAuth App client id |
| `ACCOUNT_GITHUB_OAUTH_CLIENT_SECRET` | — | 账号 GitHub OAuth App client secret |
| `ACCOUNT_GOOGLE_OAUTH_CLIENT_ID` | — | 账号 Google OAuth client id |
| `ACCOUNT_GOOGLE_OAUTH_CLIENT_SECRET` | — | 账号 Google OAuth client secret |
| `BUG_REPORTS_ENABLED` | `false` | 是否允许创建新的 Bug Report 草稿 |
| `BUG_REPORT_GITHUB_APP_ID` | — | issues-only GitHub App ID |
| `BUG_REPORT_GITHUB_CLIENT_ID` | — | GitHub App Client ID |
| `BUG_REPORT_GITHUB_CLIENT_SECRET` | — | GitHub App Client secret |
| `BUG_REPORT_GITHUB_PRIVATE_KEY` | — | GitHub App private key，使用单行 `\n` 转义 |
| `BUG_REPORT_GITHUB_WEBHOOK_SECRET` | — | GitHub App webhook secret |
| `BUG_REPORT_GITHUB_INSTALLATION_ID` | — | issues-only 仓库的 App installation ID |
| `BUG_REPORT_GITHUB_REPOSITORY_ID` | — | `titanxxh/open-agricola-issues` 数字 repository ID |
| `BUG_REPORT_TOKEN_ENCRYPTION_KEYS` | — | AES-256-GCM key ring JSON；每个值为 32 字节 base64 |
| `BUG_REPORT_TOKEN_ACTIVE_KEY_ID` | — | 新令牌使用的 key ring key ID |
| `ENABLE_AUTH_TEST_HELPERS` | — | 仅本地/E2E 可设 `1`，生产禁止设置 |
| `DB_PATH` | `./data/open-agricola.db` | SQLite 文件路径 |
| `CARD_ART_DIR` | `./data/card-art` | 上传的卡牌图片存储路径 |
| `REPLAY_TRUST_PROXY` | `false` | 仅当后端只能经会覆盖 `X-Forwarded-For` 的可信反向代理访问时设为 `true` |
| `ADMIN_USERS` | — | 管理员用户名，逗号分隔 |
| `ACCOUNT_REGISTRATION_POLICY` | 必填 | 账号注册策略：首次部署用 `open` 创建第一个管理员，之后改为 `invite_only`；`disabled` 禁止新账号注册 |

### Resend 邮箱验证

1. 在 Resend 添加并验证发信域名。
2. 创建 Sending access API key。
3. 在后端 `.env` 中设置：

   ```bash
   EMAIL_DELIVERY=resend
   RESEND_API_KEY=re_xxx
   EMAIL_FROM="Open Agricola <no-reply@mail.example.com>"
   ```

4. 确认 `PUBLIC_API_BASE` 是用户可访问的后端 HTTPS 地址，`PUBLIC_APP_ORIGIN` 是前端地址。

### 前端（构建时注入）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_BASE` | `''`（空=同源） | 后端 API 地址 |
| `VITE_WS_BASE` | 从 API_BASE 推导 | WebSocket 地址 |
| `BGA_IMAGE_DIR` | `../bga-agricola/img` | BGA 卡牌图片目录（构建时复制） |

---

## 六、常见问题

### WebSocket 连接失败

- 确认后端 HTTPS 配置正确（GitHub Pages 是 HTTPS，WS 必须用 `wss://`）
- 确认反向代理转发 WebSocket upgrade 头（Nginx 需要 `proxy_set_header Upgrade`）
- 检查 `VITE_WS_BASE` 是否正确设置
- Nginx `proxy_read_timeout` 太短会导致 WS 连接被切断，建议 `86400s`

### CORS 错误

- 检查 `.env` 中 `CORS_ORIGIN` 是否与前端域名完全匹配（含 `https://`，不含尾部 `/`）
- 如果使用自定义域名，确保 `CORS_ORIGIN` 与实际访问域名一致

### 混合内容被拦截（Mixed Content）

- 浏览器会阻止 HTTPS 页面加载 HTTP 资源
- 解决：后端必须配置 HTTPS（方案 A2 或情况 B）
- 临时方案：前端也用 HTTP 部署（方案 A1），但不安全

### 卡牌图片不显示

- 不影响游戏功能，仅影响显示
- 确认 BGA 图片目录存在且路径正确

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

```bash
pnpm install
./restart-intranet.sh
```

`VITE_API_BASE` 未设置时默认为空字符串（同源），开发模式下前端自动连接 `localhost:5175`。
