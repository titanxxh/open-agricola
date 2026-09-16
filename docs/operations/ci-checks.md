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
pnpm run build
REPLAY_VIEWER_ROOT="$(mktemp -d)" pnpm run build:replay-viewer
pnpm run check:bundle-size
pnpm run check:community-deck
```

`check:architecture` 是唯一架构门禁清单，包含 lint、测试 project scope、直接 session log、effect 文件清单、生成卡牌同步、strict no-DSL、catalog types、卡牌实现边界、架构契约类型检查、架构契约测试、strict prompt-sync、零循环依赖检查以及浏览器/Replay 真实构建隔离检查。两份 workflow 各调用它一次，meta-test 防止接线漂移。

`check:architecture-tests` 复用现有 Vitest project 配置，执行 effect 架构、资源事实来源审计、事件映射策略、交互命令策略、Card Source、PromptKey、LLM prompt 契约和 CI 接线测试。它们仍属于 `pnpm test` / `pnpm test:fast`，保证单独运行完整测试时不漏检；只跑架构入口也会执行这些断言。沙盒文档的名字集合同步由入口内的 strict prompt-sync 检查，完整 CI 无需再单独执行该命令。

架构类型门禁执行 `tsc -p tsconfig.architecture.json --noEmit`，包含此前仅由 Vitest 执行的五组契约测试。依赖检查按 TypeScript 模块解析构图，运行时循环一律失败；仅显式 type-only 声明从运行时图移除。浏览器检查对主页面和 Replay Viewer 分别执行不写产物的 Vite 构建，验证真实传递依赖；普通页面不保留规则运行时基线。确切的沙盒入口、Worker 文件及纯元数据权限见 `scripts/architecture-policy.mjs`，未知入口和失效权限均失败。

测试发现独立于 project glob；Card Source 声明独立于已注册实现枚举。缺少扫描根目录、语法错误、无法解析的依赖，以及 bundle 检查缺少 `dist/assets` 或 JS 产物，都不能产生成功证据。直接 session log 检查与 effect 文件清单复用 `scripts/source-files.ts` 的源码发现：前者覆盖 `shared/`、`server/`、`scripts/` 下全部源码扩展名（`.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs`），`require()` / `import x = require()` / `await import()` 绑定与 ESM import 同等追踪，例外精确到文件 / 函数并附原因，扫描根缺失或为符号链接、解析失败、文件符号链接、失效例外均失败；后者对 `shared/actions/effects/` 顶层任何非 allow-list 文件（不论扩展名）失败，目录缺失、目录为符号链接或顶层符号链接也失败。共享 walker 只在 checkout 确实 git-ignore 时才跳过 `dist` / `coverage` / `test-results` 等产物名目录，嵌套的同名源码目录仍被扫描。`check:bundle-size` 仍负责体积预算，隔离证明由 `check:browser-boundaries` 承担。

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
