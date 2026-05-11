# AGENTS

> 适用 Claude Code / Cursor / Codex 等 agent；CLAUDE.md 软链到本文件。

## Project

Open Agricola——后端权威 + WebSocket 实时多人同步的 Agricola 桌游在线复刻。三层架构：`shared/`（领域逻辑）+ `server/`（HTTP + WS 服务）+ `client/`（React UI）。

## Architecture Boundaries

- 三层 `shared/` + `server/` + `client/`，前端只负责渲染、输入收集、视角化展示，不做规则裁定。
- 后端 `GameSession`（`server/game-session.ts`）是 `GameState` 的**唯一写入者**。
- WebSocket 房间对局是主链路；HTTP 仅用于调试、补拉快照、测试辅助。
- 与游戏规则相关的实现优先放在 `shared/` + `server/`，不要在前端 UI 补规则逻辑。
- 遇到不确定的实现，优先参考 `../bga-agricola`，除非架构文档已明确给出不同设计。
- 详细架构（节点树引擎、Hook 系统、协议层、Pending 模型、房间系统）→ `docs/ARCHITECTURE.md`。

## Commands

```bash
pnpm install                # canvas 需要系统库：libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev
./restart-intranet.sh       # 本地开发/运行/测试统一入口（先重启再用浏览器/Playwright/命令行验真实行为）
pnpm test                   # vitest 全量（fast + slow）
pnpm test:fast              # 只跑 fast project（CI 默认）
pnpm test:slow              # 只跑 slow project（单卡 session 测试）
pnpm run test:e2e           # Playwright E2E（需要后端 + 前端在跑）
pnpm exec vitest run <file> # 单文件
pnpm run lint               # ESLint（error 必须清零）
pnpm run build              # tsc + vite build
```

本地开发**统一使用 Node.js 22**；`better-sqlite3` 等原生依赖按 Node ABI 编译，Node 20 启动会出现 `NODE_MODULE_VERSION` 不匹配。

## Testing

三层：
- **Unit**（`shared/**/__tests__/*.test.ts`）——纯领域逻辑，造 mock state 调函数。
- **Session**（`server/__tests__/*.test.ts`）——直接实例化 `GameSession`，调 `takeAction()` 等，断言 `resp.state` / `pending` / `ok`。
- **E2E**（`e2e-tests/*.spec.ts`）——Playwright 浏览器测试。

规则正确性测试用 Session 测试，断言 `state` / `pending` / `log` / `scores`。**不要把 DOM、按钮文案、页面结构作为规则正确性的主要断言依据**。前端渲染单独做 E2E。测试默认 **2 人游戏**。详见 `docs/CARD_TEST_TEMPLATE.md`。

## Card Implementation Rules

**总规范：卡牌能力尽量在卡牌文件内部闭环，不能扩散。卡牌文件行数尽量贴近 BGA，甚至更少。**

扩展原则：无特殊原因不要改动主路径（`pay.ts`、`improvement.ts`、`game-session.ts` 等核心文件）。

**优先使用：** Hook 系统（`shared/actions/hooks.ts`）、Card Definition 通用字段（`cost`、`reward`、`prerequisite`）、卡牌局部状态（`player.cardStates[cardId]`）。

**禁止：** 在核心文件中添加针对某张卡的 `if-else`；创建集中的卡牌效果注册表；在前端硬编码卡牌特定规则；让前端替后端做规则裁定。

**只有在下列情况才允许改动主路径：** 新增可复用的通用扩展机制；修复核心 bug；性能优化；明确的协议层 / 同步层演进（如 WS、snapshot/patch、pending 模型）。

**Hook 与状态设计：** 优先复用现有 Hook phase，不要轻易新增 Hook 点。持续计数 / 标记 / 局部状态优先写入 `player.cardStates[cardId]`。后续选择 / 延迟效果优先走显式 `pending` / continuation 语义，不要在前端偷偷补流程。新增 Hook 点必须同时补测试和文档。

**Effect 不膨胀：**行动从 `shared/actions/effects/*.ts` 自动发现（每个效果一个文件）。Anytime 行动同样自动发现。行动工厂在 `shared/actions/factories/`。**禁止在 effect 文件中堆叠多卡逻辑**。

**命名规范：** 卡牌文件 `{Deck}_{Number}_{Name}.ts`（例如 `A123_FrameBuilder.ts`）；类型导出常量名同卡牌名。

## Card Workflow

新增 / 修改卡牌实现时，**必须先提供测试说明**，得到确认后再编码。测试说明基于 `docs/CARD_TEST_TEMPLATE.md` 编写，必须包含：
- 从一局新的 2 人游戏开始的初始状态准备
- 前置条件（玩家资源、已打出卡牌、行动格占用、农场版图、`cardStates`）
- 玩家交互序列、每步调用的后端接口或命令
- 每步后必须断言的字段（`state` / `pending` / `log` / `scores`）
- 哪些情况不应触发卡牌效果

## Doc Sync (硬性)

> 文档分工固定如下，**不要新建并行文档**。

| Doc | When to update |
|---|---|
| `docs/card_progress.md` | 每次改卡牌相关代码（新实现 / 修 bug / 改简化 / 改 desc / 调 hook） |
| `docs/card_desc_audit.md` | 改卡牌 desc 文案 / 改卡牌 ID 命名 / 跑完一轮 desc 重对齐 |
| `docs/master-plan.md` | 启动 / 完成 sprint / 调整排期或工作量估算 |
| `docs/ARCHITECTURE.md` | 改通用扩展点（hook phase、ActionFlow node、协议层） |
| `docs/CARD_TEST_TEMPLATE.md` | 测试策略 / 卡牌测试写法变化 |
| `docs/PLATFORM_DESIGN.md` / `DEPLOY_PLAN.md` / `HOW_TO_DEPLOY.md` | 仅在对应议题改动时更新 |

**`card_progress.md` 同步检查清单**（每次卡牌相关 commit）：
- §2 当前轮次 — 加一行（日期 + 涉及卡 + 一句话摘要）
- §3 / §4 / §5 / §6 — 把对应卡片从待实现 / 简化 / 刻意不同 / 待复核中迁出或更新状态
- §1 总览数字 — 实现数 / Tier 数有变化时同步
- §7 基础设施 — 新加的通用机制要登记
- §8 时间线 — 新批次要加新行

## Change Boundaries

- 不引入循环依赖。
- 卡牌相关能力尽可能在卡牌文件内部闭环，不要把单卡逻辑扩散到主路径。
- **后端权威**：规则在 `shared/` + `server/`；不在前端 UI 加规则。
- 不为单卡改动主路径（`pay.ts`、`improvement.ts`、`game-session.ts`）。用现有扩展点（hooks、modifiers、卡牌定义字段）。
- 测试时**默认 2 人游戏**。

## Verification After Changes

每次代码改完，按以下顺序验证：

1. `./restart-intranet.sh`——重启前后端，**这是本地开发 / 运行 / 测试的统一入口**
2. 用浏览器 / Playwright / 命令行验真实行为
3. `pnpm test:fast`（关键单卡涉及收获 / 多步 flow 时跑相关 session 测试）
4. `pnpm run lint`（error 必须清零）

## Commit & CI Workflow

**永远使用 rebase，禁止 merge。**

每次 `git push` 之前需要 rebase main，发现冲突要先解决。先在本地跑一遍 CI（`pnpm run lint` + `pnpm test:fast`），失败立刻定位修复，再继续其他工作。

`git push` 之后**必须等到相关 GitHub Actions run 结束**；run 进行中或失败时当前任务都不算完成。失败立刻定位修复。

Commit 标题规范：`feat: ...` / `fix: ...` / `refactor: ...` / `docs: ...`，message 用英文，简洁明了。

`.env` 中已有 `GH_TOKEN`；`source` 后即可调 GitHub API。完整的 curl/jq/gh CLI 命令（最近 run 状态、失败 job 日志、手动触发 workflow、查 repo variables）→ `docs/operations/ci-checks.md`。

## Deployment

前端 GitHub Pages 自动部署（`.github/workflows/deploy-pages.yml`，触发分支 `main` / `ui`）；后端用 `./deploy-backend.sh <ssh-host> [branch] [remote-dir]` 手动部署 Docker。完整步骤、环境变量、TLS、CORS、常见问题 → `docs/HOW_TO_DEPLOY.md`。

## Common Pitfalls

- **不要 commit `docs/superpowers/*`**：superpowers skill 产出的 spec / plan / working notes 不进 git。这是会话/PR 中间产物，污染 git history。即使 brainstorming / executing-plans skill 默认要求 commit spec，**违反默认行为，等用户明确要求才 commit**。每次 `git add` 必须显式排除 `docs/superpowers/`。
- **`./restart-intranet.sh` 不仅是"启动方式"**：它是本地开发 / 运行 / 测试的统一入口。每次代码改完，先重启，再用浏览器 / Playwright / 命令行验真实行为，再考虑 `pnpm test:fast` 等单元测试。
- **Session 测试里卡牌不要随机，必须显式设置 hand**：`new GameSession()` 不传 seed 时 `createSeed()` 用 `Math.random()`（`shared/utils/rng.ts:1`），每次跑都给玩家发不同 7 张 minor / 7 张 occupation。Hand 内容会影响 `improvement-any` / `minor-improvement` / `wrapOptional(...)` 等节点的"是否 doable / 是 single auto-resolve 还是 multi-option wait"判定 → 测试断言对应的等待节点 / option 数随机生效，整体跑时偶发 fail。修法：setup 里显式覆盖所有玩家的 `minorHand` + `occupationHand`，最简洁用占位 id `['__test_placeholder__']`（在 `getMinorImprovement` 返回 undefined，被 buyable 列表过滤），既能避免 `normalizeState` 第 161 行因为空 hand 触发 re-deal，又让"任意可买 minor"的路径稳定为空。注意：放任 `player.minorHand = []` **不**等于 placeholder——它会触发 re-deal 重新发随机 7 张。

## Docs Map

| Topic | Doc |
|---|---|
| Architecture | `docs/ARCHITECTURE.md` |
| Deployment | `docs/HOW_TO_DEPLOY.md` |
| Platform & Workshop | `docs/PLATFORM_DESIGN.md` |
| Card Test Template | `docs/CARD_TEST_TEMPLATE.md` |
| Card Progress | `docs/card_progress.md` |
| Card Desc Audit | `docs/card_desc_audit.md` |
| Master Plan | `docs/master-plan.md` |
| CI Checks | `docs/operations/ci-checks.md` |
| GitHub OAuth Setup | `docs/operations/github-oauth-app-setup.md` |
