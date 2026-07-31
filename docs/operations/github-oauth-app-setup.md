# GitHub OAuth App 注册（Workshop → PR 功能前置）

本文档面向仓库维护者 (titanxxh)。此步骤在代码部署前完成。

## 步骤

1. 访问 [https://github.com/settings/applications/new](https://github.com/settings/applications/new)
2. 填：
  - Application name: **Open Agricola Workshop**
  - Homepage URL: `https://titanxxh.github.io/open-agricola/`
  - Authorization callback URL:
    - Dev: `http://localhost:5175/api/workshop/github/oauth/callback`
    - Prod: `https://<backend-host>/api/workshop/github/oauth/callback`
    - 当前生产示例：`https://open-agricola.duckdns.org:8443/api/workshop/github/oauth/callback`
  - 可配多个 callback URL（每个环境一个）
3. 点 Register application
4. 在 App 详情页点 "Generate a new client secret"，**立刻**复制保存 Client ID 和 Client Secret（secret 离开页面后无法再看）
5. 把 secret 写入服务端 env：
  ```
   GITHUB_OAUTH_CLIENT_ID=<Client ID>
   GITHUB_OAUTH_CLIENT_SECRET=<Client Secret>
   GITHUB_UPSTREAM_OWNER=titanxxh
   GITHUB_UPSTREAM_REPO=open-agricola
   WORKSHOP_PR_ENABLED=true
   # 生产前端在 GitHub Pages 时，后端需要知道自己的公开 URL
   # 用于拼 OAuth callback URL。
   PUBLIC_API_BASE=https://open-agricola.duckdns.org:8443
  ```
  - Dev: 写 `.env`（已在 `.gitignore`）
  - Prod: 通过 Docker secret 或环境变量注入
6. 验证：服务启动后访问 `GET /api/workshop/github/oauth/start?hs=test`，应 302 到 `github.com/login/oauth/authorize`

## Scope

应用请求 `repo` scope，以便在主仓库是 private repository 时读取内容、创建分支并提交 PR。若主仓库改为 public repository，可再收紧为 `public_repo`。

## Workshop Review GitHub App

PR 审批读取和 webhook 使用独立的 GitHub App，不复用 Workshop OAuth App 或 issues-only Bug Report App。

### 注册与安装

1. 在 GitHub App 设置页创建 `open-agricola-workshop-review`，Homepage URL 指向主仓库。
2. Repository permissions 仅设置 `Pull requests: Read-only`；其余权限保持 `No access`，GitHub 自动附带的 `Metadata: Read-only` 除外。
3. Webhook URL 设置为 `<PUBLIC_API_BASE>/api/github/webhook`，用 `openssl rand -hex 32` 生成独立 secret。
4. Subscribe to events 仅勾选 `Pull request` 和 `Pull request review`。
5. 安装范围选择 `Only on this account`，并只安装到 `titanxxh/open-agricola`。
6. 记录 App ID，生成并下载 private key，再从安装页面地址记录 Installation ID。

此 App 不参与用户 OAuth，不需要配置 callback URL、Client ID 或 Client Secret。`POST /api/github/webhook` 上线前关闭 Webhook Active；上线后重新开启并检查 Recent deliveries 返回 2xx。

### 后端配置

把以下变量写入后端部署环境；当前生产配置位置是 `/root/open-agricola/.env`：

```env
WORKSHOP_REVIEW_GITHUB_APP_ID=<App ID>
WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID=<Installation ID>
WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET=<Webhook secret>
```

Private key 中的换行以 `\n` 保存。private key 和 webhook secret 只能进入后端部署密钥，不得提交到仓库、写入日志或粘贴到 issue；issue 只记录变量名、配置位置和安装仓库。`docker-compose.prod.yml` 会把这四项显式传入后端容器。

## Runtime Flow

1. 前端卡牌详情页点击“提交审核”。
2. 前端调用 `POST /api/workshop/cards/:id/submit-review`。
3. 服务端若缺 GitHub token，返回 OAuth start URL。
4. 前端 popup 打开 OAuth URL。生产环境下 popup URL 必须解析到后端域名，而不是 GitHub Pages 路径；前端通过 `VITE_API_BASE` 做 base URL。
5. GitHub callback 页面由后端返回一段 HTML，执行：
  ```js
   window.opener.postMessage({ type: 'workshop-pr-oauth', result }, '*')
  ```
   这里必须用 `'*'`，因为 callback 页面在后端域名，opener 在 GitHub Pages 域名。
6. 前端收到消息后关闭 popup 并重试 submit-review。
7. 服务端：
  - 若授权用户与 upstream owner 相同，跳过 fork，直接使用 upstream repo。
  - 否则确保 fork 存在。
  - 读取 `shared/cards/register-all.ts`、`docs/community_cards.md`。
  - 生成 community card 文件、smoke test、注册表、community docs、可选 card art。
  - 先提交占位 PR number 的 V1 commit，打开或更新 PR。
  - 再提交带真实 PR number 的 V2 commit。
8. Review App 接收 webhook；approved review 经 GraphQL 快照确认后固定被审版本，`synchronize` / `dismissed` 使旧资格变为 stale。
9. 作者调用 `POST /api/workshop/cards/:id/publish` 时再次即时查询 GraphQL，一致才置 live。

## CI Requirements for Generated PRs

生成出的社区卡 PR 必须满足完整 CI，尤其是：

```bash
pnpm run check:community-deck
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run build
```

常见生成问题与对应修复点：


| 症状                                  | 原因                     | 修复位置                                                                      |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `deck` 检查失败                         | 工坊卡仍是 `deck: 'CUSTOM'` | `server/workshop-pr/code-gen.ts` 把 deck 规范成 `community`                   |
| `localeCompare` / listener 排序报错     | listener 缺稳定 `id`      | 生成器给缺 id 的 listener 补 `{cardId}-listener-{n}`                             |
| `catalog.generated.ts is out of sync` | 生成后未提交 generated catalog | 运行 `pnpm run generate:register-all` 并提交 `catalog.generated.ts` / `major/generated.ts` |
| TypeScript 报 `phases: string[]` 不兼容 | `CARD_IMPL` 没有上下文类型    | 生成器把 `CARD_IMPL` 标注为 `CardImpl`                                           |
| TypeScript 报 `prerequisite` 类型不兼容   | 工坊 JSON 用了结构化 prereq   | 生成器把 `{ occupation: N }` 转成 `prerequisite` 文本 + `occupationPrerequisites` |


## Troubleshooting

### OAuth 页面显示 `redirect_uri is not associated with this application`

GitHub OAuth App 的 Authorization callback URL 与服务端实际拼出的 callback 不一致。检查：

- GitHub App 里是否配置了生产 callback：`https://open-agricola.duckdns.org:8443/api/workshop/github/oauth/callback`
- 服务端 `PUBLIC_API_BASE` / 反代 HTTPS 地址是否正确
- 浏览器实际打开的 GitHub 授权 URL 中 `redirect_uri=` 参数是否与 GitHub App 完全一致

### 授权完成后 popup 关闭了，但页面没有创建 PR

优先检查 callback HTML 的 `postMessage` target origin。生产环境是跨域：后端 callback 页面向 GitHub Pages opener 发消息，必须使用 `'*'`。如果限定为 `window.location.origin`，前端收不到消息，propose 不会重试。

### 授权用户就是 upstream owner，fork 失败

GitHub 不允许用户 fork 自己的仓库。`GitHubClient.ensureFork()` 必须在 `login === upstreamOwner` 时直接返回 upstream owner/repo，跳过 fork API。

## Revocation

若 secret 泄露：

1. 在 App 详情页 "Revoke all user tokens"
2. 点 "Generate a new client secret"
3. 更新服务端 env 的 `GITHUB_OAUTH_CLIENT_SECRET`
4. 重启服务
