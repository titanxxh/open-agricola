# CI Checks Operations

agent 在 `git push` 后必须等 GitHub Actions run 结束。本文件给出验证 run 状态、查失败日志、手动触发 workflow、查 repo variables 的完整命令。

## 加载 GH_TOKEN

仓库根目录的 `.env` 已有一行 `GH_TOKEN=...`。在 shell 中加载：

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
```

或参考 `scripts/sync-bga-cdn-github-var.ts` 里的 `loadGhTokenFromDotenv()`：读 `.env` 把 `GH_TOKEN` / `GITHUB_TOKEN` 注入 `process.env`。

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

## 手动触发 deploy-pages workflow

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

关键 variable：`VITE_API_BASE`（HTTPS 后端 base，如 `https://open-agricola.duckdns.org`）、`VITE_WS_BASE`（`wss://.../ws`）、`BGA_CDN_BASE_URL`。

## 切换 GitHub Actions runner

```bash
pnpm run set-runner-label -- github       # RUNNER_LABEL=ubuntu-latest
pnpm run set-runner-label -- self-hosted  # RUNNER_LABEL=self-hosted
```

## 引用

- GitHub Actions 页面：https://github.com/titanxxh/open-agricola/actions
- 仓库 token 管理：仓库 → Settings → Actions → Variables
