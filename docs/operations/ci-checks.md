# CI Checks Operations

`ci.yml`、`ci-full.yml` 和 `e2e.yml` 均声明 `pull_request`（目标 `main`）、`push: main` 和 `workflow_dispatch`，使用只读 `contents` 权限，并按 workflow + PR/ref 隔离 concurrency。自动 job 只在仓库为 public 时执行；私有期仅允许手动执行，避免公开准备阶段消耗私有仓库额度。私有期自动 run 的 skipped job 不是通过验证的证据。

私有期提交和 rebase merge 前仍必须在 owner 控制的本机跑完下列 CI 并把结果写入 PR。push 后等待相关 Actions run 结束，同时明确区分 skipped 和实际执行成功。公开后恢复自动执行，并按下文取得真实成功证据再启用 main 的 required status checks；准备 YAML 不等于 GitHub 门禁已启用。

## 调试与最终验证

使用 Node.js 24.15+（不含 Node 25），按改动范围选择入口：

```bash
# 调试：生成卡牌 manifest，只跑指定 Vitest 文件；不启动应用
pnpm verify focus server/__tests__/session-fixtures.test.ts
pnpm verify focus server/__tests__/first-round-start-session.test.ts --testNamePattern 'direct deal'

# 最终版本：准备测试依赖，完整 fast，再 lint；任一步失败立即停止
pnpm verify prepush

# 真实应用行为：隔离 PostgreSQL / S3、端口，调用 restart-local.sh 后跑 Playwright
pnpm verify e2e-tests/chinese-interface.spec.ts
pnpm verify e2e e2e-tests/chinese-interface.spec.ts  # 显式模式，含义相同
pnpm verify                                      # 保留原有完整 Playwright 入口

pnpm verify status
```

定向测试若依赖 PostgreSQL / S3，先运行一次 `node scripts/local-services.mjs --test`。纯测试、工具和文档调试不要求每次重启应用。涉及运行行为、UI 或 WS 时，最终验收必须通过 `./restart-local.sh` 重启再检查真实行为，或使用上述隔离 Playwright 入口。按风险补相关 slow Session / E2E；`prepush` 不能替代它们或下节的全量 CI。

每次 push 前先 rebase main，再对最终源码运行 `pnpm verify prepush`。定向通过不算完整门禁通过。完整检查通过后，只有后续修改、失败或未解决的问题才需要扩大或重跑；rebase 改变文件内容也需要重跑。

`scripts/verify.ts` 在已忽略的 `output/verification/` 分别记录最近一次 focus、prepush 和 E2E：HEAD、源码指纹、Node 版本、起止时间、实际命令及各步退出码。指纹包含 Git 跟踪文件和未忽略的新文件的内容（包括未提交修改、删除及执行权限），以及 Node / 平台和选定运行环境；不包含验证记录本身。运行中源码变化会使记录失效，之后改动则在 `status` 中显示 stale。只有当前源码对应的 prepush 成功记录才能使 `status` 返回 0。

这些记录用于核对本地检查范围，**不会缓存或跳过检查**；不代表被忽略的环境文件、外部服务状态或远端 CI 已验证。每个模式保留最近一次记录，失败不会沿用上次成功。提交或 rebase 后文件内容及运行环境完全相同可保持 current，但仍遵守每次 push 前的检查要求。push 后必须等待相关 Actions 结束，并区分实际成功、失败与 skipped。

## 本机全量 CI

本机执行普通 CI 与 CI Full 的并集；`pnpm test` 已覆盖 fast + slow，无需再重复 `pnpm test:fast`：

```bash
pnpm install --frozen-lockfile
node scripts/local-services.mjs --test
pnpm run check:architecture
pnpm run lint:i18n
pnpm test
pnpm test:llm
pnpm run build
REPLAY_VIEWER_ROOT="$(mktemp -d)" pnpm run build:replay-viewer
pnpm run check:bundle-size
pnpm run check:community-deck
```

`check:architecture` 是唯一架构门禁清单，包含 lint、测试 project scope、直接 session log、effect 文件清单、生成卡牌同步、strict no-DSL、catalog types、卡牌实现边界、跨层 Card State 边界、架构契约类型检查、架构契约测试、strict prompt-sync、零循环依赖检查以及浏览器/Replay 真实构建隔离检查。两份 workflow 各调用它一次，meta-test 防止接线漂移。

`check:architecture-tests` 复用现有 Vitest project 配置，执行 effect 架构、资源事实来源审计、事件映射策略、交互命令策略、Card Source、PromptKey、LLM prompt 契约、CI 接线，以及 listener 纯度 guard 的正负例与两人 Session 契约测试。跨层 Card State 检查覆盖 domain / actions（含 internal effects）/ engine / session / projections / server / client / Replay Viewer，检查固定单卡状态、提示键判断、私有状态 helper 导入和前端原始状态读取；静态 metadata 和卡牌文案声明可用，扫描根缺失、为空、解析错误及失效例外均失败。卡牌实现边界检查同时对每个已解析 listener handler / cost-candidate transform 做显式状态写入的静态扫描；运行时 guard 则由各 Vitest project 的 setup 安装，`pnpm test` 中任何 listener 直接修改权威状态都会失败。它们仍属于 `pnpm test` / `pnpm test:fast`，保证单独运行完整测试时不漏检；只跑架构入口也会执行这些断言。沙盒文档的名字集合同步由入口内的 strict prompt-sync 检查，完整 CI 无需再单独执行该命令。

LLM 参考样例的行为契约直接提取 `docs/community-card-examples.md` 中的喂食与建房示例，经沙盒编译后在两人 Session 中验证触发时序、支付结果及不触发条件；这些测试由 `check:architecture-tests` 执行。字符串断言只检查文案，strict prompt-sync 只检查名字集合，golden 回放只验证已有输出，三者都不能单独证明模型生成质量。当前简短 prompt 使用后端提供的已部署沙盒契约；浏览器按需读取 GitHub 资料。行为契约仅覆盖已列出的样例，模型准入另需按 `docs/test/llm-card-gen.md` 在浏览器生成单文件源码，并通过同一套固定 case 测试；CI 不持有 LLM key，也不发起付费调用。

架构类型门禁执行 `tsc -p tsconfig.architecture.json --noEmit`，包含架构契约测试及日志、effect 扫描器测试。依赖检查按 TypeScript 模块解析构图，运行时循环一律失败；仅显式 type-only 声明从运行时图移除。浏览器检查对主页面和 Replay Viewer 分别执行不写产物的 Vite 构建，验证真实传递依赖；普通页面不保留规则运行时基线。确切的沙盒入口、Worker 文件及纯元数据权限见 `scripts/architecture-policy.mjs`，未知入口和失效权限均失败。

架构检查遵守 `docs/ARCHITECTURE.md` 的简单性约定：只拦常见架构误用，不做对抗性或全程序语义证明。日志和 effect 扫描器复用源码发现与解析；日志必需根缺失或为空、源码解析失败会报错，未再命中已识别写入的具名例外会报失效。effect 清单只限制顶层生产文件。

测试发现独立于 project glob；Card Source 声明独立于已注册实现枚举。缺少扫描根目录、语法错误、无法解析的依赖，以及 bundle 检查缺少 `dist/assets` 或 JS 产物，都不能产生成功证据。`check:bundle-size` 仍负责体积预算，隔离证明由 `check:browser-boundaries` 承担。

## 启用公开仓库 GitHub 门禁

准备代码合入后，保持现有 main 审核、禁止删除、禁止 force push 和线性历史规则。公开切换后按顺序启用：

1. 读回 repository visibility，确认三个 workflow 的自动 job 已实际运行；私有期 skipped 的 run 不计入本步。
2. 让一次真实 PR run 和一次 main run 的 `verify`、`llm-cards-record` job 成功完成。PR head 变化后必须等待对应新 head 的检查。
3. 从这些提交的 check-runs 核实实际 check 名与 GitHub Actions provider，再把两项检查加入现有 main ruleset。不要只凭界面显示的 `CI / verify` 推测 API context，也不要覆盖已有审核与分支保护规则。
4. Full 和 E2E 也会自动运行；将它们纳入 required checks 前，同样先取得 PR/main 的成功证据。所有相关 run 都必须结束，失败立即定位，不能忽略未被设为 required 的失败。
5. 设置外部贡献者 fork PR 的 Actions 审批为 `all_external_contributors`。当前 GitHub API 不允许为私有仓库配置这项 public fork 设置，因此留到切换后执行并读回验证。

在真实检查尚不可满足时不提前配置 required，以免锁死 main。标准 GitHub-hosted runner 的公开仓库运行时间免费，较大 runner 及超额存储仍可能收费；保持当前 `ubuntu-latest`、timeout 和取消同一 PR 旧 run 的设置。

CI 用 `pull_request` 检查投稿代码，不用 `pull_request_target` 带写权限或秘密执行投稿；后端 App 私钥及生产 `.env` 不进入 CI。

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
