# AGENTS

> 适用 Claude Code / Cursor / Codex 等 agent；CLAUDE.md 软链到本文件。

## Project

Open Agricola——后端权威 + WebSocket 实时多人同步的 Agricola 桌游在线复刻。三层架构：`shared/`（领域逻辑）+ `server/`（HTTP + WS 服务）+ `client/`（React UI）。

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `titanxxh/open-agricola` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: read root `CONTEXT.md` and any ADRs under `docs/adr/`. See `docs/agents/domain.md`.

## Architecture Boundaries

- 三层 `shared/` + `server/` + `client/`，前端只负责渲染、输入收集、视角化展示，不做规则裁定。
- 后端 `GameSession`（`server/game/authoritative-session.ts`）是 `GameState` 的**唯一写入者**。
- WebSocket 房间对局是实时同步主链路；HTTP 用于调试、补拉快照、测试辅助，以及版本化的 Game Context、Replay 和 Bug Report 产品接口，不通过 HTTP 另建规则写入主链路。
- 与游戏规则相关的实现优先放在 `shared/` + `server/`，不要在前端 UI 补规则逻辑。
- 详细架构（节点树引擎、Hook 系统、协议层、Pending 模型、房间系统）→ `docs/ARCHITECTURE.md`。

## Commands

```bash
pnpm install                # canvas 需要系统库：libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev
./restart-local.sh       # 本地应用启动 / 重启统一入口，默认绑 127.0.0.1
./restart-local.sh --intranet   # 改绑局域网 IP（eth0/en0），供同网段其他机器访问
pnpm test                   # vitest 全量（fast + slow）
pnpm test:fast              # 只跑 fast project（CI 默认）
pnpm test:slow              # 只跑 slow project（单卡 session 测试）
pnpm test:llm               # 固定卡牌测试、历史 golden 与账本回归，不调 API，进 CI
pnpm test:llm:dry           # 专用本地环境的固定 case 合成浏览器演练，不调付费 API
pnpm test:llm:live --model <id> # 已确认模型/预算后的完整浏览器验收，保存独立批次
pnpm run test:e2e           # Playwright E2E（需要后端 + 前端在跑）
pnpm verify focus <file.test.ts> # 调试期间定向 Vitest，不启动应用
pnpm verify prepush         # 最终版本的完整 fast + lint，记录源码指纹与结果
pnpm verify <file.spec.ts>   # 隔离环境重启应用并跑 Playwright；不传文件则跑全部
pnpm verify status          # 查看验证记录是否仍对应当前源码
pnpm run lint               # ESLint（error 必须清零）
pnpm run build              # tsc + vite build
```

修改工坊生成流程、prompt 或模型准入时，先读 `docs/test/llm-card-gen.md` 的固定测试入口、费用账本与本地产物要求。

本地开发**统一使用 Node.js 24.15+**；`engines` 声明 `^24.15.0 || >=26.0.0`（`isolated-vm` 7 要求 `node >= 24`，`jsdom` 30 只接受 `^24.15.0 || >=26.0.0`，**不支持 Node 25**）；`better-sqlite3` 等原生依赖按 Node ABI 编译，用更低版本启动会出现 `NODE_MODULE_VERSION` 不匹配。

## Testing

三层：
- **Unit**（`shared/**/__tests__/*.test.ts`）——纯领域逻辑，造 mock state 调函数。
- **Session**（`server/__tests__/*.test.ts`）——直接实例化 `GameSession`，调 `takeAction()` 等，断言 `resp.state` / `pending` / `ok`。
- **E2E**（`e2e-tests/*.spec.ts`）——Playwright 浏览器测试。

规则正确性按风险选择最小测试层：机械约束用静态门禁；简单即时资源效果可直接调用公开 effect / listener 做行为测试；支付、选择 / pending、延迟效果、跨玩家和多步 flow 必须用 Session 测试，断言 `state` / `interaction` / `log` / `scores`。禁止只验证导出和对象形状的通用 smoke test。前端渲染单独做 E2E。Session 测试默认 **2 人游戏**。详见 `docs/CARD_TEST_TEMPLATE.md`。

## Card Implementation Rules

**总规范：卡牌能力尽量在卡牌文件内部闭环，不能扩散。卡牌文件保持精简。**

扩展原则：无特殊原因不要改动主路径（`shared/actions/effects/pay.ts`、`shared/actions/effects/improvement.ts`、`shared/session/session-core.ts`、`server/game/authoritative-session.ts` 等核心文件）。

**优先使用：** Hook 系统（`shared/actions/hooks.ts`）、Card Definition 通用字段（`cost`、`reward`、`prerequisite`）、卡牌局部状态（`player.cardStates[cardId]`）。

**禁止：** 在核心文件中添加针对某张卡的 `if-else`；创建集中的卡牌效果注册表；在前端硬编码卡牌特定规则；让前端替后端做规则裁定。

**只有在下列情况才允许改动主路径：** 新增可复用的通用扩展机制；修复核心 bug；性能优化；明确的协议层 / 同步层演进（如 WS、snapshot/patch、pending 模型）。

**Hook 与状态设计：** 优先复用现有 Hook phase，不要轻易新增 Hook 点。持续计数 / 标记 / 局部状态优先写入 `player.cardStates[cardId]`。后续选择 / 延迟效果优先走显式 `pending` / continuation 语义，不要在前端偷偷补流程。新增 Hook 点必须同时补测试和文档。

**Effect 不膨胀：**行动从 `shared/actions/effects/*.ts` 自动发现（每个效果一个文件）。Anytime 行动同样自动发现。行动工厂在 `shared/actions/factories/`。**禁止在 effect 文件中堆叠多卡逻辑**。

**命名规范：** 卡牌文件 `{Deck}_{Number}_{Name}.ts`（例如 `A123_FrameBuilder.ts`）；类型导出常量名同卡牌名。

## Card Workflow

新增 / 修改卡牌实现前，先做一轮简短设计判断，并把结论写进测试说明或实现计划：
- **难易程度**：判断是单卡局部修复、复用现有 hook/helper、还是需要通用机制。
- **基础设施缺口**：明确是否缺 ActionFlow / pending / payment / field / animal / action-pool 等通用能力；缺基础设施时先设计通用扩展，禁止在主路径塞单卡 `if-else`。
- **落地边界**：优先选择最小可验证切片；如果要改主路径，说明它服务哪些卡和哪些测试，而不是只服务单卡。

新增 / 修改卡牌实现时，**必须先提供测试说明**，得到确认后再编码。测试说明基于 `docs/CARD_TEST_TEMPLATE.md` 编写，必须先说明选择直接行为测试还是 Session 测试及原因。直接行为测试写清输入、公开 effect / listener 调用、预期 flow / 资源 delta 和不触发情况；Session 测试必须包含：
- 从一局新的 2 人游戏开始的初始状态准备
- 前置条件（玩家资源、已打出卡牌、行动格占用、农场版图、`cardStates`）
- 玩家交互序列、每步调用的后端接口或命令
- 每步后必须断言的字段（`state` / `interaction` / `log` / `scores`）
- 哪些情况不应触发卡牌效果

## Doc Sync (硬性)

> 文档分工固定如下，**不要新建并行主题文档**。原路径的英文文档是唯一权威版本；同名 `_zh.md` 仅作为中文翻译镜像，不属于并行真源。

- 修改下表中的英文文档时，若存在同名 `_zh.md`，同一变更必须同步该中文镜像；没有 `_zh.md` 的文档仅维护英文权威版本。代码、测试和 agent 指针只读取英文权威文件。

| Doc | When to update |
|---|---|
| `docs/card_implementation_status.md` | 官方卡实现变化，或社区卡引入 / 修复通用机制、基础设施 gap、accepted divergence 时 |
| `docs/community_cards.md` | 工坊社区卡新增 / 更新时，由 PR 生成器维护唯一社区卡清单；纯社区卡新增不重复修改 `card_implementation_status.md` |
| `docs/ARCHITECTURE.md` | 改通用扩展点（hook phase、ActionFlow node、协议层） |
| `docs/CARD_TEST_TEMPLATE.md` | 测试策略 / 卡牌测试写法变化 |
| `docs/PLATFORM_DESIGN.md` / `DEPLOY_PLAN.md` / `HOW_TO_DEPLOY.md` | 仅在对应议题改动时更新 |

**`card_implementation_status.md` 同步检查清单**（需要更新该文档时）：
- §2 问题优先清单 — 修复后移除或降级，新增 gap 立即登记
- §3 已接受差异 / §11 源码排除 / §12 单卡附录 — 只登记有意的偏离和排除；已对齐的卡不逐条记录，行为以卡牌文件和相邻测试为准
- §6 基础设施 — 新加的通用机制要登记
- §8 反模式 — 新增设计禁令时补充
- Hook 归属由 `ALL_CARD_IMPLS` 派生，不在文档里维护副本

## Change Boundaries

- 不引入循环依赖。
- 卡牌相关能力尽可能在卡牌文件内部闭环，不要把单卡逻辑扩散到主路径。
- **后端权威**：规则在 `shared/` + `server/`；不在前端 UI 加规则。
- 不为单卡改动主路径（`shared/actions/effects/pay.ts`、`shared/actions/effects/improvement.ts`、`shared/session/session-core.ts`、`server/game/authoritative-session.ts`）。用现有扩展点（hooks、modifiers、卡牌定义字段）。
- 项目仍处于开发阶段，不需要维护旧存档、旧 `engineStack` / pending cursor、旧 action id 的向后兼容；除非用户明确要求，不要把缺少兼容迁移作为 PR review blocker。
- 测试时**默认 2 人游戏**。

## Verification After Changes

调试与最终验证分开，命令和记录语义见 `docs/operations/ci-checks.md`：

1. 调试期间用 `pnpm verify focus <file.test.ts>` 验证最小相关范围；纯测试 / 工具 / 文档改动不要求每次重启应用。
2. 涉及应用运行行为、UI 或 WS 时，最终验证先通过 `./restart-local.sh` 重启，再用浏览器 / Playwright / 命令行验真实行为；`pnpm verify <file.spec.ts>` 会在隔离环境调用该重启入口。
3. 最终源码上运行 `pnpm verify prepush`（完整 `pnpm test:fast` + `pnpm run lint`）；按风险补相关 slow Session / E2E，定向测试不能代替完整门禁。
4. 修改源码或 rebase 改变文件内容后重新验证；`pnpm verify status` 可检查本地记录的新鲜度。记录只辅助核对，不自动跳过检查。

## Commit & CI Workflow

**永远使用 rebase，禁止 merge。**

每次 `git push` 之前需要 rebase main，发现冲突要先解决；在最终源码上运行 `pnpm verify prepush`，失败立刻定位修复。需要本机全量 CI 时按 `docs/operations/ci-checks.md` 执行，prepush 仅覆盖 fast + lint，不代表完整 CI。

`git push` 之后**必须等到相关 GitHub Actions run 结束**；run 进行中或失败时当前任务都不算完成。失败立刻定位修复。

Commit 标题规范：`feat: ...` / `fix: ...` / `refactor: ...` / `docs: ...`，message 用英文，简洁明了。

`.env` 中已有 `GH_TOKEN`；`source` 后即可调 GitHub API。完整的 curl/jq/gh CLI 命令（最近 run 状态、失败 job 日志、手动触发 workflow、查 repo variables）→ `docs/operations/ci-checks.md`。

## Deployment

前端在发布 GitHub Release 后（`gh release create vX.Y.Z --generate-notes`）由 `.github/workflows/deploy-pages.yml` 自动部署；后端只允许在 owner 控制的本机用 `./deploy-backend.sh <ssh-host> [ref] [remote-dir]` 部署。GitHub Actions 固定使用 `ubuntu-latest`，额度不足时直接失败，不使用 self-hosted runner。完整步骤、环境变量、TLS、CORS、常见问题 → `docs/HOW_TO_DEPLOY.md`。

## Common Pitfalls

- **不要 commit `docs/superpowers/*`**：superpowers skill 产出的 spec / plan / working notes 不进 git。这是会话/PR 中间产物，污染 git history。即使 brainstorming / executing-plans skill 默认要求 commit spec，**违反默认行为，等用户明确要求才 commit**。每次 `git add` 必须显式排除 `docs/superpowers/`。
- **应用真实行为验收必须重启**：统一用 `./restart-local.sh`；定向 Vitest 调试不需要启动应用，最终门禁见上文。
- **Session 构造时就可能产生开局交互**：事后清手牌不能消除它。复用 `server/__tests__/_helpers/session-fixtures.ts`：真实开局用 `createOpeningSession`，显式选择 seed 并断言阶段 / interaction；工作阶段场景用 `createWorkSession`，在加载前固定所有手牌，无关手牌用 `['__test_placeholder__']`，不能用会触发重新发牌的空数组。两种夹具的边界和示例见 `docs/CARD_TEST_TEMPLATE.md` §5.2。

## Docs Map

| Topic | Doc |
|---|---|
| Architecture | `docs/ARCHITECTURE.md` |
| Deployment | `docs/HOW_TO_DEPLOY.md` |
| Platform & Workshop | `docs/PLATFORM_DESIGN.md` |
| Card Test Template | `docs/CARD_TEST_TEMPLATE.md` |
| 卡牌实现现状 | `docs/card_implementation_status.md` |
| CI Checks | `docs/operations/ci-checks.md` |
| GitHub OAuth Setup | `docs/operations/github-oauth-app-setup.md` |
