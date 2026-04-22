# GitHub OAuth App 注册（Workshop → PR 功能前置）

本文档面向仓库维护者 (titanxxh)。此步骤在代码部署前完成。

## 步骤

1. 访问 https://github.com/settings/applications/new
2. 填：
   - Application name: **Open Agricola Workshop**
   - Homepage URL: `https://titanxxh.github.io/open-agricola/`
   - Authorization callback URL:
     - Dev: `http://localhost:5175/api/workshop/github/oauth/callback`
     - Prod: `https://<backend-host>/api/workshop/github/oauth/callback`
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
   ```

   - Dev: 写 `.env`（已在 `.gitignore`）
   - Prod: 通过 Docker secret 或环境变量注入

6. 验证：服务启动后访问 `GET /api/workshop/github/oauth/start?hs=test`，应 302 到 `github.com/login/oauth/authorize`

## Scope

应用只请求 `public_repo` scope（公开仓库 fork + push + PR），不请求任何其它权限。

## Revocation

若 secret 泄露：
1. 在 App 详情页 "Revoke all user tokens"
2. 点 "Generate a new client secret"
3. 更新服务端 env 的 `GITHUB_OAUTH_CLIENT_SECRET`
4. 重启服务
