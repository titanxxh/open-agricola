# CI Checks Operations

`ci.yml` 和 `ci-full.yml` 声明 `pull_request`（目标 `main`）、`push: main` 和 `workflow_dispatch`；`e2e.yml` 只声明 `push: main` 和 `workflow_dispatch`，不在 PR 上运行。三者都使用只读 `contents` 权限，并按 workflow + PR/ref 隔离 concurrency。自动 job 只在仓库为 public 时执行；私有期仅允许手动执行，避免公开准备阶段消耗私有仓库额度。私有期自动 run 的 skipped job 不是通过验证的证据。

私有期提交和 rebase merge 前仍必须在 owner 控制的本机跑完下列 CI 并把结果写入 PR。push 后等待相关 Actions run 结束，同时明确区分 skipped 和实际执行成功。公开后恢复自动执行，并按下文取得真实成功证据再启用 main 的 required status checks；准备 YAML 不等于 GitHub 门禁已启用。

PR 的浏览器 E2E 在本机运行。涉及应用运行行为、UI 或 WS 的改动，用 `pnpm verify <file.spec.ts>` 在隔离环境跑通相关 spec，并把命令和结果写进 PR 描述；本机通过即满足 PR 的 E2E 要求。合入 main 后 `e2e.yml` 仍会跑全量。

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

## Audit 场景迁移的联合验收

迁移清单固定原始 279 个文件、3,252 个动态用例的身份；每个已承接场景必须指出原生测试文件及完整用例名，使用既有测试去重时还要说明相同的边界。普通 main 检查只读取小型清单，不要求维护者本地保留 audit 分支。迁移期间的联合验收从本地保留的精简源提交组装剩余场景，不把编号套件导入 main：

```bash
node scripts/audit-migration.mjs check
pnpm run check:session-test-types
node scripts/audit-migration.mjs prepare --output /absolute/path/outside-repository/run-unique
node scripts/audit-migration.mjs verify --output /absolute/path/outside-repository/run-unique
```

`check:session-test-types` 已接入 `check:architecture`。迁移期间它从承接清单选取已迁原生目标，strict 检查完整目标及实际传递 helper，另存编译器纳入文件与诊断路径；不读取原始 audit 提交。源码检查拒绝重新导入编号套件、旧审计证据目录中的原始产物，以及超过 1 MiB 的目标测试或 helper。它检查当前源码，不宣称清理或验证全部 Git 历史。

`prepare` 要求依赖已安装且本地可读取清单指定的源提交。它保存候选源码指纹、逐文件来源摘要和清单副本，输出目录必须是新的 Git 外目录。`verify` 在这份封存源码上运行已迁原生文件与剩余原始场景，核对每个原始职责确实通过，并严格检查联合范围与实际传递 helper；编译器纳入文件另存清单，缺少任何指定根文件也会失败。修改候选内容后必须重新组装，不能沿用旧身份。混合源组会在组装时静态删除已承接的测试注册及不再使用的局部函数，保留其他场景；当前支持字面量命名的 `it` / `test` / `describe` 注册。部分迁移遇到动态或不明注册结构时会失败，不能用运行时过滤产生的 skip 冒充删除。C131 的本地预期是当前实现 `0`；历史预期 `1` 及规则讨论保留在来源元数据中。

`verify` 始终向测试子进程传入 `AGRICOLA_NEGATIVE_RAW=1`，按 expected 断言。调用者未设置该变量或传入 `0` 都不改变验收模式。`summary.json` 的 `rawMode` 必须为 `strict-expected`。缺少该字段的旧记录不能证明强制 RAW 验收，须保留原记录并重新组装、验收。

尚未迁移的旧场景会保留其原有完整快照写法，证据按本次运行、源文件和场景隔离保存在 Git 外。迁入原生测试后，成功仅留摘要，完整证据只用于失败或显式诊断。联合验收不能替代最终源码的 prepush 与完整 CI。

### 持久暂停、执行归属与审查状态

迁移控制统一使用 `pnpm audit:migration`（等同 `node scripts/audit-migration.mjs`）。先指定 Git 外的 workspace；没有 `control.json` 时默认暂停。控制记录只保存当前授权范围，worker claim 和操作结果分别不可覆盖，旧 `implementation-state.json`、交接文案及其他 worker 的结果不构成授权。

```bash
pnpm audit:migration control --run /external/workspace --request /external/pause.json
pnpm audit:migration status --run /external/workspace --issue <issue> --pr <pr> --head <full-sha>
```

`pause.json` 示例（完全暂停）；若用户允许“只完成当前 issue”，把 `finishOnly` 改为精确的 `[{"issue":123,"pr":456,"head":"<full-sha>"}]`，不能扩大到后续票：

```json
{"kind":"pause","authority":"用户本次暂停指令的引用","finishOnly":[]}
```

只有用户明确恢复后才记录 `{"kind":"resume","authority":"恢复指令的引用"}`。每次控制变更递增 epoch，使旧 claim 失效。协调者通过 `control` 的 `grant` 请求创建新 claim：

```json
{
  "kind":"grant",
  "authority":"当前任务及允许操作的用户指令引用",
  "assignment":{
    "id":"unique-run-id","worker":"worker-name",
    "issue":123,"pr":456,"head":"<full-sha>",
    "operations":["local-validation:frozen-native","local-validation:frozen-strict","local-validation:frozen-check-native","local-validation:raw-prepare","local-validation:raw-verify","local-validation:prepush","local-validation:local-proof"]
  }
}
```

`grant` 返回不可变 claim 文件路径。纯工具验收可用 `"kind":"tooling","head":"<full-sha>"` 替换 issue/pr/head 目标，不能获得远端写权限。PR 的远端操作单独授予 `publication:push`、`publication:update-pr`、`publication:request-review` 或 `delivery:merge`，不会由本地通过自动推导。操作失败或结果不明后先只读核对，再创建新 claim；不要覆盖原结果。

各阶段开始前都核对 claim、epoch 和暂停范围。已经开始的本地子进程可能继续运行，但暂停后其结果不能作为当前授权成功记录，也不能进入下一阶段；`status` 会列出已准入操作和 PID 身份，不声称进程已停止。远端操作在同一控制锁内重新检查并执行；暂停在已开始的远端操作结束后生效。锁不会按超时删除，进程身份无法确认时需要人工核对恢复。这个边界约束这些入口，不拦截任意手工 shell 命令。

`status` 只读取远端，不请求 review、不重试、不合入。它分别报告精确 HEAD 的 Code、Security、真实 bot `+1`、未解决 threads、PR 身份、本地证据、远端 CI，以及授权状态。机器标记与文字结论矛盾是 `conflict`；缺失或不完整观察是 `unknown`。审查状态字段仅描述事实；`mergePermitted` 始终为 false，执行许可还须在真正写入时核对 claim。可通过 `--request` 提供 issue/pr/head/worktree/raw/prepush，读取对应的本地证明。

`publish --run ... --request ...` 仅更新 claim 指定的既有本仓库 PR，校验当前 main、分支和本地证据；push 使用精确远端 SHA 的 lease。请求包含 `assignment`、`head`、`worktree`、`raw`、`prepush`、`branch`、绝对路径 `bodyFile`，以及可选 `title`、`review`（`code` / `security`）；它不创建后续票。review 请求带 HEAD 标记，重试前读取已有请求，避免重复发送。旧发布 config 可通过 `{"config":"/external/config.json","assignment":"/external/claim.json"}` 接入同一入口。

`delivery --run ... --request ...` 同样要求精确 claim、pr/head/worktree/raw/prepush；`merge:true` 才会执行管理员 rebase merge，随后核对合入 tree。`reconcile:true` 则只读检查已合入结果，不重试 merge、不改控制记录。默认仍要求本地门禁、Code、Security、真实大拇指、threads 和 PR/main CI；仅当用户明确免除远端 CI 时，可记录精确 issue/pr/head 的 `{"kind":"remote-ci-policy","id":"unique-policy-id","authority":"用户原话引用",...}`。这不会免除 Code、Security 或大拇指，也不会把实际 CI 状态改写成 passed。

旧 Git 外 Python 入口须显式接入，不能保留另一套执行逻辑：

```bash
pnpm audit:migration adopt-legacy --run /external/workspace --request /external/adopt.json
```

`adopt.json` 为 `{"directory":"/absolute/old-artifact-directory"}`。安装器仅在暂停状态工作，把受支持的八个活跃执行入口保存为带摘要的不可执行文本备份，替换成薄代理并生成收据。代理从 `OA_AUDIT_ASSIGNMENT` 读取 claim；缺少 claim 会在执行/远端写入前失败。归档和既有证据保留为历史，不作为可执行入口。

### 冻结验收与跨机器恢复

`run` 固定 HEAD、批次、完整目标集、服务配置及新输出目录，逐阶段执行原生行为、strict 实际输入清单、`check-native`、RAW 组装/全量验证、完整 prepush 和最终字节核对。它复用上面的 RAW 入口，不复制一套规则验收器：

```bash
pnpm audit:migration preflight --database-env /private/test-database.env
pnpm audit:migration run --config /external/run.json
```

preflight 只核对本机配置、依赖可解析性及源提交可用性，不启动或连接服务；原生 ABI 和实际服务由验收检查。先按既有入口准备本地测试服务，私密文件只提供 `TEST_DATABASE_URL=...`。`run.json` 示例：

```json
{
  "head":"<full-sha>","batch":"M01",
  "workspace":"/external/workspace","assignment":"/external/workspace/claims/unique-run-id.json",
  "output":"/external/new-run-directory",
  "services":{"databaseEnv":"/private/test-database.env"}
}
```

批次必须已完整承接；目标包含该批次的完整原生文件、清单全部 `nativeScope` 和可选 `extraTargets`。成功 RAW 必须覆盖清单全部 3,252 个原始职责，不能有失败、skip/todo、缺少类型根或成功原生测试产生的全状态证据。`final.json` 保留每阶段结果；它直接核对 HEAD 中的 tracked blob 与文件模式，不能仅凭 Git status 的“干净”推断字节一致；任何源码或 HEAD 变化都要求新输出、新 claim 和重跑。测试断言的字段及参与者选择仍须人工审查，参见 `docs/CARD_TEST_TEMPLATE.md` §5.2、§9.1。

跨机器导出只打包候选提交、未公开的精简源提交及显式选择的小型 JSON 收据，不递归打包整个 artifacts，也不带环境文件、服务数据或依赖：

```bash
pnpm audit:migration export --base <available-main-ancestor> --output /external/new-transfer-directory
# 可选 --receipts /external/explicit-json-file-list.json
```

保存返回的 manifest SHA-256，并将整个目录传到新机器。新机器先准备受支持的 Node/pnpm，正常 clone/fetch 取得 bundle 所列 prerequisite commits，再按 `transfer.json.bootstrap` 的命令 fetch `source.bundle` 中的候选分支、checkout 精确 HEAD 并执行 `pnpm install --frozen-lockfile`。候选工具代码可能尚未推送，不能假设 GitHub 上已有该 CLI。

```bash
node scripts/audit-migration.mjs import --archive /external/transferred-directory --expected-head <full-sha> --manifest-sha256 <digest> --output /external/new-workspace
```

import 核对成员、摘要、体积、bundle refs/prerequisites、候选 tree 和原始源身份，创建没有 claims 的暂停 workspace。旧收据放在 `historical/`，不写入当前 `output/verification/`。新机器须安装依赖、重新配置本地服务、取得当前授权并重跑 native/strict/RAW/prepush；导入成功不代表当前主机通过验收。

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
4. Full 在 PR 和 main 上自动运行，E2E 只在 main 上自动运行，不作为 PR 的 required check。将 Full 纳入 required checks 前，同样先取得 PR/main 的成功证据。所有相关 run 都必须结束，失败立即定位，不能忽略未被设为 required 的失败。
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
