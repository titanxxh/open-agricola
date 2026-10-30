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

`scripts/ci/candidate-verification.ts` 绑定实际干净检出、工作流提交和验证配置。check 命令读取 GitHub run、job 和 step 元数据，每个必需任务都必须有兼容的成功证据；较新的失败会使该任务的旧成功失效。本地成功 JSON 和普通范围 CI 不能充当完整候选验证。

该工作流也支持复用以在合入前执行。正式发布证据要求在准确候选提交上执行其专用手动工作流。新增此入口不会移除日常 CI 门禁。

## 架构门禁

`pnpm run check:architecture` 是唯一的架构门禁，每个 CI workflow 调用一次。它运行架构脚本、契约类型检查、经 `check:architecture-tests` 的契约测试，以及沙盒 prompt / 文档同步。检查保持简单：它们捕捉 agent 与开发者的常见错误，不防御刻意绕过，每条诊断都必须可操作。

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
| 架构门禁接线 | `pnpm run check:architecture`、`scripts/__tests__/ci-card-impl-boundaries.test.ts` | 两个 CI workflow 各调用一次聚合命令；prepush 执行同一生产卡牌扫描；契约反例通过 `check:architecture-tests` 执行；必需检查遵循 `docs/operations/ci-checks.md` |

优先使用源码发现、文件清单、导入边界与小型语法检查。扫描器复用 `scripts/source-files.ts`；必需的根缺失或为空、解析错误或不支持的条目都会失败，不再匹配任何已识别写入的具名豁免视为过期。没有具体的仓库用例，不要把检查器扩展成符号或数据流引擎。

农场写入扫描复用 `check:card-impl-boundaries`，覆盖生产 `shared/`、`server/` 及新增子目录。全仓审计由 CLI 门禁负责，小型仓库夹具验证写入 owner、失效例外和几何依赖行为。它与操作收据共用 `FARM_LAYOUT_KEYS`，并核对权威已用格及放置几何读取是否包含在该契约内。只有具名共同写入者和两个具名建局、恢复函数有例外；根缺失或为空、解析失败和失效例外都会失败。赋值、数组修改、索引写、常见 alias 与 `Object.assign` 的机械反例见 `scripts/__tests__/farm-write-scan.test.ts`。语法扫描不证明任意 JavaScript，支付、顺序、归属及已用格资格由 Session 测试证明。
