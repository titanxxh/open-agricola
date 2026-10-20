# AGENTS

> 适用 Claude Code / Cursor / Codex 等 agent；CLAUDE.md 软链到本文件。

Open Agricola 是后端权威、通过 WebSocket 实时同步的 Agricola 在线桌游。

## Project map

- `shared/`：领域规则、引擎、卡牌、协议契约。
- `server/`：HTTP、WebSocket、房间与权威 `GameSession`。
- `client/`：React 渲染、输入收集和视角化展示。
- `docs/ARCHITECTURE.md`：架构索引，链接到 `docs/architecture/` 的模块文档。

`server/game/authoritative-session.ts` 中的 `GameSession` 是 `GameState` 的唯一写入者。规则裁定放在 `shared/` 和 `server/`，前端只负责展示和收集输入。

<important if="需要运行构建、测试、lint 或本地应用命令">

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
pnpm verify prepush         # 全卡实现边界扫描 + 完整 fast + lint，记录源码指纹与结果
pnpm verify <file.spec.ts>   # 隔离环境重启应用并跑 Playwright；不传文件则跑全部
pnpm verify status          # 查看验证记录是否仍对应当前源码
pnpm run lint               # ESLint（error 必须清零）
pnpm run build              # tsc + vite build
```

统一使用 Node.js 24.15+，版本范围为 `^24.15.0 || >=26.0.0`，不支持 Node 25。`isolated-vm`、`jsdom` 和原生依赖有版本及 ABI 要求；不要用更低版本启动应用。

</important>

<important if="探索模块职责、规则实现路径或架构设计">

## Domain docs

先读根目录 `CONTEXT.md` 和相关 `docs/adr/`，再从架构索引定位模块。领域术语与文档读取方式见 `docs/agents/domain.md`。

</important>

<important if="创建、读取或更新 GitHub Issue、PRD 或分诊标签">

## Issue tracker

Issues 和 PRDs 使用 `gh` 管理在 `titanxxh/open-agricola`，见 `docs/agents/issue-tracker.md`。默认分诊标签为 `needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`，见 `docs/agents/triage-labels.md`。

</important>

<important if="修改模块依赖、游戏规则、引擎、协议或存档格式">

## Architecture boundaries

- 保持 `shared/`、`server/`、`client/` 三层边界，不引入循环依赖。
- WebSocket 房间对局是实时同步主链路。HTTP 用于调试、补拉快照、测试辅助，以及版本化的 Game Context、Replay 和 Bug Report 产品接口；不通过 HTTP 另建规则写入主链路。
- 项目仍处于开发阶段。除非用户明确要求，不维护旧存档、旧 `engineStack` / pending cursor 或旧 action id 的向后兼容，也不把缺少兼容迁移作为 PR review blocker。

</important>

<important if="新增或修改卡牌实现，或扩展卡牌通用机制">

## Card implementation rules

卡牌能力优先在卡牌文件内闭环，保持文件精简。复用现有 hooks、modifiers、Card Definition 的 `cost` / `reward` / `prerequisite`，局部状态写入 `player.cardStates[cardId]`。

- 不在核心路径增加单卡 `if-else`、集中式卡牌效果注册表或前端特定卡规则。
- `shared/actions/effects/pay.ts`、`shared/actions/effects/improvement.ts`、`shared/session/session-core.ts`、`server/game/authoritative-session.ts` 等主路径，只因可复用通用扩展、核心 bug、性能优化或明确的协议 / 同步演进而修改。
- 优先复用现有 Hook phase。新增 Hook 点必须同时补测试和文档。后续选择和延迟效果使用显式 pending / continuation。
- 每个 effect 一个文件，从 `shared/actions/effects/` 自动发现；Anytime 行动同样自动发现，行动工厂在 `shared/actions/factories/`。不要在 effect 文件中堆叠多卡逻辑。
- 卡牌文件按 `{Deck}_{Number}_{Name}.ts` 命名，例如 `A123_FrameBuilder.ts`；导出常量与卡牌同名。

## Card workflow

新增或修改卡牌实现时，先给出基于 `docs/CARD_TEST_TEMPLATE.md` 的测试说明，得到确认后再编码。测试说明先交代：

- 难易程度：单卡局部修复、复用现有 hook/helper，还是需要通用机制。
- 基础设施缺口：ActionFlow、pending、payment、field、animal、action-pool 是否已有所需能力；缺失时先设计通用扩展。
- 落地边界：选择最小可验证切片。要改主路径时，说明服务哪些卡和哪些测试。
- 测试层及原因：直接行为测试写明输入、公开 effect / listener 调用、预期 flow、资源 delta 和不触发情况。

Session 测试说明必须从一局新的 2 人游戏开始，写清资源、已打出卡牌、行动格占用、农场版图和 `cardStates` 的准备；列出每步交互及调用的后端接口或命令，逐步断言 `state` / `interaction` / `log` / `scores`，并列出不应触发效果的情况。

</important>

<important if="编写或修改规则测试、Session 测试或前端 E2E">

## Testing

| Layer | Location | 用法 |
|---|---|---|
| Unit | `shared/**/__tests__/*.test.ts` | mock state，直接调用纯领域逻辑 |
| Session | `server/__tests__/*.test.ts` | 实例化 `GameSession`，调用 `takeAction()` 等，断言 `resp.state` / `pending` / `ok` |
| E2E | `e2e-tests/*.spec.ts` | Playwright 验证前端渲染和浏览器交互 |

按风险选择最小充分层：机械约束用静态门禁；简单即时资源效果直接调用公开 effect / listener；支付、选择 / pending、延迟效果、跨玩家和多步 flow 必须用 Session 测试，断言 `state` / `interaction` / `log` / `scores`。不要写只检查导出和对象形状的通用 smoke test。前端渲染单独做 E2E。

Session 测试默认 2 人，复用 `server/__tests__/_helpers/session-fixtures.ts`：

- 真实开局用 `createOpeningSession`，显式选择 seed 并断言阶段和 interaction。
- 工作阶段用 `createWorkSession`，在加载前固定所有手牌。无关手牌用 `['__test_placeholder__']`，空数组会触发重新发牌。
- Session 构造时可能已有开局交互，事后清手牌不能消除它。夹具边界见 `docs/CARD_TEST_TEMPLATE.md` §5.2。

</important>

<important if="修改工坊生成流程、prompt 或模型准入">

先读 `docs/test/llm-card-gen.md`，遵循固定测试入口、费用账本与本地产物要求。

</important>

<important if="修改代码契约、卡牌机制、文档或文档指针">

## Doc sync

沿用下表的文档分工，不新建并行主题文档。英文文件是唯一权威版本；若存在同名 `_zh.md`，同一变更同步中文镜像。没有中文镜像时只维护英文。代码、测试和 agent 指针只读取英文权威文件。

| Doc | When to update |
|---|---|
| `docs/card_implementation_status.md` | 官方卡实现变化时，按下方清单核对；只覆盖官方卡，已对齐卡牌不逐条记录 |
| `docs/community_cards.md` | 工坊社区卡新增 / 更新时，由 PR 生成器维护唯一社区卡清单 |
| `docs/ARCHITECTURE.md`、`docs/architecture/*.md` | 通用扩展点或模块职责、不变量、seam 变化时，更新对应模块文档；索引只保留设计不变量、拓扑、分层与模块表 |
| `docs/CARD_TEST_TEMPLATE.md` | 测试策略或卡牌测试写法变化 |
| `docs/PLATFORM_DESIGN.md` / `DEPLOY_PLAN.md` / `HOW_TO_DEPLOY.md` | 对应议题变化 |

架构文档只写职责、不变量、seam 和入口文件、ADR、测试指针。单卡行为以该卡的 Session 或直接行为测试为准，按 issue 记录的修复以 PR 为准，实现叙述以代码为准。体积与卡牌 ID 由 `scripts/__tests__/docs-budget.test.ts` 检查。

更新 status 文档时核对：

- Open issues by priority：修复后移除或降级，新增 gap 立即登记。
- Accepted differences / Source exclusions / Per-card notes：只登记有意偏离和排除；已对齐的卡不逐条记录，类别行已写清的差异不再写单卡备注。
- Infrastructure backlog：只登记尚未实现的跨卡缺口；实现后删除该条，把通用机制写入 `docs/architecture/` 中对应的模块文档。
- Reference anti-patterns：新增设计禁令时补充。
- Hook 归属从 `ALL_CARD_IMPLS` 派生，不在文档中维护副本。

</important>

<important if="准备交付变更、复核验证结果或运行浏览器验收">

## Verification after changes

调试与最终验证分开，详见 `docs/operations/ci-checks.md`：

1. 调试用 `pnpm verify focus <file.test.ts>` 验证最小范围。定向 Vitest 及纯测试、工具、文档调试不要求启动应用。
2. 涉及应用运行行为、UI 或 WS，最终验收必须先通过 `./restart-local.sh` 重启，再用浏览器、Playwright 或命令行验证真实行为。`pnpm verify <file.spec.ts>` 在隔离环境调用该入口。PR 的浏览器 E2E 在本机执行，通过后把结果写入 PR 描述；GitHub Actions 不在 PR 上跑浏览器 E2E。
3. 最终源码运行 `pnpm verify prepush`，覆盖全卡实现边界扫描、完整 fast 和 lint。按风险补 slow Session 或 E2E，定向测试不能替代完整门禁。
4. 修改源码或 rebase 改变文件内容后重新验证。`pnpm verify status` 检查记录是否仍对应当前源码；记录不自动跳过检查。

</important>

<important if="准备 commit、rebase、push 或合入 PR">

## Commit and CI workflow

- 永远使用 rebase，禁止 merge。每次 push 前先 rebase main，解决冲突，再在最终源码上运行 `pnpm verify prepush`；失败立即定位修复。prepush 覆盖全卡实现边界扫描、fast 和 lint，本机全量 CI 按 `docs/operations/ci-checks.md` 执行。
- push 后必须等待相关 GitHub Actions run 结束。运行中或失败时任务不算完成；失败立即定位修复。
- Commit 标题使用 `feat:` / `fix:` / `refactor:` / `docs:`，英文、简洁。
- `.env` 已有 `GH_TOKEN`，source 后可调 GitHub API；查 run、失败日志、手动触发 workflow 和 repo variables 的命令见 `docs/operations/ci-checks.md`。
- 除非用户明确要求，不提交 `docs/superpowers/*` 中的 spec、plan 或 working notes，即使 skill 默认要求提交。每次 `git add` 显式排除 `docs/superpowers/`。

</important>

<important if="发布版本、部署服务或修改部署配置">

## Deployment

前端发布 GitHub Release 后，由 `.github/workflows/deploy-pages.yml` 自动部署，命令为 `gh release create vX.Y.Z --generate-notes`。后端只在 owner 控制的本机用 `./deploy-backend.sh <ssh-host> [ref] [remote-dir]` 部署。GitHub Actions 固定使用 `ubuntu-latest`，额度不足直接失败，不使用 self-hosted runner。步骤、环境变量、TLS、CORS 和常见问题见 `docs/HOW_TO_DEPLOY.md`。

</important>

## Docs map

| Topic | Doc |
|---|---|
| Architecture | `docs/ARCHITECTURE.md`（索引）→ `docs/architecture/*.md` |
| Deployment | `docs/HOW_TO_DEPLOY.md` |
| Platform & Workshop | `docs/PLATFORM_DESIGN.md` |
| Card test template | `docs/CARD_TEST_TEMPLATE.md` |
| 卡牌实现现状 | `docs/card_implementation_status.md` |
| CI checks | `docs/operations/ci-checks.md` |
| GitHub OAuth setup | `docs/operations/github-oauth-app-setup.md` |
