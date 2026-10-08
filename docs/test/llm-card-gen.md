# LLM Card-Gen 自动化测试套件

验证**LLM 生成的自定义卡代码**能否在真实 `GameSession` 里跑通既定场景。`pnpm test:llm` 只回放历史 golden 和确定性测试，不调用 LLM。正式模型准入通过 owner 本机的浏览器验收程序完成。

## 位置

```
tests/llm-card-gen/
├── runner.test.ts            # 只读历史 golden → 编译 → 跑 fixture.setup/scenario/assert
├── driver.ts                 # 驱动 GameSession action / choice / pending
├── session-helpers.ts        # buildSessionWithLLMCard / autoAdvanceRoundEnd / getBonusBreakdown 等
├── session-helpers.test.ts   # helpers 的行为回归（不调 LLM）
├── llm-client.ts             # 其他脚本的旧客户端；不用于卡牌模型准入
├── extract.ts / extract.test.ts   # 从 LLM 响应里抽 TS 代码块
├── acceptance/              # 固定题面、行为检查、浏览器入口、费用账本、合成演练数据
├── control/                 # 冻结的旧完整 prompt 及 SHA-256 清单
└── fixtures/
    ├── types.ts              # CardFixture = { setup, scenario, assert }
    ├── M1_immediate-gain-with-cost-prereq.ts  # minor + cost + prereq + onBuy gain
    ├── M2_per-action-bonus.ts                 # listener: forest after → wood+1
    ├── M3_harvest-feed-modifier.ts            # onStartHarvestFeedingPhase: food+1
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

历史 golden 回放和新验收检查均属于 `llm` project；普通 `pnpm test:fast` 不包含它们。CI 运行 `pnpm test:llm`，不会请求模型 API。

```bash
# 历史回放、17 场景行为检查、已知错误反例、费用账本测试
pnpm test:llm

# 重启专用本地运行环境；必须使用 test_ 开头的数据库 schema
LOCAL_ENV_FILE="$PWD/output/tmp/llm-runtime/local.env" ./restart-local.sh --players 2

# 完整 102 任务合成演练：真实浏览器、后端校验及 GameSession；模型和 GitHub 响应受控
pnpm test:llm:dry

# 正式验收：先确认模型身份和整个验收工作的付费预算；工作区必须已提交
pnpm test:llm:live --model <confirmed-model-id>

# 单场景付费诊断：单独标记、共用总预算，永远不能作为模型准入或替换正式失败样本
pnpm test:llm:live --model <confirmed-model-id> --diagnose M6-cardstate-counter

# 自定义本机入口；仍须是 localhost 或 127.0.0.1
pnpm test:llm:dry --base-url http://127.0.0.1:5913 --runtime-env output/tmp/llm-runtime/local.env

# 单张历史回放，不是新模型准入证据
pnpm exec vitest run --project llm tests/llm-card-gen/runner.test.ts -t 'M2-per-action-bonus'
```

`test:llm:record` 也是正式浏览器验收的别名，所有 live 批次都会保留原始完整源码；它不会覆盖 `recordings/` 的历史 golden。旧 runner 拒绝 `LLM_TEST_MODE=live` / `LLM_TEST_RECORD=1`，避免绕过浏览器传输与费用边界。图片 smoke 和翻译脚本继续使用各自独立入口，不属于卡牌能力验收。

专用 `--runtime-env` 只放本地服务与数据库配置，禁止写入 API key 或 GitHub token。本地后端可复用 Workshop App，或在启动进程环境中单独提供 `WORKSHOP_REFERENCE_GITHUB_TOKEN`；不要为此 source 含模型 key 的整个 `.env`。真实模型 key 从当前 worktree 或主 checkout 的已忽略 `.env` 中读取 `MY_TEST_DEEPSEEK_APIKEY` / `DEEPSEEK_API_KEY`，也可由同名环境变量提供。key 仅传入私有浏览器传输闭包；后端、GitHub、localStorage、HAR、trace 与结果文件均不接收它。Node 只运行测试和费用登记，不代发模型请求。

当前验收程序只支持已讨论的 DeepSeek HTTPS 端点。2026-10-08 核对[官方价格页](https://api-docs.deepseek.com/quick_start/pricing/)时，`deepseek-v4-flash` 已退役并转向 V4.1 Flash，正式请求名是 `deepseek-flash`。付费批次须明确选择请求名称，记录实际返回名称及官方服务说明，不能把旧别名当成旧模型的测量结果。价格按 V4.1 Flash 峰时价保守估算：每百万 token 的未缓存输入 $0.30、缓存输入 $0.006、输出 $1.20；报告明确标记估算而非账单，reasoning 用量不重复加到输出中。

## CI / Workflow

`.github/workflows/ci.yml` 只运行确定性的 `pnpm test:llm`，继续对普通提交自动执行。需要 LLM Token 的真实调用只允许在 owner 控制的本机运行，key 不进入 GitHub Actions；验收入口发现 `CI` 或 `GITHUB_ACTIONS` 环境标记时，会在读取配置、密钥和预约费用之前拒绝 `--live`。不使用 Token 的回放与合成模式不受此限制。产品准入表位于 `client/services/llm/generation/admission.ts`，测试注入入口不提供任何产品设置或 URL 绕过方式。

## Browser-tool acceptance

The [approved quality and cost decision](https://github.com/titanxxh/open-agricola/issues/1035) is implemented by `scripts/llm-acceptance.ts` and `tests/llm-card-gen/acceptance/`. Admission is per exact provider, endpoint and model, after a real browser tool roundtrip and the complete acceptance batch. The DeepSeek tuple in [completed paid acceptance](#completed-paid-acceptance) is admitted; all other combinations remain pending. Synthetic runs and historical golden replay do not qualify.

All paid probes, comparisons, failures, repairs and subsequent batches share a **US$20 total budget**, raised from US$5 by the [user's cumulative-budget amendment](https://github.com/titanxxh/open-agricola/issues/1035#issuecomment-6052008674). The persistent ledger keeps its original `<git-common-dir>/llm-acceptance-usd5.json` filename so every worktree shares the same history. The cap amendment changed only the active ledger's limit; earlier batch snapshots, reservations, settlements and unknown-usage holds remain intact. An exclusive `.lock` prevents concurrent writers. Each conservative reservation is atomically saved before the browser can issue its POST; interrupted or unreported usage keeps the full reservation. A new batch does not reset the ledger. There is no command-line budget override or automatic account top-up. If a process crashes, inspect the PID in its lock and the preserved reservations before removing a stale lock; do not delete or zero the ledger. Synthetic runs use a separate, explicitly labelled budget file in their own output directory.

Each run creates `output/tmp/llm-acceptance/<batch>/` containing the frozen manifest, per-task source/validation/behavior records, request accounting, reference SHAs/ranges, credential-destination checks, budget snapshot and final report. Visible final answers are retained even when their format is rejected: at most 64 KiB of UTF-8 text per answer, with its request sequence, full byte length, truncation flag and SHA-256 of the full text. Compact tool operations, HTTP outcomes/retries and successful read ranges remain available even when an attempt pauses; raw provider wire messages, reasoning and signatures remain page-memory-only. Files are local private test artifacts and are not committed automatically; public compact evidence includes their hashes, not answer text. The manifest freezes implementation hashes, prompt/control hashes, model and streaming limits, and actual deployed sandbox ID. It rejects edits during a run and requires a clean committed implementation for paid runs. Only the GitHub main reference may advance between new attempts, as required by the product contract.

The formal runner first verifies authenticated Workshop reference metadata from the browser, then performs one real browser tool roundtrip probe. GitHub credentials belong to the backend; the browser only sends its Workshop session cookie for metadata and reads pinned source text anonymously. The runner no longer reserves a whole batch against the anonymous REST quota. If the probe passes, it executes all declared scenarios in order, tools then control, for each repetition. A single-scenario diagnostic skips that probe and is never admissible. Quality failures remain in the batch and do not trigger Session-driven repair or a lucky retry. A lost transport, paused attempt, budget stop or source change yields an incomplete, non-admissible batch. No model POST is retried automatically. Changing the implementation or prompt requires a separately identified complete batch while retaining earlier failures and their costs.

The production loop's final response slot also applies in acceptance: the last model request of the current allowance retains tool definitions and sends `tool_choice: none`. A `reference-continuation` reply pauses for explicit user continuation; acceptance does not auto-extend the allowance and cannot count that task as a pass. Per-request accounting records the selected tool policy. Execution status is a separate host `system` message; provider messages, reasoning, signatures and tool groups are preserved.

The fixed matrix has **17 scenarios, three independent runs per scenario in each of two arms: 102 task runs per model**. It extends the 11 current mechanisms with:

| Scenario | Required evidence |
|---|---|
| Combined reward and persistent counter | Own forest collection grants one food; every third trigger grants one point. Check each delta, cross-round counting, source events/logs, and non-triggering opponents/actions. |
| Follow-up on the selected candidate | Adopted A, selected B and chat C differ. Change B's improvement discount from one wood to two, preserving its on-play reward and metadata; verify real payment and discount bounds. |
| Repair of the actually tested source | Repair B's unavailable `futureMeeplesNode` call while C is selected. Keep the reward delayed until next round, grant exactly one wood once, and preserve unrelated work. |
| Actual sandbox capability gap | Building a special stable on a grain-bearing field while retaining crops and normal payment/supply use requires an unavailable candidate/settlement pair. Explain the gap without an adoptable substitute. |
| Two English paraphrases | Restate M2 and M11 without API hints; use the same behavior assertions as their Chinese versions. |

New-architecture admission requires **48/48 implementable runs passing behavior checks and 3/3 correct capability-gap results**. Report first-output and final pass rates separately; final output may include at most two production static-validation repairs. A partial batch does not qualify. Preserve every failure; a changed prompt or implementation starts a separately identified batch instead of replacing failed samples with lucky retries. A finite passing batch does not establish a universal success rate.

Both arms use the same browser transport, model settings, request inputs, extraction and authoritative validation. The control uses the frozen old full prompt with the same two static repairs, explicitly labelled **old prompt plus shared repair**, not the behavior of the current UI. Session assertion failures never become repair hints. Keep source and metadata unchanged by test helpers; human-edited results are reported separately. Each fresh two-player Session has explicit hands, successful commands, intentional pending choices and state/interaction/log/scores assertions. M4 checks final scoring, M6 intermediate counters, M7 reuse after replenishing wood, and M9 actual delayed delivery and cleanup.

Each new-arm run retains the eight-model-request, 24-tool-call and five-minute limits; the control permits at most three model requests. The formal batch therefore permits at most **561 model requests**, with any preliminary probes counted separately against the same monetary budget. Record requested/returned model identity, prompt/tool/sandbox versions, actual reference SHAs and ranges, configured response/context limits, every request and retry, token usage including reasoning/cache fields when available, elapsed time and cost basis. Missing usage remains unknown. Freeze these settings and the assertions before a batch; reference reads still obey each attempt's latest-main contract.

Deterministic protocol replay and browser E2E cover reference versions and failures, complete tool groups/signatures, exact budget boundaries, cancellation/late responses, candidate/source binding, recovery/adoption/privacy, manual playtest repair and translation regressions. Check real browser request destinations: only the configured LLM provider receives its credential. Test artifacts use synthetic or test-owned inputs, exclude credentials, and do not broaden production's page-memory-only raw protocol contract. Detailed scenarios and reporting requirements live in the decision record. The Chinese and English editor E2Es exercise the shipped DeepSeek admission entry with controlled responses; other-provider fixtures remain test-only and cannot grant product admission.

### Completed paid acceptance

On 2026-10-08 (UTC+8), batch `live-2026-10-08T02-36-54-220Z-63fdc5e6` completed all 102 planned runs against clean implementation `82b84960f771861e6c6e69c7bb0aa81f775e3e95`, prompt `workshop-browser-tools-v8` and tools `github-text-v4`. The [resolution evidence](https://github.com/titanxxh/open-agricola/issues/1041#issuecomment-6051299853) and [compact evidence artifact](../../tests/llm-card-gen/acceptance/evidence/deepseek-flash-2026-10-08.json) retain exact settings, deployed sandbox identity, per-scenario counts, earlier failures, accounting and hashes of the original local artifacts.

The admitted request is exactly **`deepseek` / `https://api.deepseek.com/v1/chat/completions` / `deepseek-flash`**. Observed returned model names were `deepseek-flash`. This batch measures the canonical V4.1 Flash request name. The old `deepseek-v4-flash` forwarding alias, Pro, OpenRouter and custom endpoints remain unadmitted. [Earlier v5 alias evidence](../../tests/llm-card-gen/acceptance/evidence/deepseek-v4-flash-2026-10-08.json) is retained as history and does not replace this final batch.

| Formal-arm measurement | Browser tools | Old full prompt + shared static repair |
|---|---:|---:|
| First / final passes | 51/51 / 51/51 | 47/51 / 47/51 |
| Source behavior passes | 48/48 | 47/48 |
| Correct capability gaps | 3/3 | 0/3 |
| Static repairs | 0 | 1 |
| Model POSTs | 244 | 52 |
| Input / output tokens | 3,606,089 / 185,063 | 556,320 / 96,234 |
| Median / P95 active time | 14.260 s / 39.870 s | 5.921 s / 26.537 s |
| Estimated cost | $0.472912476 | $0.122222064 |

The new arm passed the quality gate in this finite, open-book matrix. Every control failure remains in the linked report. No Session assertion failures were used as repair hints, no failed slots were replaced, and no attempt received extra allowance. Registering evidence and the exact admission tuple does not change the frozen generation behavior.

The separate real-browser probe passed in 4 POSTs with 0 repairs, costing an estimated $0.006316392. The browser verified 556 earlier assistant-message comparisons and 555 complete-tool-group comparisons, preserving observed protocol fields without publishing raw reasoning or provider message bodies. Each of the 52 new-arm attempts, including the probe, resolved current main independently through the authenticated Workshop metadata interface using project GitHub credentials. Source bodies were read anonymously by the browser at the pinned SHA and checked against Git blob hashes. Only the model endpoint received the user's LLM credential.

At the close of that v8 batch, the complete effort used 1,893 request reservations across probes, failed batches, diagnostics and controls: **$3.819276504 estimated known cost + $0.105475800 still reserved for earlier unknown usage = $3.924752304 of the $5 limit**. Its frozen snapshot had $1.075247696 remaining; later batches and the authorized cumulative cap amendment preserve this historical record. These are conservative peak-rate estimates, not invoices. Earlier failures and interrupted batches remain in the evidence history and local artifacts; the ledger was not reset.

### Control and behavior checks

The complete old prompt is frozen in `tests/llm-card-gen/control/full-prompt.txt`; its manifest records rendered bytes, SHA-256, source commit and dependency hashes. This is a test-only control, not a product fallback. New fixture setup preserves generated source and authoritative CARD_DEF metadata. The explicitly named `historicalRecording` option retains identity/metadata adaptation only for historical golden regression; those results are not model-admission evidence.

The driver rejects failed commands and requires explicit nontrivial choices. Fixtures use placeholder hands. M4 checks authoritative final scoring across multiple cattle counts; M6 checks intermediate counts including the fishing negative; M7 replenishes wood before checking the once-only gate; M9 checks exact delayed delivery, cleanup and no repeat. M10 uses a two-player session with an explicitly prepared Traveling Players resource source for its payment-provider test. Known-bad recording mutations exercise these oracles independently of live generation.

The production browser path and all 17 scenario oracles are implemented. A 102-task synthetic browser run exercises original-source validation, exact two-repair behavior, both prompts and all Session assertions. Its result is always labelled synthetic and cannot open a model; paid admission remains a separate gate.

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
5. 在 `acceptance/inputs.ts` / `behavior.ts` 登记题面和行为断言，先用合成浏览器演练验证测试本身
6. 如修改正式准入矩阵，先更新决议；重新冻结实现后开始完整付费批次，保留旧失败记录，不覆盖历史 golden

## 历史

- 2026-04-23 套件初版（9 fixture，hook-level 断言：`invokeCustomCodeEffect` / `invokeCustomCodeListener` 验证 LLM 代码形状）
- 2026-04-24 重写到 session-driven：每个 fixture 真的装进 `GameSession` 里跑起来断 `state` / `interaction` / `scores`，能验"游戏中跑起来是否符合预期"而不是"编出来的 ActionFlow 是不是预期形状"
- 2026-08-04 扩展到 11 fixture；M11 固化改良费用的 mandatory capped bonus、替代费用和归还卡要求，并明确 replay → live → record → replay 流程
