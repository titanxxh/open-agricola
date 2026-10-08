# LLM Card Generation Tests

固定 case 的题面、初始状态、交互和断言统一放在 `tests/llm-card-gen/fixtures/`。AI 成功返回一份完整卡牌 TypeScript 源码，包含 `CARD_ID`、`CARD_DEF` 和 `CARD_IMPL`。将这份源码原样交给现有 `runner.test.ts`，在真实两人 `GameSession` 中执行同一套测试；不另建行为判题器或自然语言关键词评分。

## 位置

- `fixtures/`：11 个固定机制的题面与 `setup / scenario / assert`。
- `runner.test.ts`：唯一的固定 case 执行入口，支持历史录音和生成源码。
- `recordings/`：已有历史 golden；仅历史模式允许显式身份/元数据适配。
- `fixtures.test.ts`：已知错误反例，验证固定测试能够发现相关回归。
- `acceptance/`：浏览器生成入口、合成响应和共享费用账本；不维护另一份行为断言。
- `scripts/llm-acceptance.ts`：owner 本机生成固定 case 源码，调用 Vitest 并记录用量。
- `output/tmp/llm-acceptance/`：本地源码、manifest、Vitest 报告和费用快照；已被 Git 忽略，不提交运行产物。

## 运行

```bash
# 现有固定 case、历史 golden、反例和账本测试；不调用模型
pnpm test:llm

# 重测某次生成保存的完整源码；不调用模型
LLM_TEST_SOURCES=/absolute/path/cases-sources.json pnpm exec vitest run --project llm tests/llm-card-gen/runner.test.ts

# 真实浏览器、后端校验和固定测试；模型/GitHub 响应使用合成数据
pnpm test:llm:dry --base-url http://127.0.0.1:5913 --runtime-env output/tmp/llm-runtime/local.env

# owner 已确认模型与累计预算后，才运行真实生成
pnpm test:llm:live --model deepseek-flash --base-url http://127.0.0.1:5913 --runtime-env output/tmp/llm-runtime/local.env

# 单独诊断一个固定 case，不作为完整模型准入
pnpm test:llm:live --model deepseek-flash --diagnose M2-per-action-bonus --runtime-env output/tmp/llm-runtime/local.env
```

`LLM_TEST_SOURCES` 是一个本地 JSON 数组，每项包含 `id`（本次测试名称）、`fixtureId`（已有固定 case 的 ID）和 `sourcePath`（相对 manifest 的 `.ts` 路径）。它只选择源码，不能替换测试断言。缺失文件、未知 case、编译或行为失败都按普通 Vitest 失败处理。生成源码不改 ID、不补元数据、不做代码重写。

`test:llm:record` 是真实浏览器生成命令的别名，结果写入独立的本地批次目录，不覆盖历史 `recordings/`。旧的 `LLM_TEST_MODE=live` / `LLM_TEST_RECORD=1` 入口会拒绝执行，避免绕过浏览器调用和费用限制。

## CI / Workflow

普通 CI 运行确定性的 `pnpm test:llm`，不调用 LLM API。需要 LLM Token 的调用仅允许在 owner 控制的本机运行；入口发现 `CI` 或 `GITHUB_ACTIONS` 后，在读取配置、凭据和预约费用之前拒绝 `--live`。无 Token 的回放和合成演练不受限制。模型请求由浏览器发出，后端只收到源码校验和 GitHub 资料请求。

## Browser-tool acceptance

1. 浏览器按产品流程完成一次真实工具往返探测，并将输出源码交给固定测试。
2. 依次运行 `fixtures/` 的 11 个 case，每题独立生成 3 次，共 33 个任务。
3. 保存每次首次及最终输出的完整 `.ts` 文件，使用 `runner.test.ts` 执行既有 `setup / scenario / assert`，直接收集 Vitest 的测试结果。
4. 分别报告首次和最终通过数、请求数、token、耗时、费用及失败。产品的静态校验最多修复两次；行为测试失败不会自动让模型重写或挑选成功样本。

没有旧 prompt 对照组，也没有自然语言关键词判分。固定可实现题目返回能力缺口或澄清时，因为没有可执行源码而失败；对开放式需求的能力缺口说明，产品保留原始文本，不宣称固定测试已证明其语义正确。有限固定测试通过不代表任意需求都正确。

产品准入按精确 provider、endpoint 和 model 登记在 `client/services/llm/generation/admission.ts`。真实工具探测和全部固定测试通过后才可登记；合成演练和历史 golden 都不能作为新的模型准入。`deepseek` / `https://api.deepseek.com/v1/chat/completions` / `deepseek-flash` 的[已有验收结论](https://github.com/titanxxh/open-agricola/issues/1041#issuecomment-6057596377)保留，其他组合待验。

### 本地产物与预算

每批写入独立的 `output/tmp/llm-acceptance/<batch>/`，保存版本 manifest、源码、首次/最终测试结果、参考来源和用量。可见最终回答保留有界文本；原始 provider 推理、签名和协议消息只留在页面内存。失败和中断记录同样保留，不覆盖、不改写为成功；这些运行文件不进入源码仓库。

所有真实调用共用累计 **20 美元**预算，包括探测、失败、修复及后续批次。账本继续使用 `<git-common-dir>/llm-acceptance-usd5.json` 的历史文件名，保留以前的费用和未知用量预约；不会因新批次或 worktree 重置。每次 POST 前先持久预约，返回后结算，未知用量保留足额预约。合成演练使用独立临时账本。费用按配置的价格保守估算，不等于供应商账单。

真实批次要求实现已提交且工作区干净；批次进行中修改源码或测试会使该批次不完整。LLM key 仅在测试进程与浏览器间传递，runtime env 只允许测试数据库和运行配置，不允许放入 provider/GitHub token。浏览器拦截器在请求发出前验证凭据目的地。

## Fixture 三段式

```ts
interface CardFixture {
  id: string
  cardId: string
  cardType: 'minor' | 'occupation'
  userMessage: string          // 喂给 LLM 的题面

  // 编译 LLM 代码 → 构造 GameSession → mutate 初始状态
  setup: (llmCode) => { session, ctx }

  // 通过 Driver 驱动场景（takeAction / resolveChoice / advanceToHarvest / …）
  scenario: (driver, ctx) => void

  // 断言 state / interaction / log / scores
  assert: (session, ctx) => FixtureResult
}
```

每张卡单独一个 fixture 文件，不串接。

## 关键约束（来自踩坑实战）

### 确定性

`buildSessionWithLLMCard(code, opts)` 内部自动：

- `clearAllHands(state)` —— 不随机发牌
- `fixRoundActionOrder(state)` —— 14 回合行动卡按 `FIXED_ROUND_ACTION_ORDER`（每 stage 按 `roundStageActions` 声明序取）
- Wrap session in Proxy，每次方法调用自动走 `session.withCtx(...)`

所以 fixture 不用自己 `withCtx`、也不用担心 seed 影响初始局面。

### 初始状态准备

`clearAllHands` 现在将所有 hand 设为 `__test_placeholder__`，避免 `normalizeState` 对空 hand 重新发牌。`buildSessionWithLLMCard` 返回后可准备 `session.getState().state` 的测试初始状态。

### 多步骤行动

连续 `takeAction` 之间可能进入 `interaction.request.kind === 'confirm-next-player'`（比如轮到对手但对手没工人）。新验收只自动处理确认及明确的本卡选择；支付等关键 pending 必须使用 `takeActionRaw()` / `resolveChoiceRaw()` 检查选项后明确选择。历史录音保留显式标记的旧 drain 行为。

单回合内同一玩家多次 action 还需要：

```ts
setWorkersAtHome(state, p0, N)       // 有 N 个在家
setActiveWorkerCount(p0, N)          // 活跃 N 个（家庭规模 ≥ N）
setActiveWorkerCount(p1, 0)          // 对手零工人，避免轮转
```

### 末回合 scoring（M4 模式）

`autoAdvanceRoundEnd(session, { maxIterations })` helper 用 `performRoundEnd` 和 `resolveChoice` 消化 feed / animal-reorg / confirm-next-player / confirm-player-switch 等等待交互，直到 `gameOver`。**会自动把 supply 里的动物放到 pasture/house/stable**（贪心 greedy），保证 `cattle` / `sheep` / `boar` 不被丢失。

读 per-card bonus VP 要用 `getBonusBreakdownForSession(session, playerIndex)`（wraps `runBonusSolver` in `withCtx`）——直接跑 `computeScores(state).categories.cardStateBonusVp` 只拿到总和，丢失 cardId。

### Listener 约定

见 `docs/CUSTOM_CARD_SANDBOX.md` §5.5 / §5.6 / §5.7：

- `listeners[].actions:` 是 leaf actionId（`place-farmer` / `gain` / `collect` 等），不是行动空间 id
- `harvest-feed` 不是 listener 动作——喂食阶段开始时的收益用 `onStartHarvestFeedingPhase` effect hook
- Anytime = `phases: ['anytime']` listener，不用 `actions:` 字段；一次性能力用 `special-effect` 的 `set-flag` + `cardStates.flagged` 闸门
- `futureMeeplesNode` 没注入沙盒，手写 `params.__futureMeepleRequest` leaf
- `costs` 只用于简单行动费用；跨所有主要/次要改良候选的资源折扣用 `bonuses`，并设置 `capDiscountAtCost: true`、`optional: false`、`sources: [CARD_ID]`

## 加新 fixture

1. 读 `docs/CUSTOM_CARD_SANDBOX.md` 搞清题面能不能用现有沙盒机制做
2. 新建 `tests/llm-card-gen/fixtures/M<n>_<slug>.ts`，follow `M2_per-action-bonus.ts` 模板
3. 在 `tests/llm-card-gen/fixtures/index.ts` 注册导出
4. 先让旧 golden 或 known-bad 实现跑出预期红灯，确认断言能捕获机制漂移
5. 题面和断言只写在 fixture；浏览器输入由 fixtures 派生。用合成浏览器演练及同一份 `runner.test.ts` 验证生成源码。
6. 如修改正式准入矩阵，先更新决议；重新冻结实现后开始完整付费批次，保留旧失败记录，不覆盖历史 golden

## 历史

- 2026-04-23 套件初版（9 fixture，hook-level 断言：`invokeCustomCodeEffect` / `invokeCustomCodeListener` 验证 LLM 代码形状）
- 2026-04-24 重写到 session-driven：每个 fixture 真的装进 `GameSession` 里跑起来断 `state` / `interaction` / `scores`，能验"游戏中跑起来是否符合预期"而不是"编出来的 ActionFlow 是不是预期形状"
- 2026-08-04 扩展到 11 fixture；M11 固化改良费用的 mandatory capped bonus、替代费用和归还卡要求，并明确 replay → live → record → replay 流程
