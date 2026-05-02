# D3 — HarvestFeedOption 统一走 sourceId+exchangeIndex 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 harvest feed selection 协议从双轨（resourceKey/food + exchangeIndex）收敛到单一路径（sourceId + exchangeIndex），所有 selection 都引用 `CardExchange`，包含合成的 basic conversion。

**Architecture:** 加新路径 → 切换来源 → 删旧路径，三阶段 9 task 完成。新增 `shared/cards/basic-conversion.ts` 注册合成 `CardExchange`，扩展 server lookupExchange 与 trigger 校验，重写 `buildHarvestFeedOptions` 与 UI counter 上限计算，删除 protocol/server/test 中的 legacy 字段。

**Tech Stack:** TypeScript / pnpm workspace / vitest（fast + slow project）/ Playwright e2e / 前端 React + Vite，后端 Node WS+HTTP。

**Spec:** `docs/superpowers/specs/2026-05-02-D3-harvest-exchange-index-design.md`

---

## File Structure

| 文件 | 责任 | 阶段 |
|---|---|---|
| `shared/cards/basic-conversion.ts` (新增) | 合成 `__basic__` sourceId 的两条 `CardExchange` 与 lookup 函数 | Task 1 |
| `shared/cards/__tests__/basic-conversion.test.ts` (新增) | basic-conversion 单元测试 | Task 1 |
| `shared/session/game-core.ts` | server `confirmHarvestFeed` 逻辑：lookupExchange basic 分支、删 trigger=harvest 校验、删 legacy 单 key 分支 | Task 2 / Task 6 |
| `server/__tests__/harvest-session.test.ts` | server 端三个新用例（D60 / B104 / basic）+ 现有 codemod | Task 2 / Task 7 |
| `client/app/hooks/use-harvest-flow.ts` | `buildHarvestFeedOptions` 重写 + `HarvestFeedOption` 类型修订 | Task 3 / Task 5 |
| `client/app/hooks/__tests__/use-harvest-flow.test.ts` (新增) | `buildHarvestFeedOptions` 单元测试 | Task 3 |
| `client/app/hooks/use-harvest-feed-counter.ts` (新增) | UI counter 多 key 上限 helper | Task 4 |
| `client/app/hooks/__tests__/use-harvest-feed-counter.test.ts` (新增) | counter helper 单测 | Task 4 |
| `client/app/GameContainerApi.tsx` | UI counter 用 helper 取代 line 879-892, 935, 1542-1556 单 key 计算 | Task 4 / Task 5 |
| `shared/protocol/ws.ts` | 协议字段：删 resourceKey/food，留 sourceId/exchangeIndex/count/sourceName | Task 5 |
| `client/services/gameTransport.ts` | `confirmFeed` selection 类型同步 | Task 5 |
| `server/__tests__/C59_SchnappsDistillery-session.test.ts` | codemod | Task 7 |
| `server/__tests__/C105_BasketCarrier-session.test.ts` | codemod | Task 7 |
| `server/__tests__/E153_StoneSculptor-session.test.ts` | codemod | Task 7 |
| `e2e-tests/D3-harvest-feed-options.spec.ts` (新增) | Playwright 三用例 | Task 8 |
| `docs/master-plan.md` | §8 sprint D3 行 | Task 9 |

---

## Task 1：basic-conversion 模块

**Files:**
- Create: `shared/cards/basic-conversion.ts`
- Test: `shared/cards/__tests__/basic-conversion.test.ts`

- [ ] **Step 1: 写失败的单元测试**

`shared/cards/__tests__/basic-conversion.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  BASIC_CONVERSION_SOURCE_ID,
  basicConversionExchanges,
  getBasicConversionExchange,
} from '../basic-conversion'

describe('basic conversion exchanges', () => {
  it('exposes the synthetic source id "__basic__"', () => {
    expect(BASIC_CONVERSION_SOURCE_ID).toBe('__basic__')
  })

  it('registers grain->food at index 0 and vegetable->food at index 1', () => {
    expect(basicConversionExchanges).toHaveLength(2)
    expect(basicConversionExchanges[0]).toMatchObject({
      from: { grain: 1 },
      to: { food: 1 },
      triggers: ['anytime'],
      sourceId: '__basic__',
    })
    expect(basicConversionExchanges[1]).toMatchObject({
      from: { vegetable: 1 },
      to: { food: 1 },
      triggers: ['anytime'],
      sourceId: '__basic__',
    })
  })

  it('lookup by index returns the matching exchange', () => {
    expect(getBasicConversionExchange(0)?.from).toEqual({ grain: 1 })
    expect(getBasicConversionExchange(1)?.from).toEqual({ vegetable: 1 })
    expect(getBasicConversionExchange(2)).toBeUndefined()
    expect(getBasicConversionExchange(-1)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm exec vitest run shared/cards/__tests__/basic-conversion.test.ts
```

预期：测试 fail，原因 `Cannot find module '../basic-conversion'`。

- [ ] **Step 3: 实现模块**

`shared/cards/basic-conversion.ts`：

```ts
import type { CardExchange } from './types'

export const BASIC_CONVERSION_SOURCE_ID = '__basic__'

export const basicConversionExchanges: readonly CardExchange[] = [
  {
    from: { grain: 1 },
    to: { food: 1 },
    triggers: ['anytime'],
    sourceId: BASIC_CONVERSION_SOURCE_ID,
  },
  {
    from: { vegetable: 1 },
    to: { food: 1 },
    triggers: ['anytime'],
    sourceId: BASIC_CONVERSION_SOURCE_ID,
  },
]

export const getBasicConversionExchange = (idx: number): CardExchange | undefined => {
  if (!Number.isInteger(idx) || idx < 0) return undefined
  return basicConversionExchanges[idx]
}
```

- [ ] **Step 4: 跑测试确认 pass**

```bash
pnpm exec vitest run shared/cards/__tests__/basic-conversion.test.ts
```

预期：3 tests pass。

- [ ] **Step 5: Commit**

```bash
git add shared/cards/basic-conversion.ts shared/cards/__tests__/basic-conversion.test.ts
git commit -m "feat(D3): add basic-conversion module with synthetic __basic__ source

Registers grain->food (idx 0) and vegetable->food (idx 1) as
CardExchange entries under sourceId '__basic__' so harvest feed
selections can reference them via sourceId+exchangeIndex like any other
card exchange."
```

---

## Task 2：server lookupExchange + 接受 anytime trigger（加新路径）

**Files:**
- Modify: `shared/session/game-core.ts:2263-2302`（lookupCard + cappedSelections trigger 校验）
- Test: `server/__tests__/harvest-session.test.ts`（追加 3 个用例）

- [ ] **Step 1: 在 harvest-session.test.ts 末尾追加 3 个失败的 session 用例**

打开 `server/__tests__/harvest-session.test.ts`，在最后一个 `it(...)` 之后、`describe` 闭合 `})` 之前追加：

```ts
  it('basic conversion via sourceId="__basic__" idx=0 converts grain to food', async () => {
    const session = await buildHarvestSession({
      // 复用 fileTop 的 buildHarvestSession helper；如不存在则参考其它测试中的 dev-mode harvest pending 构造
      seed: 1,
      players: [
        { name: 'p1', resources: { grain: 2, food: 0 } },
        { name: 'p2' },
      ],
      forceFeedRequired: 3,
    })
    const resp = session.confirmHarvestFeed(0, [
      { sourceId: '__basic__', exchangeIndex: 0, count: 2 },
    ])
    expect(resp.ok).toBe(true)
    const p1 = resp.state!.players[0]!
    expect(p1.resources.grain).toBe(0)
    expect(p1.resources.food).toBe(0) // 2 grain -> 2 food, then consumed by 3-food feed (1 begging)
    expect(p1.resources.begging).toBe(1)
  })

  it('anytime exchange (D60 LargePottery clay->food) usable in harvest feed', async () => {
    const session = await buildHarvestSession({
      seed: 1,
      players: [
        {
          name: 'p1',
          resources: { clay: 2, food: 0 },
          improvements: ['Major_LargePottery'], // D60 是 Major; 若 ID 不同请校对
        },
        { name: 'p2' },
      ],
      forceFeedRequired: 2,
    })
    const resp = session.confirmHarvestFeed(0, [
      { sourceId: 'Major_LargePottery', exchangeIndex: 0, count: 1 },
    ])
    expect(resp.ok).toBe(true)
    const p1 = resp.state!.players[0]!
    expect(p1.resources.clay).toBe(1)
    expect(p1.resources.food).toBe(0) // clay 1 -> food 2, 全部消费
    expect(p1.resources.begging).toBe(0)
  })

  it('anytime non-cookery exchange (B104 SheepWalker sheep->stone) usable in feed', async () => {
    const session = await buildHarvestSession({
      seed: 1,
      players: [
        {
          name: 'p1',
          resources: { sheep: 2, stone: 0, food: 0 },
          minorPlayed: ['B104_SheepWalker'],
        },
        { name: 'p2' },
      ],
      forceFeedRequired: 2,
    })
    // SheepWalker exchanges: idx 0 sheep->boar, idx 1 sheep->vegetable, idx 2 sheep->stone
    // 测 sheep->stone（非食物输出，feed 阶段允许但不抵消缺口）
    const resp = session.confirmHarvestFeed(0, [
      { sourceId: 'B104_SheepWalker', exchangeIndex: 2, count: 1 },
    ])
    expect(resp.ok).toBe(true)
    const p1 = resp.state!.players[0]!
    expect(p1.resources.sheep).toBe(1)
    expect(p1.resources.stone).toBe(1)
    expect(p1.resources.begging).toBe(2) // 完全没产食物
  })
```

> 提示：如 `buildHarvestSession` 在该文件不存在，参照该文件首部其它测试中构造 `GameSession` + dev set resources + 跳到 round 4 进入 feed pending 的现有套路自行实现 fixture。`Major_LargePottery` 和 `B104_SheepWalker` 的实际 ID 请用 `grep -rn "LargePottery\|SheepWalker" shared/cards/major shared/cards/B` 校对后再写。

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm exec vitest run server/__tests__/harvest-session.test.ts -t "basic conversion via sourceId"
pnpm exec vitest run server/__tests__/harvest-session.test.ts -t "anytime exchange"
pnpm exec vitest run server/__tests__/harvest-session.test.ts -t "anytime non-cookery"
```

预期：3 tests fail（basic 因 lookupExchange 找不到 sourceId='__basic__'；D60/B104 因 trigger 校验拒收 anytime）。

- [ ] **Step 3: 修改 `confirmHarvestFeed` 的 lookupCard 与 trigger 校验**

打开 `shared/session/game-core.ts`，定位 `confirmHarvestFeed` 内的 `lookupCard` 与 `cappedSelections` 块（spec 标注 line 2263-2302，运行时请用 grep 重新定位）。

a. 在文件顶部 import basic-conversion lookup：

```ts
import {
  BASIC_CONVERSION_SOURCE_ID,
  getBasicConversionExchange,
} from '../cards/basic-conversion'
```

b. 把现有 `lookupCard(sourceId)` 函数替换为 `lookupExchange(sourceId, idx)`（语义升级：直接返回 exchange 而不是 card）：

```ts
const lookupExchange = (
  sourceId: string,
  idx: number,
): import('../cards/types').CardExchange | undefined => {
  if (sourceId === BASIC_CONVERSION_SOURCE_ID) {
    return getBasicConversionExchange(idx)
  }
  let card: { exchanges?: readonly import('../cards/types').CardExchange[] } | undefined
  if (player.improvements.includes(sourceId)) card = getMajorCardEffect(sourceId)
  else if (player.minorPlayed.includes(sourceId)) card = getRegisteredMinorImprovement(sourceId)
  else if (player.occupationPlayed.includes(sourceId)) card = getRegisteredOccupation(sourceId)
  return card?.exchanges?.[idx]
}
```

c. 把 `cappedSelections` 中按 trigger='harvest' 校验的分支改为接受 `harvest` 或 `anytime`：

```ts
const cappedSelections: ResolvedSel[] = selections.map((sel) => {
  if (!sel.sourceId || sel.count <= 0) return sel
  let exchange: import('../cards/types').CardExchange | undefined
  if (typeof sel.exchangeIndex === 'number') {
    const candidate = lookupExchange(sel.sourceId, sel.exchangeIndex)
    if (candidate) {
      const triggers = candidate.triggers ?? []
      if (triggers.includes('harvest') || triggers.includes('anytime')) {
        exchange = candidate
      }
    }
  } else {
    // 旧的 (resourceKey, food) 单 key 匹配路径，本任务保留以保持现有测试通过；
    // Task 6 删除此分支。
    const card =
      (player.improvements.includes(sel.sourceId) && getMajorCardEffect(sel.sourceId)) ||
      (player.minorPlayed.includes(sel.sourceId) && getRegisteredMinorImprovement(sel.sourceId)) ||
      (player.occupationPlayed.includes(sel.sourceId) && getRegisteredOccupation(sel.sourceId)) ||
      undefined
    exchange = card?.exchanges?.find((ex) => {
      if (!(ex.triggers ?? []).includes('harvest')) return false
      const fromKeys = Object.keys(ex.from) as (keyof Resource)[]
      if (fromKeys.length !== 1) return false
      const fromKey = fromKeys[0]!
      if (fromKey !== sel.resourceKey) return false
      const foodOut = (ex.to as Partial<Resource>).food ?? 0
      return foodOut === (sel.food ?? 0)
    })
  }
  if (!exchange) return sel
  let capped = sel.count
  if (exchange.max !== undefined) {
    const usedSoFar = perSourceUsed.get(sel.sourceId) ?? 0
    const remaining = Math.max(0, exchange.max - usedSoFar)
    capped = Math.min(sel.count, remaining)
    perSourceUsed.set(sel.sourceId, usedSoFar + capped)
  }
  return { ...sel, count: capped, _exchange: exchange }
})
```

> 注：旧 `lookupCard` 引用清掉。

- [ ] **Step 4: 跑测试确认新增 3 用例 + 现有 fast/slow 全绿**

```bash
pnpm exec vitest run server/__tests__/harvest-session.test.ts
pnpm test:fast
pnpm exec vitest run --project slow
```

预期：harvest-session.test.ts 全绿（含 3 新 + 现有），fast/slow 0 fail（legacy 路径仍兼容）。

- [ ] **Step 5: Commit**

```bash
git add shared/session/game-core.ts server/__tests__/harvest-session.test.ts
git commit -m "feat(D3): server lookupExchange supports __basic__ + anytime triggers

confirmHarvestFeed now resolves sourceId='__basic__' to the synthetic
basic-conversion exchanges and accepts triggers in {harvest, anytime}.
Legacy (resourceKey, food) fallback retained for back-compat; Task 6
removes it."
```

---

## Task 3：buildHarvestFeedOptions 重写（切换 client 来源）

**Files:**
- Modify: `client/app/hooks/use-harvest-flow.ts`
- Test: `client/app/hooks/__tests__/use-harvest-flow.test.ts` (新增)

- [ ] **Step 1: 写失败的单元测试**

`client/app/hooks/__tests__/use-harvest-flow.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildHarvestFeedOptions } from '../use-harvest-flow'
import type { PlayerState } from '../../../../shared/game/types'

const mkPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  // 用项目其它测试中已有的 mkPlayer / 复用同事写法；此处给最小骨架：
  id: 'p1',
  name: 'P1',
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  pastures: [],
  stables: [],
  roomTiles: [],
  workers: 2,
  fenceCount: 0,
  improvements: [],
  minorPlayed: [],
  occupationPlayed: [],
  cardStates: {},
  ...overrides,
} as PlayerState)

const cardLabel = (id: string) => id

describe('buildHarvestFeedOptions', () => {
  it('lists basic conversion when player holds grain/vegetable', () => {
    const player = mkPlayer({ resources: { ...mkPlayer().resources, grain: 1, vegetable: 1 } })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    expect(options.find((o) => o.sourceId === '__basic__' && o.exchangeIndex === 0)).toBeDefined()
    expect(options.find((o) => o.sourceId === '__basic__' && o.exchangeIndex === 1)).toBeDefined()
  })

  it('omits basic conversion entries when player has no grain/vegetable', () => {
    const player = mkPlayer({ resources: { ...mkPlayer().resources, grain: 0, vegetable: 0 } })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    expect(options.filter((o) => o.sourceId === '__basic__')).toHaveLength(0)
  })

  it('lists harvest-trigger card exchanges (existing behaviour)', () => {
    const player = mkPlayer({
      resources: { ...mkPlayer().resources, vegetable: 1 },
      minorPlayed: ['C59_SchnappsDistillery'],
    })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    expect(options.find((o) => o.sourceId === 'C59_SchnappsDistillery')).toBeDefined()
  })

  it('lists anytime card exchanges (e.g. B104 SheepWalker)', () => {
    const player = mkPlayer({
      resources: { ...mkPlayer().resources, sheep: 1 },
      minorPlayed: ['B104_SheepWalker'],
    })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    const sheepWalker = options.filter((o) => o.sourceId === 'B104_SheepWalker')
    expect(sheepWalker.length).toBeGreaterThan(0)
  })

  it('skips exchanges whose from resources player cannot afford', () => {
    const player = mkPlayer({
      resources: { ...mkPlayer().resources, sheep: 0 },
      minorPlayed: ['B104_SheepWalker'],
    })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    expect(options.filter((o) => o.sourceId === 'B104_SheepWalker')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm exec vitest run client/app/hooks/__tests__/use-harvest-flow.test.ts
```

预期：tests fail（当前 `buildHarvestFeedOptions` 不返回 `sourceId='__basic__'`，硬编码列表也不含 B104）。

- [ ] **Step 3: 重写 `buildHarvestFeedOptions`**

把 `client/app/hooks/use-harvest-flow.ts` 整个 `buildHarvestFeedOptions` 替换：

```ts
import type { GameState, PlayerState, Resource } from '../../../shared/game/types'
import type { Locale } from '../../../shared/i18n'
import type { HarvestSummary } from '../../../shared/logic/round'
import { performHarvest } from '../../../shared/logic/round'
import {
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
} from '../../../shared/cards/types'
import { getMajorCardEffect } from '../../../shared/cards/major'
import {
  BASIC_CONVERSION_SOURCE_ID,
  basicConversionExchanges,
} from '../../../shared/cards/basic-conversion'
import type { CardExchange } from '../../../shared/cards/types'

export type HarvestFeedPending = {
  playerIndex: number
  playerName: string
  remaining: number
  foodUsed: number
}

export type HarvestFeedOption = {
  id: string
  sourceName: string
  sourceId: string
  exchangeIndex: number
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  // 兼容字段：Task 5 删除
  resourceKey?: keyof Resource
  food?: number
}

export type HarvestContext = {
  round: number
  reap: HarvestSummary['reap']
  feed: HarvestSummary['feed']
  pending: HarvestFeedPending[]
}

export const canFinalizeHarvest = (pendingFeedByPlayerId: Record<string, number>) =>
  Object.values(pendingFeedByPlayerId).every((value) => value <= 0)

export const runHarvestFlow = (state: GameState) => performHarvest(state)

const isHarvestFeedTrigger = (ex: CardExchange) => {
  const triggers = ex.triggers ?? []
  return triggers.includes('harvest') || triggers.includes('anytime')
}

const playerCanAfford = (player: PlayerState, ex: CardExchange) => {
  for (const [k, v] of Object.entries(ex.from)) {
    const need = (v as number) ?? 0
    if (need > 0 && player.resources[k as keyof Resource] < need) return false
  }
  return true
}

export const buildHarvestFeedOptions = (
  player: PlayerState,
  locale: Locale,
  cardLabel: (id: string) => string,
): HarvestFeedOption[] => {
  const options: HarvestFeedOption[] = []
  const basicSourceName = locale === 'zh' ? '基础转化' : 'Basic conversion'

  const pushFromExchanges = (
    sourceId: string,
    sourceName: string,
    exchanges: readonly CardExchange[] | undefined,
  ) => {
    if (!exchanges) return
    exchanges.forEach((ex, idx) => {
      if (!isHarvestFeedTrigger(ex)) return
      if (!playerCanAfford(player, ex)) return
      // 兼容字段：单 input 单 food 输出时填 resourceKey/food
      const fromKeys = Object.keys(ex.from) as (keyof Resource)[]
      const isSingleFoodTrade =
        fromKeys.length === 1 &&
        ((ex.from as Partial<Resource>)[fromKeys[0]!] ?? 0) === 1 &&
        ((ex.to as Partial<Resource>).food ?? 0) > 0
      options.push({
        id: `${sourceId}-ex${idx}`,
        sourceName,
        sourceId,
        exchangeIndex: idx,
        from: { ...ex.from },
        to: { ...ex.to },
        max: ex.max,
        resourceKey: isSingleFoodTrade ? fromKeys[0]! : undefined,
        food: isSingleFoodTrade ? ((ex.to as Partial<Resource>).food ?? 0) : undefined,
      })
    })
  }

  // 1. Basic conversion
  pushFromExchanges(BASIC_CONVERSION_SOURCE_ID, basicSourceName, basicConversionExchanges)

  // 2. Improvements (含 majors)
  for (const cardId of player.improvements) {
    const major = getMajorCardEffect(cardId)
    pushFromExchanges(cardId, cardLabel(cardId), major?.exchanges)
  }

  // 3. Minors
  for (const cardId of player.minorPlayed) {
    const card = getRegisteredMinorImprovement(cardId)
    pushFromExchanges(cardId, cardLabel(cardId), card?.exchanges)
  }

  // 4. Occupations
  for (const cardId of player.occupationPlayed) {
    const card = getRegisteredOccupation(cardId)
    pushFromExchanges(cardId, cardLabel(cardId), card?.exchanges)
  }

  return options
}
```

- [ ] **Step 4: 跑测试确认 pass + 现有不破坏**

```bash
pnpm exec vitest run client/app/hooks/__tests__/use-harvest-flow.test.ts
pnpm test:fast
```

预期：5 unit tests pass；fast 全绿（GameContainerApi 用 `option.resourceKey` 单 key 路径仍因兼容字段保留而能跑，counter 上限对多 key option 暂不正确——下一 task 修）。

- [ ] **Step 5: Commit**

```bash
git add client/app/hooks/use-harvest-flow.ts client/app/hooks/__tests__/use-harvest-flow.test.ts
git commit -m "feat(D3): rewrite buildHarvestFeedOptions to scan all exchanges

Replaces the hardcoded cookingSources table with a uniform scan over
basic-conversion + improvements + minorPlayed + occupationPlayed,
filtering by triggers in {harvest, anytime} and player affordability.
HarvestFeedOption keeps resourceKey/food as optional compat fields
(Task 5 removes them)."
```

---

## Task 4：UI counter 多 key 上限 helper

**Files:**
- Create: `client/app/hooks/use-harvest-feed-counter.ts`
- Test: `client/app/hooks/__tests__/use-harvest-feed-counter.test.ts`
- Modify: `client/app/GameContainerApi.tsx:874-897`（`updateHarvestFeedCount` 与 `getHarvestFeedUsageByResource`）

- [ ] **Step 1: 写失败的单元测试**

`client/app/hooks/__tests__/use-harvest-feed-counter.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { computeHarvestFeedCounterMax } from '../use-harvest-feed-counter'
import type { HarvestFeedOption } from '../use-harvest-flow'

const opt = (id: string, from: Record<string, number>, to: Record<string, number> = { food: 1 }): HarvestFeedOption => ({
  id,
  sourceName: id,
  sourceId: id,
  exchangeIndex: 0,
  from,
  to,
})

describe('computeHarvestFeedCounterMax', () => {
  const playerResources = { sheep: 2, grain: 3, food: 0, clay: 0, wood: 0, reed: 0, stone: 0, vegetable: 0, boar: 0, cattle: 0, begging: 0 }

  it('returns floor(have / from[k]) when no other option shares the key', () => {
    const target = opt('A', { grain: 1 })
    const max = computeHarvestFeedCounterMax(target, [target], { A: 0 }, playerResources)
    expect(max).toBe(3)
  })

  it('caps by remaining when other options consume the same from key', () => {
    const a = opt('A', { sheep: 1 })
    const b = opt('B', { sheep: 1 })
    const max = computeHarvestFeedCounterMax(a, [a, b], { A: 0, B: 1 }, playerResources)
    // sheep total 2, B used 1 -> A can use up to 1
    expect(max).toBe(1)
  })

  it('handles multi-from keys: cap is min over all keys', () => {
    const target = opt('Z', { sheep: 1, grain: 2 })
    const max = computeHarvestFeedCounterMax(target, [target], { Z: 0 }, playerResources)
    // sheep allows 2, grain allows floor(3/2)=1 -> min = 1
    expect(max).toBe(1)
  })

  it('returns 0 when target option itself cannot be afforded once', () => {
    const a = opt('A', { sheep: 1 })
    const b = opt('B', { sheep: 1 })
    const max = computeHarvestFeedCounterMax(a, [a, b], { A: 0, B: 2 }, playerResources)
    // B already used 2 sheep; A has 0 left
    expect(max).toBe(0)
  })

  it('includes target current count in calculation (so + button decision is consistent)', () => {
    const a = opt('A', { sheep: 1 })
    const max = computeHarvestFeedCounterMax(a, [a], { A: 1 }, playerResources)
    // sheep 2, A used 1; remaining 1 + current 1 = 2 max
    expect(max).toBe(2)
  })
})
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm exec vitest run client/app/hooks/__tests__/use-harvest-feed-counter.test.ts
```

预期：fail，原因 `Cannot find module '../use-harvest-feed-counter'`。

- [ ] **Step 3: 实现 helper**

`client/app/hooks/use-harvest-feed-counter.ts`：

```ts
import type { Resource } from '../../../shared/game/types'
import type { HarvestFeedOption } from './use-harvest-flow'

/**
 * Max value for the option's counter. Constraint: for every from-key k,
 *   sum_over_all_options(from[k] * count) <= player.resources[k]
 * The target's current count is included in the cap (so the user can re-add
 * up to the original limit after decrementing).
 */
export const computeHarvestFeedCounterMax = (
  target: HarvestFeedOption,
  allOptions: readonly HarvestFeedOption[],
  counts: Record<string, number>,
  playerResources: Resource,
): number => {
  const targetFromKeys = Object.keys(target.from) as (keyof Resource)[]
  if (targetFromKeys.length === 0) return 0

  let maxTimes = Number.POSITIVE_INFINITY
  for (const k of targetFromKeys) {
    const need = (target.from[k] ?? 0) as number
    if (need <= 0) continue
    const have = playerResources[k] ?? 0
    let usedByOthers = 0
    for (const o of allOptions) {
      if (o.id === target.id) continue
      const c = counts[o.id] ?? 0
      const f = (o.from[k] ?? 0) as number
      usedByOthers += c * f
    }
    const remaining = have - usedByOthers
    const cap = Math.floor(remaining / need)
    if (cap < maxTimes) maxTimes = cap
  }
  return Math.max(0, Number.isFinite(maxTimes) ? maxTimes : 0)
}
```

- [ ] **Step 4: 跑 helper 测试确认 pass**

```bash
pnpm exec vitest run client/app/hooks/__tests__/use-harvest-feed-counter.test.ts
```

预期：5 tests pass。

- [ ] **Step 5: GameContainerApi.tsx 接入 helper**

打开 `client/app/GameContainerApi.tsx`，定位 `updateHarvestFeedCount`（约 line 884-897）：

a. 顶部 import：

```ts
import { computeHarvestFeedCounterMax } from './hooks/use-harvest-feed-counter'
```

b. 替换 `updateHarvestFeedCount` 实现：

```tsx
const updateHarvestFeedCount = useCallback((id: string, delta: number) => {
  setHarvestFeedCounts((prev) => {
    const current = prev[id] ?? 0
    const option = harvestFeedOptions.find((entry) => entry.id === id)
    if (!option || !harvestFeedPlayer) return prev
    const max = computeHarvestFeedCounterMax(
      option,
      harvestFeedOptions,
      prev,
      harvestFeedPlayer.resources,
    )
    const nextValue = Math.max(0, Math.min(current + delta, max))
    if (nextValue === current) return prev
    return { ...prev, [id]: nextValue }
  })
}, [harvestFeedOptions, harvestFeedPlayer])
```

c. 删除已不再使用的 `getHarvestFeedUsageByResource` 函数（line 874-882），如果 GameContainerApi 内部没有其他引用（grep 一下确认）。

d. line 1542-1556 的内联 max 计算（在 JSX 渲染逻辑中重复了 counter cap）也用 helper 替换：

```tsx
const optionMax = harvestFeedPlayer
  ? computeHarvestFeedCounterMax(option, harvestFeedOptions, harvestFeedCounts, harvestFeedPlayer.resources)
  : 0
const isPlusDisabled = (harvestFeedCounts[option.id] ?? 0) >= optionMax
```

> 行号是 spec 标的；请用 grep 重新定位 `harvestFeedPlayer?.resources[option.resourceKey]` 这串字符。

e. line 935 的 summary 累加 `resources[entry.resourceKey] += entry.count`：用 from map 累加替换。

```tsx
const harvestFeedSummary = useMemo(() => {
  const resources = { ...emptyResources }
  resources.food = (harvestPending?.foodUsed ?? 0) + harvestFeedConvertedFood
  harvestFeedSelections.forEach((entry) => {
    Object.entries(entry.from ?? {}).forEach(([k, v]) => {
      resources[k as keyof Resource] = (resources[k as keyof Resource] ?? 0) + entry.count * (v as number)
    })
  })
  resources.begging = harvestFeedBegging
  return resources
}, [harvestFeedBegging, harvestFeedConvertedFood, harvestFeedSelections, harvestPending?.foodUsed])
```

同时把 `harvestFeedSelections.map` (line 907-921) 中带的字段同步：

```tsx
const harvestFeedSelections = useMemo(
  () =>
    harvestFeedOptions
      .map((option) => ({
        sourceId: option.sourceId,
        exchangeIndex: option.exchangeIndex,
        count: harvestFeedCounts[option.id] ?? 0,
        sourceName: option.sourceName,
        from: option.from,
        to: option.to,
      }))
      .filter((entry) => entry.count > 0),
  [harvestFeedCounts, harvestFeedOptions],
)
const harvestFeedConvertedFood = useMemo(
  () =>
    harvestFeedSelections.reduce(
      (sum, entry) => sum + entry.count * ((entry.to.food as number) ?? 0),
      0,
    ),
  [harvestFeedSelections],
)
```

- [ ] **Step 6: 跑 fast/lint 看类型 + 集成完整**

```bash
pnpm test:fast
pnpm run lint
```

预期：fast 全绿；lint 0 error。

- [ ] **Step 7: Commit**

```bash
git add client/app/hooks/use-harvest-feed-counter.ts \
        client/app/hooks/__tests__/use-harvest-feed-counter.test.ts \
        client/app/GameContainerApi.tsx
git commit -m "feat(D3): UI counter cap respects multi-key from constraints

Replaces single-key option.resourceKey usage in updateHarvestFeedCount /
summary / disable-button calculation with computeHarvestFeedCounterMax
which caps each option's counter by floor((have - usedByOthers) / need)
per from key, taking the min across all from keys."
```

---

## Task 5：协议层删 resourceKey/food 字段

**Files:**
- Modify: `shared/protocol/ws.ts:21-29`
- Modify: `client/services/gameTransport.ts:27-35`
- Modify: `client/app/hooks/use-harvest-flow.ts`（删 HarvestFeedOption.resourceKey/food 与 buildHarvestFeedOptions 中兼容字段）

- [ ] **Step 1: ws.ts 协议字段精简**

`shared/protocol/ws.ts` 找到 `type: 'feed'` 块，selections 类型改为：

```ts
| {
    type: 'feed'
    selections: {
      count: number
      sourceName?: string
      sourceId: string
      exchangeIndex: number
    }[]
  }
```

- [ ] **Step 2: gameTransport.ts 同步**

`client/services/gameTransport.ts:27-35`：

```ts
confirmFeed(playerIndex: number, selections: {
  count: number
  sourceName?: string
  sourceId: string
  exchangeIndex: number
}[]): Promise<GameSyncPayload>
```

- [ ] **Step 3: use-harvest-flow.ts HarvestFeedOption 类型精简**

把 Task 3 留下的兼容字段 `resourceKey?` / `food?` 从 `HarvestFeedOption` 中删除；同步删 `pushFromExchanges` 中填这两个字段的逻辑：

```ts
export type HarvestFeedOption = {
  id: string
  sourceName: string
  sourceId: string
  exchangeIndex: number
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
}
```

`pushFromExchanges` 末尾 `options.push({...})` 中删除 `resourceKey`/`food`。

- [ ] **Step 4: 编译 + fast 测试**

```bash
pnpm run lint
pnpm test:fast
```

预期：可能出现编译错（GameContainerApi / 其他读 `option.resourceKey` 的位置）。修法：把所有 `option.resourceKey` / `option.food` 用法删掉或改用 `option.from` / `option.to.food`。

```bash
grep -rn "option\.resourceKey\|option\.food\b" client/ shared/ server/ --include="*.ts" --include="*.tsx"
```

发现的位置全部替换。

- [ ] **Step 5: 再跑 fast 全绿**

```bash
pnpm test:fast
pnpm run lint
```

预期：0 error。

- [ ] **Step 6: Commit**

```bash
git add shared/protocol/ws.ts client/services/gameTransport.ts client/app/hooks/use-harvest-flow.ts client/app/GameContainerApi.tsx
git commit -m "refactor(D3): drop resourceKey/food from harvest feed protocol

Selections now carry only { count, sourceId, exchangeIndex, sourceName? }.
HarvestFeedOption type and all client read sites updated to use the
from/to maps instead of the legacy single-key shorthand."
```

---

## Task 6：server 删 legacy 单 key 分支

**Files:**
- Modify: `shared/session/game-core.ts`（confirmHarvestFeed 内 cappedSelections else 分支 + main loop 的 sel.resourceKey 应用）
- Modify: `shared/session/game-core.ts::confirmHarvestFeed` 参数类型（同步 ws.ts）

- [ ] **Step 1: 跑现有 session 测试看 baseline**

```bash
pnpm exec vitest run server/__tests__/harvest-session.test.ts server/__tests__/C59_SchnappsDistillery-session.test.ts server/__tests__/C105_BasketCarrier-session.test.ts server/__tests__/E153_StoneSculptor-session.test.ts
```

记录哪些用例当前依赖 legacy 字段（codemod 在 Task 7 做）。

- [ ] **Step 2: 删 legacy 分支**

`shared/session/game-core.ts`：

a. `confirmHarvestFeed` 参数类型改为：

```ts
selections: {
  count: number
  sourceName?: string
  sourceId: string
  exchangeIndex: number
}[]
```

b. `cappedSelections` 中 `else` 分支（旧的 (resourceKey, food) 单 key 匹配）整段删除，改为：

```ts
const cappedSelections: ResolvedSel[] = selections.map((sel) => {
  if (!sel.sourceId || sel.count <= 0) return sel
  const candidate = lookupExchange(sel.sourceId, sel.exchangeIndex)
  if (!candidate) return sel
  let capped = sel.count
  if (candidate.max !== undefined) {
    const usedSoFar = perSourceUsed.get(sel.sourceId) ?? 0
    const remaining = Math.max(0, candidate.max - usedSoFar)
    capped = Math.min(sel.count, remaining)
    perSourceUsed.set(sel.sourceId, usedSoFar + capped)
  }
  return { ...sel, count: capped, _exchange: candidate }
})
```

> 注：trigger 校验也一并删除（spec §2 决策"服务端不校验 trigger"）。

c. main loop 的 `else if (sel.resourceKey && typeof sel.food === 'number')` 分支整段删除（spec line 2377-2394 范围）。

- [ ] **Step 3: 跑全量测试**

```bash
pnpm test:fast
pnpm exec vitest run --project slow
```

预期：harvest-session.test.ts 现有 + 新用例全绿（因 Task 2 已在新路径上）；C59/C105/E153 等仍写老格式 selection 的会 fail（Task 7 codemod 修复）。

- [ ] **Step 4: Commit（即使 codemod 未做，至少先确保 fast 大盘可跑）**

如 fast 大量失败且会让 lint/typecheck 也失败，可暂缓 commit；通常 typecheck 会因参数类型变化把所有调用点强制改对。同步进入 Task 7。

```bash
git add shared/session/game-core.ts
git commit -m "refactor(D3): remove legacy (resourceKey, food) fallback in confirmFeed

confirmHarvestFeed now resolves every selection through
lookupExchange(sourceId, idx) only. Trigger validation is gone (server
trusts the client filter; affordability is still checked per from key).
Test codemod for C59/C105/E153/harvest-session lands in Task 7."
```

> 如 commit 因 typecheck/test 失败被 hook 阻断，先做 Task 7 再合并 commit。

---

## Task 7：测试 codemod（4 个 session 测试）

**Files:**
- Modify: `server/__tests__/harvest-session.test.ts`
- Modify: `server/__tests__/C59_SchnappsDistillery-session.test.ts`
- Modify: `server/__tests__/C105_BasketCarrier-session.test.ts`
- Modify: `server/__tests__/E153_StoneSculptor-session.test.ts`

- [ ] **Step 1: 列出每个文件所有 confirmHarvestFeed 调用 + 字段形态**

```bash
grep -n "confirmHarvestFeed\|confirmFeed" server/__tests__/{harvest-session,C59_SchnappsDistillery-session,C105_BasketCarrier-session,E153_StoneSculptor-session}.test.ts
```

记录每个 selection 的 `resourceKey/food` 出现位置。

- [ ] **Step 2: codemod harvest-session.test.ts**

把所有形如 `{ resourceKey: 'grain', count: N, food: 1 }` 替换为 `{ sourceId: '__basic__', exchangeIndex: 0, count: N }`；vegetable 类似改为 `exchangeIndex: 1`。Major Fireplace/CookingHearth 路径（如有）改为对应 cardId + 实际 exchanges 数组中的 idx（grep `shared/cards/major/fireplace.ts` 与 `cooking-hearth.ts` 找 idx）。

- [ ] **Step 3: codemod C59 / C105 / E153**

这三个测试已经传 sourceId+exchangeIndex 路径，仅删 selection 对象里残留的 `resourceKey`/`food` 字段。

- [ ] **Step 4: 跑测试全绿**

```bash
pnpm exec vitest run server/__tests__/harvest-session.test.ts server/__tests__/C59_SchnappsDistillery-session.test.ts server/__tests__/C105_BasketCarrier-session.test.ts server/__tests__/E153_StoneSculptor-session.test.ts
pnpm test:fast
pnpm exec vitest run --project slow
```

预期：fast + slow 0 fail。

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/harvest-session.test.ts server/__tests__/C59_SchnappsDistillery-session.test.ts server/__tests__/C105_BasketCarrier-session.test.ts server/__tests__/E153_StoneSculptor-session.test.ts
git commit -m "test(D3): codemod harvest feed selections to sourceId+exchangeIndex

All confirmHarvestFeed calls in harvest-session / C59 / C105 / E153 now
use the unified { sourceId, exchangeIndex, count } shape; legacy
resourceKey/food fields are removed."
```

---

## Task 8：Playwright e2e

**Files:**
- Create: `e2e-tests/D3-harvest-feed-options.spec.ts`

- [ ] **Step 1: 起前后端**

```bash
./restart-intranet.sh
```

确认 `localhost:5175/api/health` 200，`localhost:5173` 渲染。

- [ ] **Step 2: 写 e2e 三用例**

`e2e-tests/D3-harvest-feed-options.spec.ts`：

```ts
import { test, expect } from '@playwright/test'

test.describe('D3 — harvest feed options unified path', () => {
  test('basic conversion options appear & submit converts grain/vegetable', async ({ page }) => {
    // 进入 dev mode，开 2 人房，设 p1 grain=2 vegetable=1 food=0，跳到 round 4
    await page.goto('/?player=p1&room=dev&devMode=1&transport=ws')
    // 用 dev panel 设资源
    await page.getByRole('button', { name: /Dev panel/i }).click()
    // ...具体 dev 操作请参考 e2e-tests/harvest.spec.ts 中已有的 helper
    // 快速跳转到 round 4 触发 harvest
    // 进入 feedPending（要求 3 food）
    // 断言 UI 含 "基础转化" / "Basic conversion" 两条
    const basicGrain = page.getByTestId(/harvest-feed-option-__basic__-ex0/)
    const basicVeg = page.getByTestId(/harvest-feed-option-__basic__-ex1/)
    await expect(basicGrain).toBeVisible()
    await expect(basicVeg).toBeVisible()
    // grain +2, vegetable +1
    await basicGrain.getByRole('button', { name: '+' }).click()
    await basicGrain.getByRole('button', { name: '+' }).click()
    await basicVeg.getByRole('button', { name: '+' }).click()
    // 提交
    await page.getByRole('button', { name: /confirm feed/i }).click()
    // 等服务端 echo
    await page.waitForTimeout(500)
    // 验证资源（可通过 dev panel state inspector）
    // ...细节略，跟随项目现有 helper
  })

  test('non-cookery anytime exchange (B104 SheepWalker) listed; counter caps shared sheep', async ({ page }) => {
    // dev 装 B104 SheepWalker，p1 sheep=2 food=0
    // 触发 harvest feed
    // 列表含 sheep->boar / sheep->vegetable / sheep->stone 三条
    const optBoar = page.getByTestId(/harvest-feed-option-B104_SheepWalker-ex0/)
    const optVeg = page.getByTestId(/harvest-feed-option-B104_SheepWalker-ex1/)
    const optStone = page.getByTestId(/harvest-feed-option-B104_SheepWalker-ex2/)
    await expect(optBoar).toBeVisible()
    await expect(optVeg).toBeVisible()
    await expect(optStone).toBeVisible()
    // sheep->stone +1, sheep->boar +1，sheep 2 用尽
    await optStone.getByRole('button', { name: '+' }).click()
    await optBoar.getByRole('button', { name: '+' }).click()
    // 三个 + 按钮都 disabled
    await expect(optStone.getByRole('button', { name: '+' })).toBeDisabled()
    await expect(optBoar.getByRole('button', { name: '+' })).toBeDisabled()
    await expect(optVeg.getByRole('button', { name: '+' })).toBeDisabled()
  })

  test('harvest trigger card + basic mixed submit', async ({ page }) => {
    // dev 装 C59 SchnappsDistillery (vegetable->5food, max=1) + grain=2，缺食 5
    // 选 C59 +1 + basic grain +1 -> total food = 6
    // 提交，断言 round 推进进入 breed
  })
})
```

> 实现细节请参照 `e2e-tests/harvest.spec.ts`、`e2e-tests/fixtures.ts`、`e2e-tests/C75_Firewood.spec.ts` 中已有的 dev panel + WS room 模式。`getByTestId` 的具体 testId 形式以代码为准（如不存在请在 GameContainerApi 渲染层补 `data-testid`）。

- [ ] **Step 3: 跑 e2e**

```bash
pnpm exec playwright install
pnpm exec playwright test e2e-tests/D3-harvest-feed-options.spec.ts e2e-tests/harvest.spec.ts
```

预期：所有 case 通过。

- [ ] **Step 4: 修补 testId / dev panel helper（如有）**

如果 GameContainerApi 渲染 harvest feed 列表时未给行加 `data-testid`，按 `harvest-feed-option-{sourceId}-ex{idx}` 添加。如有 dev panel helper 缺失，参照其它 e2e 文件补齐。

- [ ] **Step 5: Commit**

```bash
git add e2e-tests/D3-harvest-feed-options.spec.ts client/app/GameContainerApi.tsx
git commit -m "test(D3): playwright e2e for unified harvest feed options

Three cases: basic conversion display & submit, non-cookery anytime
SheepWalker listing & multi-key counter cap, mixed C59+basic submit."
```

---

## Task 9：回归 + 文档同步

**Files:**
- Modify: `docs/master-plan.md`（§8 sprint 进度表加 D3 行）

- [ ] **Step 1: 全量回归**

```bash
pnpm test:fast
pnpm exec vitest run --project slow
pnpm run lint
pnpm exec playwright test e2e-tests/D3-harvest-feed-options.spec.ts e2e-tests/harvest.spec.ts
```

预期：fast / slow 全绿，lint 0 error，e2e 通过。

- [ ] **Step 2: 更新 master-plan.md §8**

`docs/master-plan.md`：在 §8 sprint 进度表追加：

```markdown
| D3 | 2026-05-02 | HarvestFeedOption 统一走 sourceId+exchangeIndex（删 resourceKey/food 双轨；basic conversion 合成 __basic__；harvest 接受 anytime） | done |
```

> 行格式以现有表格为准；如表头略不同请对齐。

- [ ] **Step 3: Commit**

```bash
git add docs/master-plan.md
git commit -m "docs(D3): master-plan §8 — D3 sprint complete

HarvestFeedOption protocol unified to sourceId+exchangeIndex, basic
conversion synthesised under '__basic__', harvest accepts harvest|anytime
triggers, server legacy single-key path removed."
```

- [ ] **Step 4: Push 并等 CI**

```bash
git push origin D3-harvest-exchange
```

之后开 PR 或合并到 main（按项目流程）。Push 后必须等 GitHub Actions 三个 workflow 全绿（CI / Deploy Backend / Deploy Frontend），按 CLAUDE.md 硬性要求执行。

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3' \
  | jq '.workflow_runs[] | {name, head_sha, status, conclusion, html_url}'
```

预期：3 workflow 全部 `conclusion: success`。

---

## 全局回归与 DoD 校验

- [ ] `grep -n "resourceKey\|\.food\b" client/app/hooks/use-harvest-flow.ts` 仅剩 `Resource` 类型导入
- [ ] `shared/protocol/ws.ts` feed selection 类型已是 `{ count, sourceId, exchangeIndex, sourceName? }`
- [ ] `client/services/gameTransport.ts` `confirmFeed` 类型已同步
- [ ] `shared/session/game-core.ts::confirmHarvestFeed` 单一路径（无 legacy 单 key 分支、无 trigger='harvest' 校验）
- [ ] fast / slow / lint / e2e 全绿
- [ ] master-plan.md §8 已加 D3 行
- [ ] CI 三 workflow 全绿
