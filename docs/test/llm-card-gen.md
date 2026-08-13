# LLM Card-Gen 自动化测试套件

验证**LLM 生成的自定义卡代码**能否在真实 `GameSession` 里跑通既定场景。默认 `record` 模式回放已提交的 golden，不调用 LLM；只有 `live` 或设置 `LLM_TEST_RECORD=1` 的刷新流程会调用外部模型。

## 位置

```
tests/llm-card-gen/
├── runner.test.ts            # 读取 golden 或调用 LLM → 编译 → 跑 fixture.setup/scenario/assert
├── driver.ts                 # 驱动 GameSession action / choice / pending
├── session-helpers.ts        # buildSessionWithLLMCard / autoAdvanceRoundEnd / getBonusBreakdown 等
├── session-helpers.test.ts   # helpers 自身的 smoke（不调 LLM）
├── llm-client.ts             # Gemini / OpenAI / OpenRouter / DeepSeek / AiHubMix 兼容包装
├── extract.ts / extract.test.ts   # 从 LLM 响应里抽 TS 代码块
└── fixtures/
    ├── types.ts              # CardFixture = { setup, scenario, assert }
    ├── M1_immediate-gain-with-cost-prereq.ts  # minor + cost + prereq + onBuy gain
    ├── M2_per-action-bonus.ts                 # listener: forest after → wood+1
    ├── M3_harvest-feed-modifier.ts            # onHarvest: food+1
    ├── M4_endgame-vp.ts                       # computeBonusScore: 每 2 牛 1 分
    ├── M5_cost-reduction.ts                   # computeCosts: renovate-house -1 reed
    ├── M6_cardstate-counter.ts                # cardStates counter（special-effect）
    ├── M7_anytime-ability.ts                  # anytime: 2 wood → 3 food 一次性
    ├── M8_cross-player-trigger.ts             # scope:'any' listener cross-player gain
    ├── M9_future-meeple.ts                    # onBuy: future-meeples leaf
    ├── M10_payment-resource-provider.ts       # paymentResourceProviders 虚拟支付资源
    └── M11_improvement-cost-reduction.ts      # 改良 mandatory capped bonus + ComplexCost
```

## 运行

普通 `pnpm test:fast` 不包含该 project；CI 另行执行确定性的 golden 回放。

```bash
# 1. 默认代码生成使用 DeepSeek；API key 可直接放在 .env 的 MY_TEST_DEEPSEEK_APIKEY
export LLM_TEST_CODE_PROVIDER=deepseek
export LLM_TEST_CODE_MODEL=deepseek-v4-flash

# 2. 全量 11 fixture golden 回放（确定性，不调 API）
pnpm test:llm

# 单跑一张 golden
pnpm exec vitest run --project llm tests/llm-card-gen/runner.test.ts -t 'M2-per-action-bonus'

# 全量实时健康检查
pnpm test:llm:live

# 单张实时检查；不要把 -t 放到 pnpm script 的 -- 后面
LLM_TEST_MODE=live pnpm exec vitest run --project llm tests/llm-card-gen/runner.test.ts -t 'M11-improvement-cost-reduction'

# 单张确认通过后刷新 golden
LLM_TEST_MODE=live LLM_TEST_RECORD=1 pnpm exec vitest run --project llm tests/llm-card-gen/runner.test.ts -t 'M11-improvement-cost-reduction'

# 只跑 helper smoke（不调 LLM，~5s）
pnpm exec vitest run --project llm tests/llm-card-gen/session-helpers.test.ts

# 单独跑 Gemini 图片生成 smoke（2 个真实卡牌 case：1 张职业 + 1 张小改良）
pnpm run smoke:gemini:image

# 切换 provider / model（示例：AiHubMix 免费代码模型）
LLM_TEST_CODE_PROVIDER=aihubmix \
LLM_TEST_CODE_MODEL=coding-glm-5.1-free \
AIHUBMIX_API_KEY=... \
pnpm test:llm:live
```

实时代码生成默认 provider=`deepseek`、model=`deepseek-v4-flash`。三种模式都会把本次使用的响应写到 `output/tmp/llm-card-gen/<fixture-id>.txt`，失败时优先看这个文件。

环境变量按用途拆分，避免代码模型和图片模型混用：


| 用途     | Provider env              | Model env              | 默认                                                 |
| ------ | ------------------------- | ---------------------- | -------------------------------------------------- |
| 卡牌代码生成 | `LLM_TEST_CODE_PROVIDER`  | `LLM_TEST_CODE_MODEL`  | `deepseek` / `deepseek-v4-flash`                   |
| 卡牌图片生成 | `LLM_TEST_IMAGE_PROVIDER` | `LLM_TEST_IMAGE_MODEL` | `gemini` / `gemini-2.5-flash-image`                |


当前 `tests/llm-card-gen/runner.test.ts` 只做代码生成，不调用图片模型。

支持的代码生成 provider（用于 `LLM_TEST_CODE_PROVIDER`）：


| Provider     | Chat completions endpoint                                                  | API key 环境变量                                       |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------------- |
| `gemini`     | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `GEMINI_API_KEY` 或 `MY_TEST_GEMINI_APIKEY`         |
| `openai`     | `https://api.openai.com/v1/chat/completions`                               | `OPENAI_API_KEY` 或 `MY_TEST_OPENAI_APIKEY`         |
| `openrouter` | `https://openrouter.ai/api/v1/chat/completions`                            | `OPENROUTER_API_KEY` 或 `MY_TEST_OPENROUTER_APIKEY` |
| `deepseek`   | `https://api.deepseek.com/v1/chat/completions`                             | `DEEPSEEK_API_KEY` 或 `MY_TEST_DEEPSEEK_APIKEY`     |
| `aihubmix`   | `https://aihubmix.com/v1/chat/completions`                                 | `AIHUBMIX_API_KEY` 或 `MY_TEST_AIHUBMIX_APIKEY`     |


`LLM_TEST_CODE_MODEL` / `LLM_TEST_IMAGE_MODEL` 不做白名单校验，直接透传给 provider，便于临时验证新模型。

## CI / Workflow

`.github/workflows/ci.yml` 只运行确定性的 `pnpm test:llm` golden 回放。真实调用外部 LLM 的健康检查仅在 owner 控制的本机运行 `pnpm test:llm:live`，API key 从已忽略的本地 `.env` 读取，不进入 GitHub Actions。

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

### 不要调 `loadState`

`session.loadState(state)` 会走 `normalizeState` → 任意 hand 为空就**重新发牌**，把 `clearAllHands` 效果抹掉。`buildSessionWithLLMCard` 返回后直接 mutate `session.getState().state`（live reference）即可。

### 多步骤行动

连续 `takeAction` 之间可能进入 `interaction.request.kind === 'confirm-next-player'`（比如轮到对手但对手没工人）。优先使用 `Driver.takeAction()` 自动 drain；只有必须观察中间 pending 时才用 `takeActionRaw()` / `resolveChoiceRaw()`。

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
- `harvest-feed` 不是 listener 动作——用 `onHarvest` effect hook
- Anytime = `phases: ['anytime']` listener，不用 `actions:` 字段；一次性能力用 `special-effect` 的 `set-flag` + `cardStates.flagged` 闸门
- `futureMeeplesNode` 没注入沙盒，手写 `params.__futureMeepleRequest` leaf
- `costs` 只用于简单行动费用；跨所有主要/次要改良候选的资源折扣用 `bonuses`，并设置 `capDiscountAtCost: true`、`optional: false`、`sources: [CARD_ID]`

## 加新 fixture

1. 读 `docs/CUSTOM_CARD_SANDBOX.md` 搞清题面能不能用现有沙盒机制做
2. 新建 `tests/llm-card-gen/fixtures/M<n>_<slug>.ts`，follow `M2_per-action-bonus.ts` 模板
3. 在 `tests/llm-card-gen/fixtures/index.ts` 注册导出
4. 先让旧 golden 或 known-bad 实现跑出预期红灯，确认断言能捕获机制漂移
5. 用 `LLM_TEST_MODE=live` 单跑一次并 review `output/tmp/llm-card-gen/`
6. live 通过后用 `LLM_TEST_RECORD=1` 刷新 golden，再用默认 `pnpm test:llm` 回放

## 历史

- 2026-04-23 套件初版（9 fixture，hook-level 断言：`invokeCustomCodeEffect` / `invokeCustomCodeListener` 验证 LLM 代码形状）
- 2026-04-24 重写到 session-driven：每个 fixture 真的装进 `GameSession` 里跑起来断 `state` / `interaction` / `scores`，能验"游戏中跑起来是否符合预期"而不是"编出来的 ActionFlow 是不是预期形状"
- 2026-08-04 扩展到 11 fixture；M11 固化改良费用的 mandatory capped bonus、替代费用和归还卡要求，并明确 replay → live → record → replay 流程
