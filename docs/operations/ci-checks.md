# CI Checks Operations

当前 GitHub Actions 月度额度已耗尽，`ci.yml` 和 `ci-full.yml` 仅保留 `workflow_dispatch`，不作为合入证据。提交和 rebase merge 前必须在 owner 控制的本机跑完下列 CI 并把结果写入 PR；push 后不触发或等待 Actions。仓库 ruleset 暂不配置 required `verify` check，避免形成无法满足的门禁。

## 本机全量 CI

本机执行普通 CI 与 CI Full 的并集；`pnpm test` 已覆盖 fast + slow，无需再重复 `pnpm test:fast`：

```bash
pnpm install --frozen-lockfile
pnpm run check:architecture
pnpm run lint:i18n
pnpm test
pnpm test:llm
pnpm run check:prompt-sync -- --strict
pnpm run build
REPLAY_VIEWER_ROOT="$(mktemp -d)" pnpm run build:replay-viewer
pnpm run check:bundle-size
pnpm run check:community-deck
```

`check:architecture` 是唯一架构门禁清单，包含 lint、测试 project scope、直接 session log、effect 文件清单、生成卡牌同步、strict no-DSL、catalog types 和卡牌实现边界。两份 workflow 各调用它一次，meta-test 防止接线漂移。

## 恢复 GitHub 门禁

额度恢复后再按顺序启用：

1. 为 `ci.yml` 恢复 `pull_request` 和 `push: main` 触发。
2. 让一次 PR run 和一次 main run 的 `verify` job 成功完成。
3. 确认 check 名稳定为 `CI / verify` 后，再把它加入 main ruleset required status checks。
4. 更新本节并恢复 push 后等待 Actions 的要求。

在上述四步完成前，不把手动 workflow 的 check 配成 required。

## 加载 GH_TOKEN

仓库根目录的 `.env` 已有一行 `GH_TOKEN=...`。在 shell 中加载：

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
```

**不要**把 `GH_TOKEN` 写到 commit 里或发到日志。`.env` 已在 `.gitignore`。

## 最近 run 状态

```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3' \
  | jq '.workflow_runs[] | {name, head_sha, status, conclusion, html_url}'
```

或 gh CLI 等价：

```bash
gh run list --limit 5
```

## 失败 job 日志

```bash
curl -sL -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs/<RUN_ID>/logs" \
  -o /tmp/run.zip && unzip -p /tmp/run.zip
```

或 gh CLI：

```bash
gh run view <RUN_ID> --log-failed
```

## 手动触发前端部署

```bash
curl -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/deploy-pages.yml/dispatches \
  -d '{"ref":"main"}'
```

## 查 GitHub repo variables

```bash
# 一次性查所有 variable
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/variables \
  | jq '.variables[] | {name, value}'

# 单个
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/variables/VITE_API_BASE
```

前端关键 variable：`VITE_API_BASE`（HTTPS 后端 base，如 `https://your-game.duckdns.org`）、`VITE_WS_BASE`（`wss://.../ws`）。

GitHub Actions 固定使用 `ubuntu-latest`；额度不足时 workflow 直接失败，不切换到 self-hosted runner。

## 本地可信操作

长期凭据只保存在已忽略的本地 `.env` 或本机 SSH 配置中：

```bash
pnpm test:llm:live

set -a
source .env
set +a
gh workflow run deploy-pages.yml --ref main  # 仅在 public-assets.ref 更新后执行
./deploy-backend.sh root@your-game.duckdns.org main /root/open-agricola
```

## 引用

- GitHub Actions 页面：https://github.com/titanxxh/open-agricola/actions
- 仓库 token 管理：仓库 → Settings → Actions → Variables
