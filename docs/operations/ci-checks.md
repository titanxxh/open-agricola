# CI Checks Operations

`ci.yml` 是 PR（目标 `main`）与 `push: main` 的唯一自动验证入口，也支持 `workflow_dispatch`。PR 与 main 使用同一 canonical plan，执行受影响文件、业务组、浏览器检查和 catalog 任务，再由始终运行的 `verify` 汇总。旧 `ci-full.yml`、`e2e.yml` 与重复的 `verification-plan.yml` 已退场，不增加定时全量。

GitHub Actions 是集成与发布的正式证据。本机按需定向调试或主动运行完整检查，不要求每次 push 前把远端相同检查完整跑一遍。push 后等待当前 head 的所有选中任务结束并修复失败。所需任务被跳过不算成功；私有仓库的自动 job 仍受 visibility 条件限制，可在 GitHub 手动运行。工作流配置不证明远端 required check 已启用，必须实际读回核对。

选中的浏览器检查在 GitHub runner 上通过 `pnpm verify` 运行。本机同一入口用于调试与复现，不能补齐正式 CI 结果。工作流使用只读 `contents` 权限、`ubuntu-latest`，按 workflow + PR/ref 隔离 concurrency，并取消同一 PR 的过期 run。

完整 catalog 保留四个 Chromium shard、browser-local sandbox 和 Linux WebKit 六个独立浏览器 runner，以及 quality、fast、slow、build，合计十个任务。每个浏览器 runner 使用独立应用、数据库 schema、S3 前缀和构建目录。任务失败不取消其余任务，诊断保留 7 天，catalog 产物名为 `candidate-<run-id>-<attempt>-<task>`。日常范围执行按计划选择这些任务或明确的文件与标签。

## 调试与最终验证

### Routine verification scope

Run `pnpm exec tsx scripts/verification-plan.ts --base origin/main` to preview the whole branch's verification scope. Use `--head <ref>` when comparing another committed head. Differences between that head and the actual checked-out commit are also included, along with staged, unstaged, and untracked changes. It writes `output/verification/plan.json`; `--json` also prints the plan, and `--summary <file>` writes its human-readable summary.

The `CI` workflow computes this plan for the actual checkout, including the complete branch diff and the PR merge commit. Main uses the push event's before/after range, including every commit in that integration. The plan retains the base, merge base, head, actual checked-out commit, source fingerprint, test ownership, and selection reasons. Missing roots, malformed sources, or unclassified tests fail planning. Unknown ownership, global configuration, and scopes without complete narrow evidence expand to the canonical complete task catalog. `wideningReasons` records expansion within an established scope; `expansionReasons` records fallback to the complete catalog.

`support-verification.ts` gives documentation, tests, helpers, and browser files their own scope. Ordinary documentation selects documentation constraints. English reference documents also select the reference reader, and executable sandbox or prompt documents select their declared Session contracts. A documentation change does not select the complete Workshop group solely because the generator can read it.

`test-consumers.ts` indexes every discovered test exactly once, following test-local imports and helpers while recording production dependencies as boundaries. Test and browser edits select complete files and their established consumers. Helper uncertainty, removal, or rename widens within the established test layer; missing surviving helper consumers retain that layer. Browser files run in full under Chromium and retain the complete existing `@webkit` eligibility group, independently of changed lines. Confirmed helper read or parse failures fail planning. Unknown ownership and global setup files still require the complete catalog.

`frontend-verification.ts` selects complete client tests, quality/build tasks, and declared module browser consumers. Shared presentation widens to the complete browser layer. `card-verification.ts` selects complete literal/import/helper-associated card tests, conservative generic consumers, and browser checks. Adding an associated regression for an existing card stays within that card scope. Added, deleted, or renamed production Card Sources still require full verification; that rule does not classify a new test as a new production card.

`rule-verification.ts` selects payment, animals, scoring, farm/crop, and round/variant groups from rule ownership, Card Sources, and test associations. It retains complete affected files, cross-card and slow Session consumers, and conservative shared safety consumers. Shared core changes select complete rule projects and browser lanes. `business-verification.ts` retains backend, recovery, protocol, and Workshop groups with their declared complete projects. A missing declared test, project, or browser consumer is a planning error; a full run cannot make an incomplete declaration valid.

Known operations collectors, access provisioning, deployment, Compose, and Grafana configuration select complete operations consumers and canonical quality/build tasks. Required files cover account/opening aggregates, the opening-facts producer, observability HTTP, operations deployment, local service preparation, and community QR delivery, with complete dashboard and community browser specs. The independent test index adds operations-prefixed tests, test-local dependency consumers, and declared subprocess or literal-path consumers. Uncertain module loaders add complete files alongside the safety group and record `wideningReasons`; read or parse failures fail planning. Pure planner calls without the index retain all discovered unit files and complete browser lanes. See [testing architecture](../architecture/testing.md) for the mandatory test files.

Operations selection leaves the opening-facts SQL migration and server-side operations changes on complete `fast-server`; persistence and other database changes retain their broader existing scopes. Community QR updates, the dashboard generator, and unknown operations entry points require the complete catalog. The dashboard browser fixture uses its own Prometheus scrape configuration. Its success, or a complete server run, does not establish that the production scrape configuration works.

Mixed scopes union complete Vitest files per project and browser files per engine and identical grep selector, in stable order. An unfiltered browser file covers its narrower selectors for the same engine. Browser-sandbox and WebKit catalog tasks do not by themselves cover inline file selectors, so their presence cannot erase those checks.

The public execution CLI is `pnpm exec tsx scripts/ci/scoped-verification.ts`. `plan --base <ref>` writes the canonical plan. `run --base <ref> --partition units|browser-1|browser-2|browser-3|browser-4|all` recomputes it and rejects edited checks, changed refs, or changed source. CI runs units and four explicit browser callers independently through one reusable worker, alongside catalog tasks. Browser partitions preserve each complete `(engine, grep, file)` tuple. With at most four engine/selector groups, they try dedicated slots per group and give spare slots to the group with the most files per allocated slot. That layout must reduce `pnpm verify` calls and keep each slot within `ceil(tupleCount / 4) + 1` files; otherwise sorted tuple round-robin applies. Every worker returns its partition ID/digest, full plan digest, tested SHA, and completed count. Its artifact includes the partition ID. Local `all` execution retains the complete plan and `output/verification/scoped-result.json`. This bounds files per slot, not elapsed time.

Units prepare required test services once and build the cards manifest once, then execute each selected project with its complete file set. Each Vitest command keeps the default reporter and writes an independent JSON report under `output/verification/vitest-results/`. Successful exit and source identity are required. The report must contain modules whose names match the selected files exactly once. Missing, extra, duplicate, failed, or unfinished results block completion. CLI substring matching alone is not execution proof.

Execution results retain `startedAt`, `completedAt`, and monotonic `durationMs` for every actual command, including preparation and failed commands. JSON reports retain module and assertion timings. These measurements and report destinations stay outside the canonical plan and its digest. Existing partition artifacts retain the reports for measurement and failure diagnosis; timing does not replace the execution gates.

The required check remains named `verify` and always evaluates every named worker and catalog job. The nonempty partition manifest has explicit null entries for intentionally empty slots; those callers must be skipped. Every selected caller must report its own matching identity, digests, count, and passed status. Failure, cancellation, skip, missing outputs, or an incomplete partition blocks the gate independently of other successes. Units-only plans retain `catalog_tasks=none`; missing or empty selections still fail. Browser workers install Chromium and WebKit for embedded launches. Routine results never qualify as dedicated full release receipts.

For a manual scope probe, dispatch `ci.yml` on the desired ref with an optional full comparison `base_sha`: `gh workflow run ci.yml --ref <branch> -f base_sha=<full-sha>`. The head and tested commit remain `github.sha`. PR and push events ignore this input and use their complete event diff. This manual CI run does not qualify as a dedicated full candidate receipt.

使用 Node.js 24.15+（不含 Node 25），按改动范围选择入口：

```bash
# 调试：生成卡牌 manifest，只跑指定 Vitest 文件；不启动应用
pnpm verify focus server/__tests__/session-fixtures.test.ts
pnpm verify focus server/__tests__/first-round-start-session.test.ts --testNamePattern 'direct deal'

# 可选本机完整 fast 门禁：准备依赖、边界扫描、工具类型、完整 fast 与 lint
pnpm verify prepush

# 真实应用行为：隔离 PostgreSQL / S3、端口，调用 restart-local.sh 后跑 Playwright
pnpm verify e2e-tests/hosted-password-login.spec.ts
pnpm verify e2e e2e-tests/hosted-password-login.spec.ts  # 显式模式，含义相同
pnpm verify                                          # 单个隔离环境，完整 Playwright
pnpm verify:parallel --shards=4                       # 已提交且干净的源码，四个隔离环境并行

pnpm verify status
```

定向测试若依赖 PostgreSQL / S3，先运行一次 `node scripts/local-services.mjs --test`。纯测试、工具和文档调试不要求每次重启应用。本机复现运行行为、UI 或 WS 时，通过 `./restart-local.sh` 重启再检查，或使用上述隔离 Playwright 入口。按问题选择相关 slow Session 或 E2E；本机 `prepush` 仅覆盖其声明的 fast 门禁，不代表完整候选通过。

E2E 入口先构建可选同源托管的 production frontend，再创建隔离环境并重启应用，避免浏览器验收依赖残留 `dist/`。独立 Pages 会话验收另外通过 `build:pages-frontend` 构建根路径产物，以 HTTPS 同站跨源拓扑验证真实生产文件；同源产物不能替代该验收。隔离环境由 `scripts/test-environment.ts` 生成：应用端口取自 20000–32767，低于 Linux / macOS 自动分配端口的范围；并设置 `OWNED_PROCESSES_FILE`，让 `restart-local.sh` 的启动和 `--kill-only` 只停止该环境自己启动的进程。端口被其他进程占用时直接失败，不终止对方。

Hosted 和 Pages 构建入口固定 `NODE_ENV=production`。隔离后端继续使用 `NODE_ENV=test`，浏览器验收加载与正式发布相同的 React 运行模式。 Grafana 验收先滚动到待检查的面板以触发可见区域查询；失败诊断保留面板位置、导航时间范围和实际查询。

E2E 使用英文界面，业务流程不再按英文 / 中文重复展开；桌面、移动端、玩家人数和浏览器差异继续覆盖。产品仍提供中英文，语言包缺键检查继续由 `lint:i18n` 执行。

`verify:parallel` 先生成收集测试所需的卡牌和语言产物，准备一次共享测试依赖，再在 `.worktree/` 下从当前 HEAD 创建独立工作树。每片自行安装锁定的依赖、构建前端并通过原有 `pnpm verify --shard=i/N --workers=1` 运行。工作树、Vite 缓存、固定开发房间、应用端口、数据库 schema、S3 前缀和 Replay 目录互相隔离，因此一片中的房间重置或后端重启不会打断其他片。不要在同一个应用环境直接增大 worker 数。

Linux 浏览器验收默认使用 `LIBGL_ALWAYS_SOFTWARE=1` 和 `WEBKIT_SKIA_ENABLE_CPU_RENDERING=1`，与 [WebKit 自身的 WPE 测试入口](https://github.com/WebKit/WebKit/blob/main/Tools/Scripts/webkitpy/port/wpe.py)一致；本机有 Mesa EGL vendor JSON 时仅选择 Mesa，让 headless 测试独立于桌面和计算任务的 NVIDIA 图形资源。显式环境配置会保留并计入验证指纹。普通开发启动及生产浏览器不受该测试入口影响。

并行运行的日志、各片原始验证记录和汇总保存于 `output/verification/parallel-runs/`。汇总检查退出码和各片实际选择的 case，缺少 reporter、重复 case 或失败不能通过；它不覆盖根目录最近一次 E2E 记录。成功后仅清理本次创建且干净的工作树，失败时保留工作树和证据用于定位。完整发布验收还需执行 browser-local sandbox 和 WebKit 入口。

每次 push 前先 rebase main 并解决冲突，按需进行本机检查。修改源码或 rebase 改变内容后，重新检查受影响范围并等待新 head 的 GitHub 结果。只有后续修改、失败或未解决的问题才需要扩大或重跑本机检查。

`scripts/verify.ts` 在已忽略的 `output/verification/` 分别记录最近一次 focus、prepush 和 E2E：HEAD、源码指纹、Node 版本、起止时间、实际命令及各步退出码。指纹包含 Git 跟踪文件和未忽略的新文件的内容（包括未提交修改、删除及执行权限），以及 Node / 平台和选定运行环境；不包含验证记录本身。运行中源码变化会使记录失效，之后改动则在 `status` 中显示 stale。只有当前源码对应的 prepush 成功记录才能使 `status` 返回 0。

这些记录用于核对本机检查范围，不会缓存或跳过检查；不代表被忽略的环境文件、外部服务状态或远端 CI 已验证。每个模式保留最近一次记录，失败不会沿用上次成功。提交或 rebase 后文件内容及运行环境完全相同可保持 current。`status` 缺少 prepush 而返回非零，不表示当前范围的 GitHub 门禁失败，也不要求补跑本机完整检查。

若本机已有 `public-assets.ref` 对应的完整素材仓，可用 `PUBLIC_ASSET_VALIDATION_DIR=/absolute/path/open-agricola-assets pnpm verify prepush` 或同环境下的 `pnpm verify <spec>` 避免构建时联网取素材元数据。入口核对素材仓 HEAD、干净的 `assets/` 和全部必需文件，构建继续生成 Pages URL。该环境设置计入验证指纹；本地素材验证不证明线上 Pages 状态。默认 CI 仍执行远端元数据检查，细节见 `docs/HOW_TO_DEPLOY.md`。

## 发布工具演练与必需浏览器用例

`pnpm release:rehearse` 是发布验收工具的本地入口：先运行现有 prepush，再构建 Hosted 前端、通过 `restart-local.sh` 启动隔离 PostgreSQL/S3 应用，运行正式账号登录、两种单人配置、选牌、刷新与新上下文恢复、素材解码和数据库持久化核验，最后检查必需用例证据。它只创建和清理隔离测试命名空间，不部署服务或发布版本。`scripts/release/` 中的工具接受 ESLint、测试和 `check:verification-types` 严格类型检查；类型门禁同时接入 prepush 与 `check:architecture`，工具类型项目独立于生产 Docker 构建。

```bash
pnpm release:rehearse
pnpm verify status --requirements scripts/release/requirements.json

# 调试时可只跑指定用例；最终范围仍由 requirements 决定
pnpm verify e2e-tests/release-rehearsal.spec.ts --browser=chromium --requirements scripts/release/requirements.json
```

reviewer 在 requirements 文件中声明必需 case 的仓库相对 `file`、完整 `titlePath`（describe 层级和 test 标题）、`project` 和 `browser`；不支持把文件名当成全部用例已执行。实际执行证据在 `output/verification/e2e-runs/<runId>/` 中不可覆盖地保存。相同源码指纹、相同 requirements 内容 hash 的运行可累计；缺失、过滤掉、跳过、预期失败、flaky、后续失败或缺少 reporter 结果都不能满足必需用例。`status --requirements` 还要求当前 prepush 成功。未传 requirements 时，原有 `verify` 和 `status` 契约保持不变。

本机需要代理时设置 `RELEASE_SMOKE_PROXY`；该环境变量计入验证指纹。依赖与语言、素材来源继续使用现有隔离环境及 pin 校验。可选代理不关闭 TLS 校验，也不证明目标生产域名可用。

正式单人开局、选牌和持久化测试只在上述本机隔离演练中运行。浏览器流程拒绝前端或 API 指向非回环地址；原远端 `release:smoke` 命令已移除。上线验收不创建正式对局，也不向已有对局发送游戏操作。上线后核对生产 TLS/cookie、登录退出、前后端与 Pages 构建身份、静态资源、工坊和回放读取、备份恢复以及旧对局保留。

本机演练在同一输出目录的 `progress.json` 中绑定目标、build 和账号摘要，已创建的局在重试时复用。创建结果不确定时保留命令身份并阻止再次创建，先核实原回执。浏览器失败首轮即写 `failure.json`，清理失败另写 `cleanup-failure.json`，保留首个故障；`diagnostics.json` 记录有界的文档、连接、协议类型和请求状态，不保存认证头、Cookie、查询参数、完整消息或手牌。演练通过现有数据库适配器和 codec 在只读事务内核验持久化。本机演练结果不替代上线后的检查。

## 全卡订阅审计

在迁移卡牌前，用正式边界检查生成诊断报告：

```bash
pnpm run check:card-impl-boundaries --report output/card-listener-audit
```

该命令读取全部生产 Card Source 和 `ALL_CARD_IMPLS` 的真实注册，检查扫描范围是否完整，并从棋盘、变体和卡牌格的权威注册派生行动格 ID。`actionSpaces` 为显式 `'all'` 或非空格 ID 数组；数组中的 ID 必须属于该集合，拼写错误和规则动作 ID 均失败。原生注册入口检查订阅形状；完整格 ID 校验在全部卡牌格注册后由生产扫描执行。`audit.json` 保存源码 HEAD、指纹、卡牌目录中的牌面和全部 listener；`audit.md` 分列结构违规和牌面审查候选。扫描完成后发现结构违规或范围错误，仍写报告并返回非零退出码。命令开始时先把本次报告标记为 running；文件遍历、解析或模块加载失败会原子替换为 failed 报告，保留可取得的当前 HEAD、指纹和失败原因，不保留上次成功。完整报告也带 passed/failed 状态；须同时检查退出码、状态和报告指纹。报告的 `source.excludedFiles` 仅列出该次 `audit.json`、`audit.md` 及其原子写入临时文件；重算时使用 `sourceFingerprint(repoRoot, { excludeFiles: report.source.excludedFiles })`。报告目录中的其他文件仍计入指纹，普通验证调用的默认范围不变。

候选来自同函数语法及牌面关键词，只用于逐张核对触发语义，不自动判定迁移。合法规则动作可以带行动格限定。结构错误用同一订阅契约拒绝；生产扫描、注册入口及反例测试分别证明全卡覆盖、运行时拒绝和诊断行为。

`prepush` 在 fast 前运行相同生产扫描，并将该步骤和退出码写入验证记录。`check:architecture` 保留同一正式入口，执行扫描器、注册入口和验证步骤的反例测试。正式门禁不使用 `--warn-only`。

## 按需本机完整检查

本机可以主动运行完整非浏览器检查，以便调试；它不生成正式 GitHub 回执。`pnpm test` 已覆盖 fast、slow 与社区卡测试：

```bash
pnpm install --frozen-lockfile
node scripts/local-services.mjs --test
pnpm run check:architecture
pnpm run lint:i18n
pnpm test
pnpm run build
REPLAY_VIEWER_ROOT="$(mktemp -d)" pnpm run build:replay-viewer
pnpm run check:bundle-size
```

`check:architecture` 是唯一架构门禁清单，包含 lint、测试 project scope、测试规则环境、测试观测副本不归一化、直接 session log、effect 文件清单、生成卡牌同步、strict no-DSL、catalog types、卡牌实现边界、跨层 Card State 边界、架构契约类型检查、验证工具类型检查、架构契约测试、零循环依赖检查以及浏览器/Replay 真实构建隔离检查。正式 quality 任务从该声明派生生产检查，不重复执行 `check:architecture-tests` 和 `check:test-project-coverage`；这些测试及 project 检查由 fast 执行。`check:community-deck` 是 fast-cards 与 fast-server 的子集，保留为定向调试入口，不在完整 catalog 额外执行。meta-test 约束范围 CI 的接线与始终运行的汇总门禁。

`check:architecture-tests` 复用现有 Vitest project 配置，执行 effect 架构、资源事实来源审计、事件映射策略、交互命令策略、Card Source、PromptKey、LLM prompt 契约、CI 接线，以及 listener 纯度 guard 的正负例与两人 Session 契约测试。跨层 Card State 检查覆盖 domain / actions（含 internal effects）/ engine / session / projections / server / client / Replay Viewer，检查固定单卡状态、提示键判断、私有状态 helper 导入和前端原始状态读取；静态 metadata 和卡牌文案声明可用，扫描根缺失、为空、解析错误及失效例外均失败。卡牌实现边界检查同时对每个已解析 listener handler / cost-candidate transform 做显式状态写入的静态扫描；运行时 guard 则由各 Vitest project 的 setup 安装，`pnpm test` 中任何 listener 直接修改权威状态都会失败。它们仍属于 `pnpm test` / `pnpm test:fast`，保证单独运行完整测试时不漏检；只跑架构入口也会执行这些断言。工坊能力名称由部署契约直接读取源码常量，文档链接源码，不维护另一份名字表。

工坊的时序与支付行为由 `server/__tests__/workshop-timing-payment-session.test.ts` 直接构造源码，在两人 Session 中验证触发、支付与不触发条件；测试由 `check:architecture-tests` 执行，不从 Markdown 提取源码。当前简短 prompt 使用后端提供的 format-2 能力名称契约；模型按需读取 GitHub 源码和真实行为测试。本地模型工具往返验收见 `docs/test/llm-card-gen.md`；CI 不发起模型调用。

架构类型门禁执行 `tsc -p tsconfig.architecture.json --noEmit`，包含架构契约测试及日志、effect 扫描器测试。依赖检查按 TypeScript 模块解析构图，运行时循环一律失败；仅显式 type-only 声明从运行时图移除。浏览器检查对主页面和 Replay Viewer 分别执行不写产物的 Vite 构建，验证真实传递依赖；普通页面不保留规则运行时基线。确切的沙盒入口、Worker 文件及纯元数据权限见 `scripts/architecture-policy.mjs`，未知入口和失效权限均失败。

架构检查遵守 [`docs/architecture/testing.md`](../architecture/testing.md) 的简单性约定：只拦常见架构误用，不做对抗性或全程序语义证明。日志和 effect 扫描器复用源码发现与解析；日志必需根缺失或为空、源码解析失败会报错，未再命中已识别写入的具名例外会报失效。effect 清单只限制顶层生产文件。

测试发现独立于 project glob；Card Source 声明独立于已注册实现枚举。缺少扫描根目录、语法错误、无法解析的依赖，以及 bundle 检查缺少 `dist/assets` 或 JS 产物，都不能产生成功证据。`check:bundle-size` 仍负责体积预算，隔离证明由 `check:browser-boundaries` 承担。

## 固定候选完整回执

`candidate-verification.yml` 只按需手动运行或被 CI 复用，不声明 push、PR 或定时触发。正式发布证据只接受专用 `workflow_dispatch`，绑定实际干净检出、候选 SHA 与验证配置。PR 的完整计划也不能替代这一回执。

正式 request/check 新增最终快照准入：候选必须等于所选仓库 `main` 上一个已合入 PR 的最终 `merge_commit_sha`，并可从明确解析的 `refs/heads/main` 原始提交到达。门禁核对仓库、PR base、producer run/head 的原生数字 ID，以及有效的 PR、线性历史、禁止 force update 和删除规则。关联 PR 或祖先关系本身不够；未合入、中间 rebase 提交和开放的 test merge 均拒绝。该策略也适用于显式选择的 fork。可信最终代码树批准 producer，配置哈希只区分兼容执行。普通 PR catalog 不要求该准入。

原生保护按当前治理生效，信任 owner、管理员和已配置 override 权限，不证明历史保护或审核质量，也不要求只读 token 看不到的特权 bypass 信息。API 或对象证明不明确时，在 dispatch、Release、候选安装和 SSH 前直接失败。main 前进不改变已固定且仍可达的合格旧最终 SHA。首次验收应在策略合入后，对真实最终合入 SHA 请求完整十任务验证；预合入绿色检查仍只是日常结果。

在 owner 本机固定候选与指向该 SHA 的 ref 后，可请求完整验证并检查结果：

```bash
pnpm exec tsx scripts/ci/candidate-verification.ts request --repository titanxxh/open-agricola --sha <full-sha> --ref <fixed-ref> --tasks all
pnpm exec tsx scripts/ci/candidate-verification.ts check --repository titanxxh/open-agricola --sha <full-sha>
```

check 读取 GitHub run、job 和 step 元数据。同一 SHA 与配置的兼容成功任务可以复用，重试通过 `--tasks <failed-task-ids>` 只补失败或缺失任务。任务按各自执行时间比较，旧 run 的较晚重跑也会覆盖其他 run 的旧结果；重跑另一任务不会更新未重跑任务的时间。新 manifest 要求但未执行的任务持续阻断旧成功，直到 run 完成。执行时间缺失时，已完成 run 的可信 `updated_at` 可约束未通过证据的最晚时间，后续正常执行可替代它；时间无界或区间重叠时不能复用。缺失、失败、取消、跳过或配置不符均阻断。不能拼接另一个 PR、SHA 或本机结果。标准发布与 Pages、后端独立门禁见 [部署文档](../HOW_TO_DEPLOY.md)。

## 核对 GitHub 必需检查

切换工作流时，保持现有 main 审核、禁止删除、禁止 force push 和线性历史规则。按顺序核对：

1. 读回 repository visibility，确认 `CI` 的选中 job 已实际运行；skipped 的必需任务不计入成功。
2. 让一次真实 PR run 和一次 main run 的 `verify` job 成功完成。PR head 变化后必须等待对应新 head 的检查。
3. 从这些提交的 check-runs 核实实际 check 名与 GitHub Actions provider，再把已验证的检查加入现有 main ruleset。不要只凭界面显示的 `CI / verify` 推测 API context，也不要覆盖已有审核与分支保护规则。
4. 只有替代 `verify` 实际通过后，才移除旧工作流或已退役任务的 required context。只修改该列表，保留其他保护；读回新列表并核对检查 provider。缺少所需任务必须仍使 `verify` 失败。
5. 分别核对普通范围、公共机制、main 集成与专用固定候选的计划和实际结果，不把未执行场景写成通过。所有相关 run 都必须结束，失败立即定位。公开仓库外部贡献者的 Actions 审批策略也需实际读回核对。

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

从默认 main 的 broker 指定固定候选，步骤与来源校验见 [部署文档](../HOW_TO_DEPLOY.md)：

```bash
gh workflow run deploy-pages-broker.yml --ref main -f candidate_sha=<full-sha>
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
set -a
source .env
set +a
gh workflow run deploy-pages-broker.yml --ref main -f candidate_sha=<full-sha>
./deploy-backend.sh root@your-game.duckdns.org main /root/open-agricola
```

## 引用

- GitHub Actions 页面：https://github.com/titanxxh/open-agricola/actions
- 仓库 token 管理：仓库 → Settings → Actions → Variables
