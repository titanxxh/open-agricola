# Sprint 5 机制 B：alternative-cost OR trades — 3 张卡接入 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A4 Baseboards / D83 Pigswill 改用 `altCosts` 字段实现 BGA OR-ed payment；D117 WoodExpert 改 `computeCosts` 返回 trades 让玩家可选用 wood→food 替代付法（含 altCosts 形态 minor 也覆盖）。

**Architecture:** alt-cost / trade 基础设施 100% 已存在（`ComplexCost.fees`、`Trade`、`card.altCosts`、`computeCosts` hook 收集 trades、`computeAllBuyableCombinations` 枚举 fee × trade 组合、`resolvePaymentSolutionSelection` 多 solution 弹 choice）。本 spec 纯 3 张卡接入，**0 主路径改动 / 0 新基础设施**。

**Tech Stack:** TypeScript / Vitest / pnpm。改动：3 张卡 + 1 helper 扩展 + 3 个 session 测试 + 文档同步。

**Spec:** `docs/superpowers/specs/2026-04-30-sprint-5-mech-b-alternative-cost-trades-design.md`

**Worktree:** `.worktree/sprint-5-mech-b-alternative-cost-trades`（基于 main `c7ca1ed7`，已含机制 A + D）

---

## File Structure

**新建：**
- `server/__tests__/A4_Baseboards-session.test.ts` — 4 场景 session 测试
- `server/__tests__/D83_Pigswill-session.test.ts` — 4 场景 session 测试
- `server/__tests__/D117_WoodExpert-session.test.ts` — 6 场景 session 测试（含场景 6 altCosts B43-style）

**修改：**
- `shared/cards/A/A4_Baseboards.ts` — 删 cost，加 altCosts
- `shared/cards/D/D83_Pigswill.ts` — 删 cost，加 altCosts
- `shared/cards/D/D117_WoodExpert.ts` — 扩展 getImprovementWoodCost 扫 altCosts；handler 改返回 trades
- `docs/card_progress.md` — §2.0 / §2.3 / §2.4 / §8 同步
- `docs/master-plan.md` — §8 Sprint 5 行更新

---

## Phase 1: A4 Baseboards — altCosts

**Files:**
- Modify: `shared/cards/A/A4_Baseboards.ts`
- Create: `server/__tests__/A4_Baseboards-session.test.ts`

### Task 1.1: 卡定义改 altCosts

- [ ] **Step 1: 替换 A4_Baseboards.ts 的卡定义**

打开 `shared/cards/A/A4_Baseboards.ts`，把 `cost: { food: 2, grain: 1 }` 改成 `altCosts: [{ food: 2 }, { grain: 1 }]`：

```ts
export const A4_Baseboards = new MinorImprovement({
  id: CARD_ID,
  name: 'Baseboards',
  deck: 'A',
  number: 4,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get 1 <WOOD> for each room you have. If you have more rooms than people, you get 1 additional <WOOD>.'],
  altCosts: [{ food: 2 }, { grain: 1 }],
  passing: true,
})
```

注：`A4_Baseboards_impl` 的 `effect.onBuy`（给 wood）保持不变。`MinorImprovement` 构造器接受 `altCosts` 字段（cards/types.ts:25 已声明），`cost` 字段在没有时 optional。

- [ ] **Step 2: build 验证类型**

Run: `pnpm run build`
Expected: 0 error

### Task 1.2: A4 session 测试

- [ ] **Step 3: 创建测试文件**

```ts
// server/__tests__/A4_Baseboards-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A4_Baseboards'

const CARD_ID = 'A4_Baseboards'

const setup = (opts?: { food?: number; grain?: number }) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 2,
    grain: opts?.grain ?? 0,
  }
  player.minorHand.push(CARD_ID)
  state.players[1]!.workersAvailable = 2

  session.loadState(state)
  return session
}

describe('A4_Baseboards session — altCosts', () => {
  it('food=2, grain=0 → auto-pay food (single solution, no choice prompt)', () => {
    const session = setup({ food: 2, grain: 0 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    // 选打出 A4
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.ok).toBe(true)
    // 单 solution → 不弹 selectPayment choice → 直接付
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('food=0, grain=1 → auto-pay grain (single solution)', () => {
    const session = setup({ food: 0, grain: 1 })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('food=2, grain=1 → multi-solution → selectPayment choice', () => {
    const session = setup({ food: 2, grain: 1 })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    // 多 solution → 弹 selectPayment choice
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    // 至少 2 个 options（food / grain 两条 fee）
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)

    // 玩家选 grain solution（取第二个 option，约定是次优解）
    // 实际：sortPaymentSolutions 把 cost 较少的排前；food=2 vs grain=1 — grain solution 资源消耗少，应该排前
    // 测试：枚举所有 options，选 grain 那条（通过 effectPreview 或 labelParams 区分）
    const grainOption = resp.pending.options.find(o => {
      const params = o.labelParams as Record<string, unknown> | undefined
      const paid = params?.resourcesPaid as Record<string, number> | undefined
      return paid && paid.grain === 1 && !paid.food
    })
    expect(grainOption).toBeDefined()
    resp = session.resolveChoice(0, grainOption!.value)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('food=1, grain=0 → not buyable (cannot afford either alt)', () => {
    const session = setup({ food: 1, grain: 0 })
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    // A4 不在 buyable minor 列表
    const a4Option = resp.pending.options.find(o => o.value === `minor:${CARD_ID}`)
    expect(a4Option).toBeUndefined()
  })
})
```

⚠ 测试细节可能需调整：option `value` 实际格式（`'minor:A4_Baseboards'`）、`labelParams.resourcesPaid` 字段可能为不同 shape。executor 跑一次看 actual `pending.options`，按实际格式调整断言（保留场景意图）。

- [ ] **Step 4: 跑测试**

Run: `pnpm exec vitest run server/__tests__/A4_Baseboards-session.test.ts`
Expected: 4 个测试全 PASS

- [ ] **Step 5: 跑全量 fast 无回归**

Run: `pnpm test:fast`
Expected: 全部 PASS

- [ ] **Step 6: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 7: 提交**

```bash
git add shared/cards/A/A4_Baseboards.ts server/__tests__/A4_Baseboards-session.test.ts
git commit -m "refactor(A4): replace cost with altCosts (BGA OR-ed payment)

A4 Baseboards: cost {food:2, grain:1} (forced AND payment) → altCosts
[{food:2}, {grain:1}] (BGA costs=[[FOOD=>2],[GRAIN=>1]] OR alternative).

Pay path's computeAllBuyableCombinations enumerates one solution per
fee; resolvePaymentSolutionSelection prompts choice when multiple are
affordable.

Four session test scenarios: single-solution food, single-solution
grain, multi-solution choice (food=2 + grain=1), and unaffordable both
(filtered out of buyable list)."
```

---

## Phase 2: D83 Pigswill — altCosts

**Files:**
- Modify: `shared/cards/D/D83_Pigswill.ts`
- Create: `server/__tests__/D83_Pigswill-session.test.ts`

### Task 2.1: 卡定义改 altCosts

- [ ] **Step 1: 替换 D83_Pigswill.ts 的卡定义**

打开 `shared/cards/D/D83_Pigswill.ts`，把 `cost: { food: 2 }` 改成 `altCosts: [{ food: 2 }, { grain: 1 }]`：

```ts
export const D83_Pigswill = new MinorImprovement({
  id: CARD_ID,
  name: 'Pigswill',
  deck: 'D',
  number: 83,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Fencing__ action space, you also get 1 <PIG>.'],
  altCosts: [{ food: 2 }, { grain: 1 }],
  newSet: true,
})
```

注：`D83_Pigswill_impl.listeners`（fencing 触发 +1 pig 路径）保持不变。

- [ ] **Step 2: build 验证**

Run: `pnpm run build`
Expected: 0 error

### Task 2.2: D83 session 测试

- [ ] **Step 3: 创建测试文件**

模仿 A4 测试模板：

```ts
// server/__tests__/D83_Pigswill-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/D/D83_Pigswill'

const CARD_ID = 'D83_Pigswill'

const setup = (opts?: { food?: number; grain?: number }) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 2,
    grain: opts?.grain ?? 0,
  }
  player.minorHand.push(CARD_ID)
  state.players[1]!.workersAvailable = 2

  session.loadState(state)
  return session
}

describe('D83_Pigswill session — altCosts', () => {
  it('food=2, grain=0 → auto-pay food (single solution)', () => {
    const session = setup({ food: 2, grain: 0 })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('food=0, grain=1 → auto-pay grain', () => {
    const session = setup({ food: 0, grain: 1 })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('food=2, grain=1 → multi-solution → selectPayment choice', () => {
    const session = setup({ food: 2, grain: 1 })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)
  })

  it('food=1, grain=0 → not buyable', () => {
    const session = setup({ food: 1, grain: 0 })
    const resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    const d83Option = resp.pending.options.find(o => o.value === `minor:${CARD_ID}`)
    expect(d83Option).toBeUndefined()
  })
})
```

- [ ] **Step 4: 跑测试**

Run: `pnpm exec vitest run server/__tests__/D83_Pigswill-session.test.ts`
Expected: 4 个测试全 PASS

- [ ] **Step 5: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 6: 提交**

```bash
git add shared/cards/D/D83_Pigswill.ts server/__tests__/D83_Pigswill-session.test.ts
git commit -m "refactor(D83): replace cost with altCosts (BGA OR-ed payment)

D83 Pigswill: cost {food:2} → altCosts [{food:2}, {grain:1}], matching
BGA costs=[[FOOD=>2],[GRAIN=>1]]. Listener for fencing → +1 pig is
unchanged. Same four-scenario coverage as A4."
```

---

## Phase 3: D117 WoodExpert — computeCosts trades + altCosts 扫描

**Files:**
- Modify: `shared/cards/D/D117_WoodExpert.ts`
- Create: `server/__tests__/D117_WoodExpert-session.test.ts`

### Task 3.1: 重写 D117

- [ ] **Step 1: 替换 getImprovementWoodCost helper + listener handler**

打开 `shared/cards/D/D117_WoodExpert.ts`，找到现有的 `getImprovementWoodCost` 函数和 `computeCostsListener`。

**改动 1**：扩展 `getImprovementWoodCost` 也扫 `altCosts`：

```ts
const getImprovementWoodCost = (cardId: string): number => {
  const minor = getMinorImprovementCard(cardId)
  if (minor) {
    if (minor.cost?.wood && minor.cost.wood > 0) return minor.cost.wood
    if (minor.altCosts) {
      return Math.max(0, ...minor.altCosts.map(c => c.wood ?? 0))
    }
    return 0
  }
  const major = getMajorCardEffect(cardId)
  if (major) {
    const costs = Array.isArray(major.cost) ? major.cost : [major.cost ?? {}]
    return costs.reduce((m, c) => Math.max(m, (c as Record<string, number>).wood ?? 0), 0)
  }
  return 0
}
```

**改动 2**：listener handler 改返回 `trades` 替代 `costs`：

```ts
const computeCostsListener: CardListenerRegistration = {
  id: 'D117-wood-expert-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.cardId) return
    const woodInCost = getImprovementWoodCost(context.cardId)
    if (woodInCost <= 0) return
    return {
      trades: [{
        from: { food: 1 },
        to: { wood: 2 },
        max: 1,
        source: CARD_ID,
        sourceId: CARD_ID,
      }],
    }
  },
}
```

注：原本 handler 算 `woodDiscount = Math.min(woodInCost, 2)` 是用于 cost patch；trade 形式不需要这个，`generateTradeCombinations` 自动按 fee.wood 实际值 cap。

`D117_WoodExpert_impl.effect.onBuy`（给 2 wood）保持不变。

- [ ] **Step 2: build 验证**

Run: `pnpm run build`
Expected: 0 error

### Task 3.2: D117 session 测试

- [ ] **Step 3: 创建测试文件**

```ts
// server/__tests__/D117_WoodExpert-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/D/D117_WoodExpert'
import '../../shared/cards/B/B81_Handcart'  // cost wood:1 minor (sample)
import '../../shared/cards/B/B43_Chophouse'  // altCosts [{wood:2},{clay:2}] minor

const CARD_ID = 'D117_WoodExpert'

const setup = (opts?: { food?: number; wood?: number; clay?: number; minor?: string }) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 10,
    wood: opts?.wood ?? 0,
    clay: opts?.clay ?? 0,
  }
  // D117 已 played
  player.occupationPlayed.push(CARD_ID)
  // 加目标 minor 到手牌
  if (opts?.minor) {
    player.minorHand.push(opts.minor)
  }
  state.players[1]!.workersAvailable = 2

  session.loadState(state)
  return session
}

describe('D117_WoodExpert session — computeCosts trades', () => {
  it('cost wood:1 minor + food=10 wood=2 → multi-solution choice', () => {
    // B81_Handcart: cost { wood: 1 } — D117 trade max 1 lets player swap for food
    const session = setup({ food: 10, wood: 2, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B81_Handcart')
    // 多 solution：用 0 trade (wood:1) / 用 1 trade (wood:0 + food:1)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)
  })

  it('cost wood minor + food=10 wood=0 → only trade affordable, auto-select', () => {
    const session = setup({ food: 10, wood: 0, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B81_Handcart')
    // 只有 trade solution 可付 → auto-select → confirmNextPlayer
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.food).toBe(9)  // -1 food
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('cost wood minor + food=0 wood=2 → only base affordable, auto-select', () => {
    const session = setup({ food: 0, wood: 2, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B81_Handcart')
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.wood).toBe(1)  // -1 wood
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('cost wood:1 minor → trade max=1 + base wood=1 → both solutions affordable', () => {
    // B81_Handcart wood:1; player food=10 wood=1
    // solution A: pay 1 wood
    // solution B: trade 1 food → 2 wood, fee wood 1 satisfied (2 wood credit caps at 1)
    const session = setup({ food: 10, wood: 1, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B81_Handcart')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)
  })

  it('altCosts minor (B43 Chophouse altCosts:[{wood:2},{clay:2}]) → wood-alt + trade alt + clay-alt', () => {
    // B43 altCosts [{wood:2}, {clay:2}]; D117 trade only applies to wood-bearing alts
    // food=10 wood=2 clay=2 → expect 3 solutions:
    //   A: wood:2 (no trade)
    //   B: wood:0 + food:1 (trade 1× → 2 wood credit, capped at 2)
    //   C: clay:2 (no trade — clay alt unaffected)
    const session = setup({ food: 10, wood: 2, clay: 2, minor: 'B43_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B43_Chophouse')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    // 至少 3 个 solution（wood-alt + trade + clay-alt）
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(3)
  })

  it('altCosts minor + only one alt + trade affordable → multi-solution choice', () => {
    // B43 altCosts [{wood:2}, {clay:2}]; food=10 wood=2 clay=0
    // wood-alt (no trade): wood=2 ✓
    // wood-alt (with trade): wood=0 + food=1 ✓
    // clay-alt: clay=2 ✗ (clay=0)
    // → 2 solutions
    const session = setup({ food: 10, wood: 2, clay: 0, minor: 'B43_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B43_Chophouse')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)
  })
})
```

⚠ 测试假设 B81_Handcart 是 cost wood:1 minor — executor 跑前先 grep `shared/cards/B/B81_Handcart.ts` 确认 cost 字段；如果不是 wood-only minor，换成另一张（如 grep `shared/cards/*/* | grep "cost: { wood:"` 找一张）。同样 B43_Chophouse 假设 altCosts:[{wood:2},{clay:2}] — 已确认（spec §3.3 + 实际 grep）。

- [ ] **Step 4: 跑测试**

Run: `pnpm exec vitest run server/__tests__/D117_WoodExpert-session.test.ts`
Expected: 6 个测试全 PASS。如果 wood:1 minor 是别的卡名（B81 是临时假设），按实际 cost-wood:1 minor 调整。

- [ ] **Step 5: 跑全量 fast 无回归**

Run: `pnpm test:fast`
Expected: 全部 PASS

- [ ] **Step 6: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 7: 提交**

```bash
git add shared/cards/D/D117_WoodExpert.ts server/__tests__/D117_WoodExpert-session.test.ts
git commit -m "refactor(D117): computeCosts returns trades; cover altCosts minors

D117 Wood Expert: computeCosts handler returned a forced cost patch
{wood:-2, food:1} that the player could not refuse. Now returns
trades [{from:food:1, to:wood:2, max:1}] so pay's
computeAllBuyableCombinations enumerates 'use trade' / 'don't use trade'
solutions and the player picks via the standard selectPayment prompt.

getImprovementWoodCost extended to scan altCosts as well as cost. The
trade itself stays a single registration; generateTradeCombinations
runs per fee independently, so wood-bearing alts (e.g. B43 Chophouse
altCosts [{wood:2},{clay:2}]) get the wood→food substitution while
non-wood alts are unaffected.

Six session test scenarios: dual-solution wood:1 minor, only-trade
affordable, only-base affordable, wood:1 minor with trade combo (max
caps), altCosts B43 with three-solution choice (wood-base + wood-trade +
clay-base), altCosts with clay=0 (only wood paths affordable)."
```

---

## Phase 4: 文档同步

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`

### Task 4.1: card_progress.md

- [ ] **Step 1: §2.0 加 changelog 条目**

在 `docs/card_progress.md` §2.0 顶部加：

```
- **2026-04-30 Sprint 5 mech-B — A4 Baseboards / D83 Pigswill / D117 WoodExpert 接入现有 alt-cost 基础设施**：A4 / D83 cost 改 altCosts:[{food:2},{grain:1}]（BGA OR-ed payment）；D117 computeCosts 改返回 trades [{from:food:1, to:wood:2, max:1}]，让玩家可选用替代付法（pay 主路径自然枚举多 PaymentSolution + selectPayment choice prompt）。getImprovementWoodCost 扩展扫 altCosts，使 D117 也对 altCosts 形态 minor（如 B43 Chophouse）的含 wood alt 生效；不含 wood 的 alt（如 clay）不受影响。基础设施 100% 已存在（ComplexCost.fees / Trade / computeAllBuyableCombinations / resolvePaymentSolutionSelection），本批纯单卡接入。新增 server/__tests__/A4_Baseboards-session.test.ts (4 例) / D83_Pigswill-session.test.ts (4 例) / D117_WoodExpert-session.test.ts (6 例)。spec / plan: docs/superpowers/specs/2026-04-30-sprint-5-mech-b-alternative-cost-trades-design.md / docs/superpowers/plans/2026-04-30-sprint-5-mech-b-alternative-cost-trades.md。
```

- [ ] **Step 2: §2.3 + §2.4 标 ✅**

定位 §2.4 "数值/元数据待修" 列表里 A4 / D83 行，标 ✅ Sprint 5 mech-B：

```
- **A4 Baseboards** — BGA `costs=[[food:2],[grain:1]]` 是择一，我方 `cost:{food:2, grain:1}` 强迫同时付（玩家加成本）— ✅ Sprint 5 mech-B
- **D83** — 缺 altCosts grain:1 — ✅ Sprint 5 mech-B
```

D117 在 §2.3 "行为偏差" 标 ✅：

```
- **D117 WoodExpert** — 强制 cost patch 替换 — ✅ Sprint 5 mech-B (改 trades, 玩家可选)
```

- [ ] **Step 3: §8 时间线加新行**

```
| Sprint 5 mech-B (A4/D83 altCosts + D117 trades) | 04-30 | 0 | 822 | 92.1% |
```

实际数字按当前总览算（82X / 92.X%）。

### Task 4.2: master-plan.md §8

- [ ] **Step 4: 更新 Sprint 5 行**

`docs/master-plan.md` §8 Sprint 5 行：

- 状态："partially done (12/28; PR-5 + mech-A + mech-D; 16 张 deferred)" 更新为 "partially done (15/28; PR-5 + mech-A + mech-D + mech-B; 13 张 deferred)"
- 实际工时：加 "+ ~0.5 day (mech-B)"
- PR/Commit 列加：`sprint-5-mech-b-alternative-cost-trades` 分支或 PR 号
- spec / plan 列加：`docs/superpowers/specs/2026-04-30-sprint-5-mech-b-alternative-cost-trades-design.md` + `docs/superpowers/plans/2026-04-30-sprint-5-mech-b-alternative-cost-trades.md`

### Task 4.3: 提交

- [ ] **Step 5: 跑全量 fast / lint / build 终验**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: 全部 PASS / 0 error

- [ ] **Step 6: 提交**

```bash
git add -f docs/card_progress.md docs/master-plan.md
git commit -m "docs: sync mech-B landing across card_progress / master-plan

card_progress §2.0 changelog entry; §2.3 / §2.4 mark A4 / D83 / D117
done; §8 timeline row.

master-plan §8 Sprint 5 progress bumped from 12/28 to 15/28."
```

---

## Phase 5: push + CI 验证（人工，按机制 A / D 模式）

- [ ] **Step 1: git fetch 看远端 main**

Run: `git -C /data00/home/xuxinhao.titan/raw/open-agricola fetch origin && git -C /data00/home/xuxinhao.titan/raw/open-agricola log --oneline HEAD..origin/main`

- 输出空：可 fast-forward
- 输出有提交：先列差异等用户确认（rebase 或 merge）

- [ ] **Step 2: fast-forward merge 到 main + push**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola checkout main
git -C /data00/home/xuxinhao.titan/raw/open-agricola merge --ff-only sprint-5-mech-b-alternative-cost-trades
git -C /data00/home/xuxinhao.titan/raw/open-agricola push origin main
```

- [ ] **Step 3: 等 GitHub Actions（CLAUDE.md 硬性要求）**

```bash
sleep 30
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs) && \
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?branch=main&per_page=5' \
  | jq '.workflow_runs[] | {name, head_sha: .head_sha[0:8], status, conclusion, html_url}'
```

等所有 run completed + success。

- [ ] **Step 4: 清理 worktree**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola worktree remove .worktree/sprint-5-mech-b-alternative-cost-trades
git -C /data00/home/xuxinhao.titan/raw/open-agricola branch -d sprint-5-mech-b-alternative-cost-trades
```
