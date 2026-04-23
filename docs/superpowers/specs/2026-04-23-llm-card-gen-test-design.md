# LLM 卡牌生成自动化测试 设计

> 状态：approved（2026-04-23 brainstorming）
> Worktree：`.worktree/llm-card-test` 分支 `design/llm-card-gen-test`

## 1. 背景与目标

工坊页 (`client/app/workshop/AiCardDesigner.tsx`) 用 LLM 把用户的卡牌描述
（如「打出时获得 3 木材」）生成可注册到 GameSession 的 TS 实现代码（`CARD_DEF`
+ `CARD_IMPL` 双常量）。当前 prompt 在 `client/services/llmPrompts.ts`，但**没
有任何自动化手段**判断「换了 prompt / 换了模型 / 提供商更新后，LLM 还能不能
生出可跑的实现」。

**目标**：写一组自动化测试，覆盖 9 个常见卡牌机制，每张测试卡：

1. 调一次 LLM（用统一 prompt + 统一 user message 描述这张卡的需求）
2. 拿 LLM 输出的 TS 代码，过 `validateAndCompileCustomCode`（AST + 编译）
3. 在 mock 的 2 人 `GameSession` 里注册这张卡 + 触发对应动作
4. 断言 `state` / `scores` / `log` 上的预期变化

**判定标准（最严档）**：以上 4 步全过 = 这张卡这次"过"。一次失败 = 这张卡
这次"不过"。CI 报告 9 张卡的 pass/fail，并保存每次的 LLM 原始输出。

**非目标**：

- 不卡 PR / push 的 CI（独立 workflow，仅 `workflow_dispatch` 手动触发）
- 不修改前端的 LLM 调用代码（`llmService.ts` 全在浏览器，绑 localStorage；
  测试自己用 Node `fetch` 直调 OpenAI 兼容 endpoint）
- 不为通过测试而把 prompt 改"宽松"——测试**就是 prompt 质量的尺**，跑不过
  就要改 prompt（或承认某机制目前 prompt 还覆盖不到，加示例改进）

## 2. 测试套：9 个机制

| # | Mechanic | 给 LLM 的请求要点（user message） | 主要验证点 |
|---|---|---|---|
| M1 | 打出 cost + 前置 + reward（合体） | "**类型: 小改良**；**打出费用: 1 wood**；**前置: 至少 3 张职业**；**效果: 打出时立即获得 3 木材和 1 食物**" | (a) 资源不够 / 职业 < 3 时不能打出（CARD_DEF 字段对）；(b) 满足条件时 cost 扣除；(c) reward 入袋 |
| M2 | per-action 触发 hook（after-take-wood） | "类型: 职业；效果: 你每次使用「取木材」行动时，额外获得 1 木材" | 占 wood 行动 → wood 比基线多 1 |
| M3 | 收获 feed 阶段 modifier | "类型: 小改良；效果: 收获的喂养阶段，每只羊只需要 0 食物" | 喂养完 food 不变 + 无 begging |
| M4 | 终局 VP（final-scoring hook） | "类型: 职业；效果: 局末，你每 2 头牛额外得 1 分" | breakdown 含 +2（4 cattle / 2 = 2） |
| M5 | 改建 cost discount（cost-modifier hook） | "类型: 小改良；效果: 改建房屋时，所需 stone/clay 减 2（最少 0）" | clay 余 = 初值 − (基线 − 2) |
| M6 | cardStates 局部计数 | "类型: 小改良；效果: 你每个工作回合开始时，第 1 个被取走的木材保留在原地（每回合最多 1 次）" | 同回合两次取木 → 第 1 次触发，第 2 次不触发 |
| M7 | anytime 主动能力（不消耗行动） | "类型: 小改良；效果: 任意时机，你可以支付 1 wood 换 2 food（每回合最多 3 次）" | 玩家间歇期 invoke anytime → wood -1 food +2 |
| M8 | 跨玩家触发（opponent-action listener） | "类型: 职业；效果: 当其他玩家打出任何小改良时，你获得 1 食物" | 对手打 minor → 你 food +1 |
| M9 | 未来回合派发资源（FutureMeeple + round-start） | "类型: 小改良；效果: 打出时，立即在接下来 3 个回合开始时各获得 1 wood" | round N+1/+2/+3 round-start → wood 各 +1 |

**为什么是这 9 个**：覆盖了 reward / triggered-hook / harvest / endgame /
modifier / cardState / anytime / cross-player / round-start 九个完全不同的
code path。每张测试卡专攻一类，互不重叠。

**预估**：9 卡 × 1 call = **9 次 LLM call**，gemini-3.1-pro-preview 单次估
5-15s，suite 约 2-5 min。本地 prompt 调优时按需重跑单卡。

## 3. 架构

```
┌─────────────────────────────────────────────────────────┐
│  pnpm test:llm（独立脚本，默认 CI 不跑）                 │
│                                                         │
│  for fixture in CARD_FIXTURES (9):                      │
│    out = callLLM(prompt + fixture.userMessage)          │
│      ↳ 429/5xx → sleep 60s → retry (max 3 次)           │
│    dump out → output/tmp/llm-card-gen/<id>.txt          │
│    code = extractCardCode(out)                          │
│    sess = await fixture.scenario(code, fixture.cardId)  │
│    await fixture.trigger(sess)                          │
│    result = fixture.assert(sess)                        │
│    expect(result.ok).toBe(true)  // per-card 1 个 it()  │
└─────────────────────────────────────────────────────────┘
        ▲
        │
┌───────┴──────────────────┐
│ import {                 │
│  CARD_DESIGNER_SYSTEM_   │
│  PROMPT                  │
│ } from 'client/services/ │
│   llmPrompts'            │
│ (vitest 走 vite 解析，    │
│  ?raw import 直接可用)    │
└──────────────────────────┘
```

**Workflow**：

```
.github/workflows/ci-llm-cards.yml
  on: workflow_dispatch (with model/provider inputs)
  job:
    secrets.MY_TEST_GEMINI_APIKEY → env GEMINI_API_KEY
    pnpm install
    pnpm run build:cards-manifest
    pnpm run test:llm
    on failure: upload output/tmp/llm-card-gen/ as artifact
```

## 4. 关键决策

1. **不复用 `client/services/llmService.ts`**——它绑浏览器 fetch + localStorage，
   Node 跑要 polyfill。测试自己写一个 minimal `tests/llm-card-gen/llm-client.ts`，
   只用 Node 原生 `fetch` 按 OpenAI 兼容格式调 chat completions。
2. **Prompt 直接 import 前端模块**——`CARD_DESIGNER_SYSTEM_PROMPT` 是普通 ES
   export；vitest 用 vite 做模块解析，原生支持 `?raw` import（用于内联
   `docs/community-card-examples.md`）。无需把 prompt 抽到 `shared/`（YAGNI）。
3. **测试就是 prompt 质量尺**——失败 = LLM 跟着当前 prompt 生不出能跑的代码 =
   prompt 需要改进。绝不为绿测试而放宽断言。
4. **Provider 可换**——`callLLM({ provider, model, ... })` 接口；env
   `LLM_TEST_PROVIDER` / `LLM_TEST_MODEL` 切换；workflow input 暴露给手动触发
   面板。后期加 OpenAI / Anthropic 只是 router 多一条 case。
5. **API key 全走 env**——本地从 `.env` 读 `MY_TEST_GEMINI_APIKEY`（用户已有）；
   CI 从 GH Secrets 注入到 `GEMINI_API_KEY` env var。脚本自己读 env，不依赖
   `.env` 文件存在。
6. **失败时不打包跑** —— 每张卡一个独立 `it()`；某张失败不影响其它继续跑，
   报告里能看到 9 张里失败哪几张。

## 5. 文件清单

| 文件 | 操作 | 责任 |
|---|---|---|
| `tests/llm-card-gen/llm-client.ts` | Create | minimal Node fetch client，OpenAI 兼容路由（gemini / openai 两 provider 起步），retry 60s × 3 |
| `tests/llm-card-gen/extract.ts` | Create | 从 LLM 响应里抠 `CARD_DEF` + `CARD_IMPL` 代码块（参考 `client/services/llmService.ts` 的 `extractCardFromResponse` 但要纯函数版） |
| `tests/llm-card-gen/session-helpers.ts` | Create | 复用 `server/__tests__/*-session.test.ts` 既有手段，包成 `freshSession` / `takeAction` / `advanceToRound` / `triggerEndgameScoring` / `invokeAnytime` / `advanceToHarvestFeed` |
| `tests/llm-card-gen/fixtures/types.ts` | Create | `CardFixture` 接口定义 |
| `tests/llm-card-gen/fixtures/M1_immediate-gain-with-cost-prereq.ts` | Create | M1 fixture |
| `tests/llm-card-gen/fixtures/M2_per-action-bonus.ts` | Create | M2 fixture |
| `tests/llm-card-gen/fixtures/M3_harvest-feed-modifier.ts` | Create | M3 fixture |
| `tests/llm-card-gen/fixtures/M4_endgame-vp.ts` | Create | M4 fixture |
| `tests/llm-card-gen/fixtures/M5_cost-reduction.ts` | Create | M5 fixture |
| `tests/llm-card-gen/fixtures/M6_cardstate-counter.ts` | Create | M6 fixture |
| `tests/llm-card-gen/fixtures/M7_anytime-ability.ts` | Create | M7 fixture |
| `tests/llm-card-gen/fixtures/M8_cross-player-trigger.ts` | Create | M8 fixture |
| `tests/llm-card-gen/fixtures/M9_future-meeple.ts` | Create | M9 fixture |
| `tests/llm-card-gen/fixtures/index.ts` | Create | 聚合所有 fixture export 成数组 |
| `tests/llm-card-gen/runner.test.ts` | Create | vitest 入口；遍历 fixtures，每张一个 `it()`；`describe.skipIf` 让缺 key 时整 suite 跳过 |
| `package.json` | Modify | 加 `"test:llm": "vitest run tests/llm-card-gen/runner.test.ts --testTimeout=120000"` |
| `vitest.config.ts` | Modify | `tests/llm-card-gen/**` 必须从 fast/slow project 的 include 里排除（避免被 `pnpm test:fast` 误抓） |
| `.github/workflows/ci-llm-cards.yml` | Create | `workflow_dispatch` only；secret 注入；artifact 上传 |
| `.env.example` | Modify | 加注释行 `# MY_TEST_GEMINI_APIKEY=<your-key>  # for tests/llm-card-gen` |

`output/tmp/llm-card-gen/` 是产物目录（每次跑写 `<fixture-id>.txt`），已在
`.gitignore`。

## 5.1 LLM client 接口

```ts
// tests/llm-card-gen/llm-client.ts
export type Provider = 'gemini' | 'openai'

export interface CallLLMOptions {
  provider: Provider
  model: string
  systemPrompt: string
  userMessage: string
  apiKey: string
  /** 单次请求超时 ms，默认 60_000 */
  timeoutMs?: number
  /** 遇 429/5xx 重试次数，默认 3 */
  maxRetries?: number
  /** 重试间隔 ms，默认 60_000 */
  retryDelayMs?: number
}

export async function callLLM(opts: CallLLMOptions): Promise<string>
```

Provider 路由：
- `gemini` → `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
- `openai` → `https://api.openai.com/v1/chat/completions`

请求 body 用 OpenAI 兼容 schema：

```json
{
  "model": "<MODEL>",
  "messages": [
    { "role": "system", "content": "<systemPrompt>" },
    { "role": "user", "content": "<userMessage>" }
  ],
  "temperature": 0.2,
  "stream": false
}
```

返回 `data.choices[0].message.content`。

Retry 策略：HTTP 429 / 500 / 502 / 503 / 504 → `await sleep(retryDelayMs)` →
重试，到达 `maxRetries` 后抛错。其它 4xx 立即抛。Network error / abort 也按
retry 处理。

## 5.2 Fixture 接口

```ts
// tests/llm-card-gen/fixtures/types.ts
import type { GameSession } from '../../../server/game/authoritative-session'

export interface CardFixture {
  /** 测试 ID，如 "M1-immediate-gain"，用作 it() 名 + dump 文件名 */
  id: string
  /** 注册到 GameSession 时用的 cardId（覆盖 LLM 自起的 ID） */
  cardId: string
  cardType: 'major' | 'minor' | 'occupation'
  /** 模拟用户在工坊里发给 LLM 的请求文本 */
  userMessage: string
  /**
   * 装载 LLM 输出的代码到一个干净的 GameSession，预置必要状态
   * （p1 起手资源、是否已打出、是否已到某 round 等）
   */
  scenario: (llmGeneratedCode: string, cardId: string) => Promise<GameSession>
  /** 触发卡牌效果的动作（占某 action / 推进 harvest / 跑 endgame scoring 等） */
  trigger: (session: GameSession) => Promise<void>
  /** 断言卡牌效果是否如预期生效 */
  assert: (session: GameSession) => { ok: boolean; reason?: string }
}
```

每张 fixture 文件 export `default` 一个 `CardFixture`。`fixtures/index.ts`
聚合：

```ts
import M1 from './M1_immediate-gain-with-cost-prereq'
// ...
export const fixtures: CardFixture[] = [M1, M2, M3, M4, M5, M6, M7, M8, M9]
```

## 5.3 cardId 重写

LLM 输出的 `CARD_DEF.id` 与 fixture 期望的 `cardId` 经常不一致（LLM 自起
名）。`session-helpers.ts` 的 `freshSession` 拿到 LLM 代码后，先用正则
（或 ts-AST）把 `CARD_DEF` 里的 id 字符串替换成 `fixture.cardId`，再调
`validateAndCompileCustomCode(rewritten, fixture.cardId)`。

## 6. 风险 & 边界

1. **Vitest 解析 `?raw` import**：vitest 用 vite 处理模块，原生支持
   `?raw`。但 server-side 测试可能没启用 client tsconfig。Plan 阶段会先写一
   个最小 spike：`tests/llm-card-gen/spike.test.ts` 直接 import
   `CARD_DESIGNER_SYSTEM_PROMPT` 看能不能跑。如果跑不通，备选方案是测试自己
   `fs.readFileSync` 读 `docs/community-card-examples.md` 拼出 prompt。

2. **GameSession 构造细节**：`server/__tests__/A87_StablePlanner-session.test.ts`
   等已有 254 个 session 测试，scenario / trigger / assert 三件套的实现细节
   照搬即可，不发明新机制。Plan 阶段每张 fixture 单独列出 scenario 步骤。

3. **LLM 不一定能全过**——这是 by design。M6 / M7 / M8 / M9 这几个重机制大概
   率第一次跑会失败。失败时 dump LLM 输出，根据输出**改 prompt**（加示例 / 加
   显式约束 / 加机制说明），不是放宽 fixture 断言。

4. **API rate limit**：Gemini free tier 默认 15 RPM。单次 suite 9 个 call
   sequential 跑，平均 ~5s 一个，足够余量。重试用 60s 间隔（保守）。

5. **CI Secret 设置**：用户需要在 repo Settings → Secrets and variables →
   Actions 里加 `MY_TEST_GEMINI_APIKEY` secret（值 = `.env` 里那个 key）。
   这一步 spec 里只声明，plan 里加一个 manual checklist 步骤提醒。

6. **未来 provider 扩展**：要加 OpenAI 测试，只需 `llm-client.ts` 加一条
   provider case + `process.env.OPENAI_API_KEY` 兜底。要加 Anthropic 因为不
   是 OpenAI 兼容格式，需要改请求 body schema——不在本 spec 范围。

## 7. 实施顺序（plan 会展开为具体 task）

1. spike：vitest 能否 import `CARD_DESIGNER_SYSTEM_PROMPT`（决定 prompt 获取
   方式）
2. `llm-client.ts` + `extract.ts`（基础设施，无依赖）
3. `session-helpers.ts`（包装现有 GameSession 接口）
4. `CardFixture` 接口 + 第 1 张 fixture (M1) + runner 跑通整链路
5. 跑 M1 一次（CI / 本地），观察 LLM 输出 + 断言结果。如失败，定位是 prompt
   问题还是 fixture 写错（这一步是 plan 阶段不可避的"prompt 调优 loop"）
6. 加完 M2-M9 fixtures
7. `package.json` script + `vitest.config.ts` 排除
8. `.github/workflows/ci-llm-cards.yml` + `.env.example` 注释
9. 在 GH 手动触发一次 ci-llm-cards，验证 secret 注入 + artifact 上传都对
