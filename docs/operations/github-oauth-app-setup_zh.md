# Workshop GitHub App 配置与切换

[English](github-oauth-app-setup.md) | [中文](github-oauth-app-setup_zh.md)

保留历史文件名。工坊投稿 OAuth 已退役；一个 Workshop App 负责机器人投稿和审核读取，登录 OAuth 与 Bug Report App 独立。

## 配置现有 Workshop Review App

1. 在 [GitHub App 设置](https://github.com/settings/apps) 打开已安装的 Workshop Review App。授予仓库 **Contents: Read and write**、**Pull requests: Read and write** 及自动的 **Metadata: Read-only**。仅安装到 `titanxxh/open-agricola`，在安装页确认权限变更。不授予 Workflows、Actions、Administration 或 main 规则绕过权限。
2. 保留 webhook URL `<PUBLIC_API_BASE>/api/github/webhook`、独立 secret，仅订阅 **Pull request** 和 **Pull request review**。部署后确认 Recent deliveries 返回 2xx。
3. 后端保留同一 App 的现有变量名：

   ```env
   WORKSHOP_PR_ENABLED=false
   GITHUB_UPSTREAM_OWNER=titanxxh
   GITHUB_UPSTREAM_REPO=open-agricola
   WORKSHOP_REVIEW_GITHUB_APP_ID=<App ID>
   WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID=<Installation ID>
   WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET=<Webhook secret>
   ```

4. 后端分别签发限定仓库的 installation token：投稿用 `contents:write,pull_requests:write`，审核用 `contents:read,pull_requests:read`。这是同一 App 内的用途收窄，不是独立信任域。App 缺失或被撤销时停止写入，不回退到 PAT、维护者用户身份或旧 OAuth。

私钥/token 不提交、不记录、不贴入 issue。Docker compose 传递 App 设置；本地仍用 `./restart-local.sh`。

## 切换前只读盘点

先在 shell 配置目标数据库和 App 环境，再运行：

```bash
pnpm exec tsx scripts/workshop-submission-inventory.ts > workshop-inventory.json
```

必须读真实目标数据库，不能只看 GitHub PR 列表。脚本不迁移 schema，不修改卡牌、授权、分支或 PR。报告关联卡牌、版本、head、批准/上线状态、`owner:` 合成批准、远端状态，以及 upstream/fork/detached/missing 仓库分类。缺凭据或读取失败明确标记，不视为不存在；另在 GitHub 安装页确认写权限。

上线新版前逐条处理合成批准。尚未合并的 owner PR 保留历史；作者明确下架已上线卡、编辑并重新确认版本，再选择“重新投稿”。新的 App PR 必须取得真实授权 reviewer 批准，不复制或重命名旧批准。已合并且发布的卡继续内置接管。存在未处理的上线合成批准时不要切换：移除 OWNER 合成会改变刷新/webhook 对这些记录的判断，因此盘点和生命周期决策必须早于部署新的 review provider，而非仅早于开启投稿开关。

旧投稿按固定版本重建并核对源码和图片，源码只忽略溯源头注释；独立测试保留。缺版本或人工差异会暂停。维护者可将修改整合进作者草稿，保留人工工作的 Git commit，并在旧 PR 恢复已保存的生成基线后明确重新投稿。不得自动公开、删除、脱离或强推旧私有 fork。

Migration 017 将未上线的合成批准记入既有投稿审计，清空批准并转为 stale，保留 PR/版本绑定。若尚未合并、未内置的合成批准卡仍上线，则停止部署。这样盘点决策有实际门禁，重复执行也不会复制审计。

## 启用与验收

盘点决策和 App 配置完成后部署后端，设置 `WORKSHOP_PR_ENABLED=true`。使用普通站点作者验证：

- 沙盒确认且中文完整的卡直接创建机器人 PR，不需要 GitHub 投稿登录或个人 fork；核对 PR 和 commit 作者。
- 更新复用原 PR、保留独立测试；人工修改生成源码/图片会暂停并显示旧链接。draft/改 base 暂停，关闭后必须明确重新投稿。
- 丢弃投稿响应、重启应用实例后，重开窗口读取原操作；“再次核实”只恢复它。未知结果不另分配分支、不盲目再次 POST PR。
- 真实 reviewer 对精确 head 批准后作者可在合并前上架；head 改变、撤销或 changes-requested 使批准失效，新 PR 不继承旧批准。
- 查看机器人 PR 实际 head 的 Actions，等待结束并处理失败。同仓库 PR 代码只能取得只读工作流 token，不接触生产密钥；投稿范围禁止 `.github/workflows`。不削弱 main 规则，不授予 App 绕过权限。本地 adapter 用例不等于真实 GitHub 验收。

后台每条最多四次自动对账，从 30 秒开始指数退避并遵守 GitHub 等待提示。等待期结束后“再次核实”可重新开始原操作的有界对账。`creation_unknown`/`ambiguous_pr` 由维护者按操作编号查找分支和 PR，不删除记录来强行重复投稿。分支冲突保留原预期 head；恢复该计划基线或手工完成整合，程序不会读取新 head 后强推覆盖。

## 退役旧投稿 OAuth

新版删除 `/api/workshop/github/oauth/start`、`/callback`、弹窗握手和加密 token 缓存；migration 016 只删除 `workshop_oauth_handshakes`。清除部署和本地环境的 `GITHUB_OAUTH_CLIENT_ID`、`GITHUB_OAUTH_CLIENT_SECRET`、`WORKSHOP_TOKEN_ENCRYPTION_KEY`，保留 `ACCOUNT_GITHUB_OAUTH_*`、`ACCOUNT_GOOGLE_OAUTH_*` 与 `BUG_REPORT_*`。

删除本地密文或缩小 scope **不代表撤销远端授权**。旧 token 可能已在本地消费或过期，无法再安全通过 API 撤销。受影响作者在 [Authorized OAuth Apps](https://github.com/settings/applications) 按名称和 owner 核对旧的 **Workshop 投稿 OAuth App**，选择 Revoke 并确认它消失；不要撤销独立的登录 OAuth 或 Bug Report GitHub App。维护者核对 App ID、保留盘点后，可在 Developer settings 删除退役的投稿 OAuth App；其他 App 不在本操作范围。

## 回退

设置 `WORKSHOP_PR_ENABLED=false` 停止新交付与后台重试，保留 PostgreSQL 操作记录、草稿、版本及远端 PR，修复配置后继续同一操作。不自动删远端分支、回退数据库或恢复宽权限 OAuth。审核/webhook 与写入开关独立。migration 016 已移除旧 token 表，回滚旧代码还需要明确的配置/schema 方案；运维回退方式是保持新 schema 并关闭写入。
