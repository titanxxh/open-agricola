# LLM Card-Gen 自动化测试套件

验证**LLM 生成的自定义卡代码**能否在真实 `GameSession` 里跑通既定场景。不是普通单元测试——每跑一次都会真的调 LLM 生成代码，成本与网络都有。

## 位置

```
tests/llm-card-gen/
├── runner.test.ts            # 逐个 fixture 调 LLM → 编译 → 跑 fixture.setup/trigger/assert
├── session-helpers.ts        # buildSessionWithLLMCard / autoAdvanceRoundEnd / getBonusBreakdown 等
├── session-helpers.test.ts   # helpers 自身的 smoke（不调 LLM）
├── llm-client.ts             # Gemini / OpenAI 兼容包装
├── extract.ts / extract.test.ts   # 从 LLM 响应里抽 TS 代码块
└── fixtures/
    ├── types.ts              # CardFixture = { setup, trigger, assert }
    ├── M1_immediate-gain-with-cost-prereq.ts  # minor + cost + prereq + onBuy gain
    ├── M2_per-action-bonus.ts                 # listener: forest after → wood+1
    ├── M3_harvest-feed-modifier.ts            # onHarvest: food+1
    ├── M4_endgame-vp.ts                       # computeBonusScore: 每 2 牛 1 分
    ├── M5_cost-reduction.ts                   # computeCosts: wish-children-growth -1 food
    ├── M6_cardstate-counter.ts                # cardStates counter（write-card-extra-data）
    ├── M7_anytime-ability.ts                  # anytime: 2 wood → 3 food 一次性
    ├── M8_cross-player-trigger.ts             # scope:'any' listener cross-player gain
    └── M9_future-meeple.ts                    # onBuy: futureMeeplesNode
```

## 运行

默认 CI / 本地跑**不**触发 LLM 套件——需要显式选 project。

```bash
# 1. 需要 Gemini API key（.env 里 MY_TEST_GEMINI_APIKEY）
export GEMINI_API_KEY="$(grep '^MY_TEST_GEMINI_APIKEY=' .env | cut -d= -f2-)"

# 2. 全量 9 fixture（~110s）
pnpm test:llm

# 单跑一张
pnpm exec vitest run --project llm tests/llm-card-gen/runner.test.ts -t 'M2-per-action-bonus'

# 只跑 helper smoke（不调 LLM，~5s）
pnpm exec vitest run --project llm tests/llm-card-gen/session-helpers.test.ts

# 切换 provider / model
LLM_TEST_PROVIDER=openai LLM_TEST_MODEL=gpt-4.1 OPENAI_API_KEY=... pnpm test:llm
```

默认 provider=`gemini`、model=`gemini-3.1-pro-preview`。每次跑会把原始 LLM 响应写到 `output/tmp/llm-card-gen/<fixture-id>.txt`，失败时优先看这个文件。

## CI

工作流：`.github/workflows/ci-llm-cards.yml`，`workflow_dispatch` 手动触发（不在 push / PR 自动跑，避免 API key 消耗）。

触发方式：

```bash
GH_TOKEN="$(grep '^GH_TOKEN=' .env | cut -d= -f2-)"
curl -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/ci-llm-cards.yml/dispatches \
  -d '{"ref":"<branch-name>"}'
```

## Fixture 三段式

```ts
interface CardFixture {
  id: string
  cardId: string
  cardType: 'minor' | 'occupation'
  userMessage: string          // 喂给 LLM 的题面

  // 编译 LLM 代码 → 构造 GameSession → mutate 初始状态
  setup: (llmCode) => { session, ctx }

  // 驱动场景（takeAction / resolveChoice / performRoundEnd / …）
  trigger: (session, ctx) => TriggerResult

  // 断言 state / pending / scores
  assert: (session, ctx, result) => FixtureResult
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

连续 `takeAction` 之间可能进 `confirmNextPlayer` pending（比如轮到对手但对手没工人）。fixture trigger 内循环处理：

```ts
if (resp.pending.type === 'confirmNextPlayer') resp = session.confirmNextPlayer()
```

单回合内同一玩家多次 action 还需要：

```ts
setWorkersAtHome(state, p0, N)       // 有 N 个在家
setActiveWorkerCount(p0, N)          // 活跃 N 个（家庭规模 ≥ N）
setActiveWorkerCount(p1, 0)          // 对手零工人，避免轮转
```

### 末回合 scoring（M4 模式）

`autoAdvanceRoundEnd(session, { maxIterations })` helper 把 `performRoundEnd` / `confirmHarvestFeed` / `confirmAnimalReorg` / `confirmNextPlayer` / `confirmPlayerSwitch` pendings 全消化到 `gameOver`。**会自动把 supply 里的动物放到 pasture/house/stable**（贪心 greedy），保证 `cattle` / `sheep` / `boar` 不被丢失。

读 per-card bonus VP 要用 `getBonusBreakdownForSession(session, playerIndex)`（wraps `collectBonusScores` in `withCtx`）——直接跑 `computeScores(state).categories.cardStateBonusVp` 只拿到总和，丢失 cardId。

### Listener 约定

见 `docs/CUSTOM_CARD_SANDBOX.md` §5.5 / §5.6 / §5.7：

- `listeners[].actions:` 是 leaf actionId（`place-farmer` / `gain` / `collect` 等），不是行动空间 id
- `harvest-feed` 不是 listener 动作——用 `onHarvest` effect hook
- Anytime = `phases: ['anytime']` listener，不用 `actions:` 字段，一次性用 `flag-card` + `cardStates.flagged` 闸门
- `futureMeeplesNode` 没注入沙盒，手写 `params.__futureMeepleRequest` leaf

## 加新 fixture

1. 读 `docs/CUSTOM_CARD_SANDBOX.md` 搞清题面能不能用现有沙盒机制做
2. 新建 `tests/llm-card-gen/fixtures/M<n>_<slug>.ts`，follow `M2_per-action-bonus.ts` 模板
3. 在 `tests/llm-card-gen/fixtures/index.ts` 注册导出
4. 先手写一份 known-good `CARD_DEF` + `CARD_IMPL` 字符串，本地跑 `fixture.setup/trigger/assert` 确认 fixture 机制本身对
5. 用真 LLM 跑一次（`pnpm exec vitest run --project llm -t M<n>`），看 dump
6. 必要时收紧 `userMessage`，重复 2 次为止；超过就在 fixture 顶放 `// FIXME:` 加注说明并提交，不要死磕

## 历史

- 2026-04-23 套件初版（9 fixture，hook-level 断言：`invokeCustomCodeEffect` / `invokeCustomCodeListener` 验证 LLM 代码形状）
- 2026-04-24 重写到 session-driven：每个 fixture 真的装进 `GameSession` 里跑起来断 `state` / `pending` / `scores`，能验"游戏中跑起来是否符合预期"而不是"编出来的 ActionFlow 是不是预期形状"
