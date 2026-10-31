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
- 发布验证在隔离 Hosted 前端和显式配置的目标上复用 `scripts/release/` 中的同一浏览器流程。持久化检查使用 PostgreSQL 适配器和 Room／创建配置 codec。`release-rehearsal.spec.ts` 验证真实应用整合，`release-diagnostics.spec.ts` 与 `release-rendering.spec.ts` 验证传输、脱敏和素材就绪；入口见[CI 操作](../operations/ci-checks.md)。
- 必需浏览器 case 显式声明，并与绑定源码指纹及 requirements hash 的不可变 reporter 证据匹配。reviewer 决定场景范围，`scripts/verify.ts` 和 `verification-requirements.ts` 检查执行是否完整。诊断仅保留有界元数据，首个失败与清理错误分别存储。
- Vitest project 为 `fast-shared`、`fast-cards`、`fast-card-runtime`、`fast-client`、`fast-server`、`fast-scripts`、`fast-tests` 与 `slow`。`pnpm test:fast` 先运行 `check:test-project-coverage`，要求每个测试文件恰好属于一个 project。命令与验证记录见 [`AGENTS.md`](../../AGENTS.md) 与 [`docs/operations/ci-checks.md`](../operations/ci-checks.md)。
- 序列化的展示投影（`lockedFarmTileKeys`、`playerPanelSummary`、`moorSpecialActionAvailability`、卡牌状态展示、动物区、特殊马厩）在所属 Session 上下文中派生，rehydrate 时剥离；纯视角过滤位于 `shared/projections/serialized-state.ts`。新增字段只做加法，已有的 Replay Viewer build 与 payload 保持不变。
- 优先直接调用 `GameSession` 方法；`/api/game/*` 或 WebSocket 消息用于黑盒契约。断言资源、已打出的卡、`cardStates`、行动格、`pending` / `interaction`、`log` 与 `scores`。

## 候选版本完整验证

按需执行的 `candidate-verification.yml` 使用 `scripts/ci/verification-tasks.ts` 中的完整任务清单。fast、slow、构建、质量检查和浏览器分道各自执行，失败任务可独立重试。契约和社区卡测试由正常 Vitest project 覆盖，不额外重复执行。浏览器任务复用 `scripts/verify.ts` 及其结构化结果。

正式 request/check 首先确认所选仓库受保护 main 上的最终 PR 快照，核对原生数字身份、明确的 main ref 与原始 Git 可达性。已确认的代码树批准 producer，配置哈希只标识兼容执行。该新增实现策略及原生治理信任边界见 [ADR 0037](../adr/0037-scope-routine-verification-and-gate-releases.md)。

`scripts/ci/candidate-verification.ts` 绑定实际干净检出、工作流提交和验证配置。check 命令读取 GitHub run、job 和 step 元数据，每个必需任务都必须有兼容的成功证据。跨 run 和重跑按任务自身的执行时间排序；重跑其他任务不会推进未重跑 job 的时间。新 manifest 要求但未执行的任务持续阻断旧成功，直到 run 完成。执行时间缺失时，已完成 run 的可信 `updated_at` 可约束未通过证据的最晚时间，允许后续正常执行替代它。时间无界或执行区间重叠时不能复用。本地成功 JSON 和普通范围 CI 不能充当完整候选验证。

该工作流也支持复用以在合入前执行。只有所有选中的 matrix 任务成功后，完成 job 才输出任务 ID 和实际检出提交。正式发布证据要求在准确候选提交上执行其专用手动工作流。

## 日常范围验证

GitHub Actions 是集成与发布的正式证据。本机定向检查与浏览器复现用于开发反馈，完整本机 `prepush` 是可选入口。`ci.yml` 是 PR 与 main 的唯一自动验证入口，旧全量测试与浏览器工作流不再重复执行选中任务，也不配置定时全量。

`scripts/ci/verification-plan.ts` 独立发现测试归属，包含完整分支差异、rename 两侧和实际检出变化。未知归属、全局配置和缺少可缩小范围的证据时，扩大到完整任务清单。根缺失、源码无法解析或测试未归类时，规划直接失败。`wideningReasons` 记录已知范围内的扩边；`expansionReasons` 记录完整清单回退。

规划器将混合范围归并为每个 Vitest project 的完整文件并集，以及每种浏览器引擎与相同 grep selector 的文件并集，检查与文件顺序固定。未筛选的文件覆盖同引擎下更窄的 selector；专用 catalog 浏览器任务不会抹去 inline 检查。PR 计划包含 merge 检出，main 计划包含完整 push 集成范围；两者使用相同业务组，并保留声明的集成浏览器消费者。

`scripts/ci/support-verification.ts` 将文档约束与 Workshop 运行时验证分别选择。英文参考文档还选择参考资料读取器；可执行沙盒与 prompt 文档保留声明的 Session 契约。`test-consumers.ts` 恰好覆盖每个独立发现的测试一次，沿测试本地 import 与 helper 遍历，记录生产依赖但不继续遍历生产代码。测试与浏览器文件改动选择完整文件及其消费者。helper 的不确定归属、删除和 rename 在已知测试层内扩边；没有存活消费者的 helper 保留该层。浏览器文件在 Chromium 下完整执行，并保留完整的既有 `@webkit` 资格组；该静态引擎组不从 diff 行推导单个 case。已确认的 helper 读取或解析失败会使规划失败。未知归属与全局 setup 改动仍要求完整清单。

`scripts/ci/frontend-verification.ts` 声明完整前端业务组及其浏览器消费者。已知棋盘、计分、交互、认证、传输、语言与 Replay 模块选择完整 client 测试组、质量与构建，以及明确的浏览器文件或 matrix 标签。共享展示扩大到完整浏览器层。前端模块未知时扩大到全量；声明的消费者缺失时规划失败。

`scripts/ci/business-verification.ts` 声明认证/连接/Room、存储/恢复/Replay、协议/投影及工坊业务组。各组选择完整受影响 Vitest project 与 canonical 质量/构建任务。恢复覆盖序列化、客户端传输、Replay 模型和存储/发布测试。工坊保留行为回归、参考资料/prompt/文档约束和两种沙盒执行器，不调用模型。业务组归属未知时扩大到全量；声明的测试、浏览器消费者或 project 缺失时规划失败。公开计划及进程级 CLI 测试位于 `scoped-verification-business*.test.ts`。

已知 operations 采集器、数据库访问授权、部署、Compose 与 Grafana 配置选择完整消费者文件，不再选择完整 server project。必需安全消费者为 `operations-accounts.test.ts`、`operations-openings.test.ts`、`opening-facts.test.ts`、`observability-http.test.ts`、`operations-deployment.test.ts`、`local-services.test.ts` 和 `wechat-community.test.ts`，并保留完整的 `operations-dashboard.spec.ts` 与 `wechat-community.spec.ts` 浏览器文件。独立测试索引沿测试本地依赖、operations 测试前缀，以及声明的子进程或路径字面量关联补入消费者。不确定的模块加载器保留其完整测试文件与 operations 安全组，并记录有界扩边；读取或解析失败会使规划失败。直接调用规划器而未提供索引时，保留完整发现的 unit 清单与完整浏览器分道。

operations 边界不缩小数据库生产写入的验证范围。开局事实迁移与服务端 operations 改动保留完整 server project；持久化、所有权、其他数据库与恢复改动保留原有更广业务组。社区二维码更新、dashboard 生成器和未知 operations 入口要求全量验证。dashboard 浏览器夹具自行提供 Prometheus 抓取配置，通过该测试不能证明生产抓取配置正确；完整 server 测试也不能补齐这项证据。

`scripts/ci/rule-verification.ts` 声明支付、动物、计分、农场/作物、轮次/变体与共享核心的归属。规则路径、Card Source 机制与测试关联选择完整受影响文件、跨卡和 slow Session 消费者，以及保守的共享安全消费者。较小的规则组保留声明的浏览器文件和 WebKit 覆盖；共享核心改动保留完整规则 project 与浏览器分道。关联证据缺失或过期时扩大到完整清单；声明的消费者缺失时规划失败。关联索引记录声明式证据，不证明语义独立。公开边界见 `rule-verification.test.ts` 和 `scoped-verification-business-cli.test.ts`。

`scripts/ci/card-verification.ts` 将权威 Card Source 身份与独立发现的 Vitest、浏览器测试中的字面量、import 和本地测试 helper 关联。索引统一卡号前导零，选择完整文件，包括跨卡和 slow Session 消费者。生产 import 与注册 bootstrap 是归属遍历的终点。通用注册表、文件读取、动态来源、手牌与开局消费者始终保留在保守安全组中，即使同一文件还列有卡牌。有限的卡牌 UI 组、浏览器沙盒、WebKit、质量和构建也保留。已有卡牌新增关联回归测试仍保留在该范围内。生产 Card Source 的新增、删除或 rename、缺少行为关联、身份歧义、helper 证据失效，以及手牌或全局可用卡牌都会扩大到全量。声明的卡牌 UI 消费者缺失时规划失败。公共机制沿用更广的验证范围。索引属于声明式关联契约，不推断语义依赖。公共边界测试位于 `scripts/__tests__/card-verification.test.ts` 和 `scoped-verification-cli.test.ts`。

`scripts/ci/scoped-verification.ts` 在执行前重新计算 canonical plan，核对 digest 与源码身份。`routine-partitions.ts` 将完整 Vitest 检查保留在 `units`，将浏览器 `(engine, grep, file)` 元组排序后轮流分配到四个分区。引擎与 selector 组不超过四组时，也尝试为各组分配独立槽位，把剩余槽位分给每槽文件数最多的组。仅当该方案减少 `pnpm verify` 调用，且每槽不超过 `ceil(tupleCount / 4) + 1` 个文件时采用，否则保留轮流分配。两种方案均保留原 selector，并断言恰好覆盖一次。worker 保留 `pnpm verify`、隔离依赖、`restart-local.sh` 和结构化 case 结果。本机 `all` 模式仍执行完整计划。日常结果不能充当完整发布回执。

units 先准备一次所需测试服务，并构建一次卡牌 manifest，再逐 project 串行执行。每次单 project 的 Vitest 命令执行完整文件，保留默认 reporter，并写入独立 JSON 报告。退出成功与源码身份不变仍是必要条件。实际报告必须包含模块，模块名与所选文件恰好对应一次；缺失、额外、重复、失败或未完成的结果都会阻断完成。`vitest-results.ts` 持有该边界，测试见 `vitest-results.test.ts` 与范围执行测试。

执行结果为每条实际命令记录 `startedAt`、`completedAt` 和单调时钟 `durationMs`，包含准备步骤与失败命令。Vitest 原始报告在 `output/verification/vitest-results/` 保留模块与用例耗时；分区 artifact 同时保留两类证据。测量数据与报告路径不进入 canonical plan 或其 digest，也不能替代执行门禁。

`ci.yml` 在规划后独立调度 units、四个明确的浏览器 caller 和 catalog 任务。范围 caller 共用 `scoped-verification.yml`；空分区以 null descriptor 明示并跳过。始终执行的 `verify` 分别核对每个选中 caller 的状态、分区 ID 与 digest、完整计划 digest、SHA 和完成数。其他成功不能补齐失败或缺失的 caller。仅含 units 的计划保留 `catalog_tasks=none`；浏览器 worker 安装两种引擎以支持嵌入式启动。浏览器检查失败时，在现有验证产物中保留 Playwright 错误上下文和失败截图。公开测试位于 `scoped-verification*.test.ts`、`routine-verification-gate.test.ts` 和 `ci-card-impl-boundaries.test.ts`。

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
