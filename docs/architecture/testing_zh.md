# 测试策略

[English](testing.md) | [中文](testing_zh.md)

> 本文件是中文翻译镜像；[testing.md](testing.md) 是唯一权威版本。

规则正确性用足够小的测试层在后端 seam 上证明；卡牌测试模板见 [`docs/CARD_TEST_TEMPLATE.md`](../CARD_TEST_TEMPLATE.md)。

## 测试层

| 层 | 目录 | 目的 |
|---|---|---|
| Unit | `shared/**/__tests__/*.test.ts`、`client/**/__tests__/*.test.ts` | 用 mock 状态与直接调用测试纯领域逻辑 |
| Session | `server/__tests__/*.test.ts` | 实例化 `GameSession`、调用命令，断言 `state`、`interaction`、`log` 与 `scores`；命名为 `[A-E][0-9]*_*-session.test.ts` 或 `M[0-9]*_*-session.test.ts` 的卡牌 Session 测试进入 `slow` project（`scripts/test-project-globs.ts` 的 `SLOW_INCLUDE`） |
| E2E | `e2e-tests/*.spec.ts` | Playwright 浏览器测试，覆盖渲染与多人路径 |

- Session 测试默认 2 人游戏，并使用 `server/__tests__/_helpers/session-fixtures.ts`（`createOpeningSession`、`createWorkSession`）。
- 不要用 DOM 结构、按钮文案或页面结构证明规则；渲染另用 E2E 测试。
- 多人开局 helper 根据权威快照选择交互所属玩家，每次选择后等待所有测试浏览器的 Room version 推进。固定开局夹具覆盖消息延迟；DOM 可见性不能单独证明 WebSocket 命令已完成。开局、双玩家同步、上下文恢复和 owner verification spec 在失败时保留 trace，包括首次执行。候选诊断收集器的单个 Playwright trace 上限为 64 MiB，其他诊断单文件上限为 16 MiB，总上限为 128 MiB；日常 CI 连同失败截图一起上传 trace。
- 发布验证在隔离 Hosted 前端和显式配置的目标上复用 `scripts/release/` 中的同一浏览器流程。持久化检查使用 PostgreSQL 适配器和 Room／创建配置 codec。`release-rehearsal.spec.ts` 验证真实应用整合，`release-diagnostics.spec.ts` 与 `release-rendering.spec.ts` 验证传输、脱敏和素材就绪；入口见[CI 操作](../operations/ci-checks.md)。
- 必需浏览器 case 显式声明，并与绑定源码指纹及 requirements hash 的不可变 reporter 证据匹配。reviewer 决定场景范围，`scripts/verify.ts` 和 `verification-requirements.ts` 检查执行是否完整。诊断仅保留有界元数据，首个失败与清理错误分别存储。
- Vitest project 为 `fast-shared`、`fast-cards`、`fast-card-runtime`、`fast-client`、`fast-server`、`fast-scripts`、`fast-tests` 与 `slow`。`pnpm test:fast` 先运行 `check:test-project-coverage`，要求每个测试文件恰好属于一个 project。命令与验证记录见 [`AGENTS.md`](../../AGENTS.md) 与 [`docs/operations/ci-checks.md`](../operations/ci-checks.md)。
- 序列化的展示投影（`lockedFarmTileKeys`、`playerPanelSummary`、`moorSpecialActionAvailability`、卡牌状态展示、动物区、特殊马厩）在所属 Session 上下文中派生，rehydrate 时剥离；纯视角过滤位于 `shared/projections/serialized-state.ts`。新增字段只做加法，已有的 Replay Viewer build 与 payload 保持不变。
- 优先直接调用 `GameSession` 方法；`/api/game/*` 或 WebSocket 消息用于黑盒契约。断言资源、已打出的卡、`cardStates`、行动格、`pending` / `interaction`、`log` 与 `scores`。

## 候选版本完整验证

按需执行的 `candidate-verification.yml` 使用 `scripts/ci/verification-tasks.ts` 中的完整任务清单。fast、slow、构建、质量检查和浏览器分道各自执行，失败任务可独立重试。契约和社区卡测试由正常 Vitest project 覆盖，不额外重复执行。浏览器任务复用 `scripts/verify.ts` 及其结构化结果。

`scripts/ci/verification-tasks.ts` 保持 `chromium-1` 到 `chromium-4` 的任务 ID，将排序后的完整 Chromium spec 清单按文件数量均分。分组只依赖源码与验证配置，兼容重试保持相同成员。实际耗时保存在生成的执行记录中。规则见 [CI 检查](../operations/ci-checks.md) 与 [ADR 0037](../adr/0037-scope-routine-verification-and-gate-releases.md)。测试：`scripts/__tests__/catalog-chromium-balance.test.ts`。

正式 request/check 首先确认所选仓库受保护 main 上的最终 PR 快照，核对原生数字身份、明确的 main ref 与原始 Git 可达性。独立固定的受保护 main producer P 为候选 C 编排，配置哈希绑定两棵树且只标识兼容执行。该新增实现策略及原生治理信任边界见 [ADR 0037](../adr/0037-scope-routine-verification-and-gate-releases.md)。

`scripts/ci/candidate-verification.ts` 绑定实际干净检出、工作流提交和验证配置。check 命令读取 GitHub run、job 和 step 元数据，每个必需任务都必须有兼容的成功证据。跨 run 和重跑按任务自身的执行时间排序；重跑其他任务不会推进未重跑 job 的时间。新 manifest 要求但未执行的任务持续阻断旧成功，直到 run 完成。执行时间缺失时，已完成 run 的可信 `updated_at` 可约束未通过证据的最晚时间，允许后续正常执行替代它。时间无界或执行区间重叠时不能复用。本地成功 JSON 和普通范围 CI 不能充当完整候选验证。

`candidate-rehearsal.yml` 通过普通 PR/workflow-call 运行当前实现及相同十项隔离任务。完成后输出所选任务和检出提交，但其原生工作流身份不能授权部署。正式 `candidate-verification.yml` 只在 main 派发；P 在特权 setup 前准入 C，所有控制、setup、收尾代码均来自 P。原生回执绑定仓库、通道、C、双方配置及 P。


预发布由 `prerelease-candidate-verification.yml` 和 `scripts/ci/prerelease-verification.ts` 中独立的可信 main producer 编排。固定 ref 与集成清单绑定选定候选及独立功能来源；同一完整任务目录执行候选，不取得正式写入凭据。回执通道和测试运行环境分别控制：普通回归使用正式环境，pre 专用夹具显式选择 pre，生产构建运行正常 typed hosted builder 并写入 pre 元数据。回执绑定仓库 ID、通道、候选 SHA、候选和策略配置，以及可从受保护 main 到达的兼容 producer。其他候选不能覆盖本候选结果，缺失或不兼容任务均阻断发布。正式候选准入保持原要求；prerelease 日常 push/PR 使用同一 routine plan。测试入口为 `candidate-verification-prerelease.test.ts`、`candidate-verification.test.ts`、`release-publish.test.ts` 和 `candidate-verification-pages.test.ts`。


完整 catalog 的候选安装钩子、浏览器下载、服务准备、构建和测试使用独立 UID 及专用 Docker29.9.3 rootless daemon。可信 runner 独占原始源码、policy 依赖、命令文件、日志与回执；policy CLI 使用 Node 原生 TypeScript，不执行候选可写目录中的工具。root 所有的 `candidate-user-environment.sh` 在 PAM 之后为 bootstrap 命令及该 UID 的用户管理器重设 HOME、XDG 和 Docker 私有路径，保留通知 socket，并排除全局环境生成器。候选没有宿主 sudo 或 rootful Docker 权限。root 所有的 smoke 实测身份、客户端 no-new-privileges、受保护文件、bind 写入身份及双向 host 网络。Docker 容器由 daemon 的 rootless UID 映射隔离，客户端 no-new-privileges 不会经 Docker API 传播给容器。清理先停止用户管理器及全部后代 cgroup，再转交候选目录，核对源码字节并以不跟随链接的方式收集诊断。候选输出先写私有日志，显示前转义。普通 PR 完整 catalog 使用相同执行器，提供合入前证据；缺少隔离能力直接失败。历史 stable 回执仅限可信 `LEGACY_STABLE_CUTOFF` 的祖先边界，候选删除 marker 不能选择 legacy。该候选一旦有新的 main producer 尝试，包括未完成或配置不兼容的尝试，就不能退回历史成功。prerelease 回执始终要求隔离准备、运行时证明与完整清理成功。测试：`candidate-verification-isolation.test.ts`、`candidate-verification-cli.test.ts` 和 `candidate-verification.test.ts`。

## 日常范围验证

GitHub Actions 是集成与发布的正式证据。本机定向检查提供开发反馈。`ci.yml` 是 PR 与 main 的唯一自动验证入口。

日常选择按依赖证据进行。证据不全时在有界层内扩大，只有完整触发项才选择完整目录。发布候选验证仍是完整性保证。选择规则见 [ADR 0037](../adr/0037-scope-routine-verification-and-gate-releases.md) 与 [CI 检查](../operations/ci-checks.md)。

| 职责 | 入口 |
|---|---|
| 规划分支、检出和源码指纹 | `scripts/ci/verification-plan.ts` 的 `createRepositoryPlan`；`scripts/ci/routine-verification-plan.ts` 的 `planRoutineVerification`；导入图在 `scripts/ci/import-graph.ts` |
| 确定性文件分组 | `scripts/ci/routine-partitions.ts` 的 `routinePartitions` |
| 执行与 Vitest 报告 | `scripts/ci/scoped-verification.ts`；`scripts/ci/vitest-results.ts` |
| 本机受影响检查 | `scripts/verify.ts` 的 `pnpm verify affected` |
| 必需门禁 | `scripts/ci/routine-verification-gate.ts`；`.github/workflows/ci.yml` 调用 `.github/workflows/scoped-verification.yml` |

`test-consumers.ts` 记录选中的测试是否需要数据库服务。

运行时依赖选择包含 Vitest 配置中的 setup 消费者；生成产物读取仍停在直接读取者及其直接测试，并解析局部 const 路径别名。依赖图缓存必须匹配源码指纹。浏览器查找停在共享测试 helper。`restart-local.sh` 一次构建 Replay Viewer 及其产物，隔离浏览器入口通过 tsx 创建环境，负责启动失败清理及凭据文件移除。浏览器 JSON 必须证明所选 spec 的实际完成结果。合法的空文档计划跳过全部执行槽位。计划摘要包含选择依据。

测试：`scripts/__tests__/routine-verification-plan.test.ts`、`scripts/__tests__/routine-verification-replay.test.ts`、`scripts/__tests__/verify-affected.test.ts`、`scripts/__tests__/scoped-verification-partitions.test.ts`、`scripts/__tests__/scoped-verification.test.ts`、`scripts/__tests__/scoped-verification-cli.test.ts`、`scripts/__tests__/routine-verification-gate.test.ts`、`scripts/__tests__/isolated-browser.test.ts`、`scripts/__tests__/vitest-results.test.ts`、`scripts/__tests__/ci-card-impl-boundaries.test.ts`。

## 架构门禁

`pnpm run check:architecture` 持有架构检查声明。quality 任务读取其中的生产扫描器、类型检查和 lint 命令；测试属于各 Vitest 组。聚合命令也通过 `check:architecture-tests` 运行契约测试和沙盒 prompt、文档检查。各扫描器捕捉 agent 与开发者的常见错误，并提供可操作的诊断。

| 不变量 | 可执行覆盖 | 限制 |
|---|---|---|
| `shared` / `server` / `client` 物理分层 | ESLint `architecture/imports` | 检查导入，不检查运行时归属 |
| Card Source 范围与跨卡引用 | `pnpm run check:card-impl-boundaries` | 对生产 Card Source 做同文件 AST；`Major_*`、`reaches`、购买与前置候选是例外；不追踪跨文件数据流；范围为空或不匹配时失败 |
| Listener 订阅 selector | 共用注册契约与 `check:card-impl-boundaries`，`verify prepush` 同样执行 | 检查展开后的生产注册与权威行动格 ID；牌面审查候选单独报告；不从格子筛选推断触发语义 |
| 运行时依赖环 | `pnpm run check:dependencies` | 任何运行时 SCC（含自环与字面量动态导入）都失败；没有基线；显式 type-only 导入会被擦除，但内联类型说明符仍会加载模块；已跟踪或未被忽略的未归类源码根失败 |
| 浏览器与 Replay 隔离 | `pnpm run check:browser-boundaries` | 源码图加真实 Vite 模块图 |
| 编译期架构契约 | `pnpm run check:architecture-types` | 对 `tsconfig.architecture.json` 运行真实的 no-emit 程序 |
| 扫描完整性 | 直接写会话日志、effect 文件清单、no-DSL、测试 project 覆盖、Card Source 与田地 seam 检查 | 缺失或无法解析的根失败 |
| 尾随 listener 快照 | `pnpm run check:card-impl-boundaries` | 在 `immediatelyAfter` 与 `after` 中直接读取 `improvements` / `minorPlayed` / `occupationPlayed` 的长度会失败；成员检查仍然有效；只检查已解析的 handler 本体 |
| Listener 状态纯度 | 每个分发 listener 的 Vitest project 中的运行时守卫，加 `check:card-impl-boundaries` | 只证明执行到的分支 |
| 文档预算 | `scripts/__tests__/docs-budget.test.ts` | Workshop 可读的每份文档都不超过 `REFERENCE_LIMITS.fileBytes`；架构索引 ≤ 16 KiB，每份 module 文档 ≤ 32 KiB，不出现卡牌 ID |
| 生成目录与 Card Source 一致 | `pnpm run check:generated-cards-sync` | 结构相等 |
| `GameSession` 持有命令 seam | `CONTEXT.md`、ADR 0014、review 与分层错误 | 是归属关系，不是全程序修改证明 |
| 架构门禁接线 | `pnpm run check:architecture`、`scripts/ci/verification-tasks.ts`、`scripts/__tests__/ci-card-impl-boundaries.test.ts` | 范围 CI 选择 canonical task 并始终评估 `verify`；quality 保留生产扫描器；契约反例属于各 Vitest 组；必需检查遵循 `docs/operations/ci-checks.md` |

优先使用源码发现、文件清单、导入边界与小型语法检查。扫描器复用 `scripts/source-files.ts`；必需的根缺失或为空、解析错误或不支持的条目都会失败，不再匹配任何已识别写入的具名豁免视为过期。没有具体的仓库用例，不要把检查器扩展成符号或数据流引擎。

农场写入扫描复用 `check:card-impl-boundaries`，覆盖生产 `shared/`、`server/` 及新增子目录。全仓审计由 CLI 门禁负责，小型仓库夹具验证写入 owner、失效例外和几何依赖行为。它与操作收据共用 `FARM_LAYOUT_KEYS`，并核对权威已用格及放置几何读取是否包含在该契约内。只有具名共同写入者和两个具名建局、恢复函数有例外；根缺失或为空、解析失败和失效例外都会失败。赋值、数组修改、索引写、常见 alias 与 `Object.assign` 的机械反例见 `scripts/__tests__/farm-write-scan.test.ts`。语法扫描不证明任意 JavaScript，支付、顺序、归属及已用格资格由 Session 测试证明。

## 资格与 main 输入验证

PostgreSQL 资格测试验证最新授予读取与删除外键。权威和退役测试覆盖身份交接、来源撤销、代次隔离及当前恢复审计。HTTP 与真实 WebSocket 边界测试在房间分配、版本或 Replay 变化前拒绝已移出配置和命令，再验证省略、空及未知能力声明下的普通请求。浏览器保留管理员授予／撤销、预发布入口、普通邀请、Hotseat 和观战验证。普通历史 pending 快照通过 `fixed-room-prices-recovery.test.ts` 和 `standard-solo-recovery-network.test.ts` 执行下一条命令。
