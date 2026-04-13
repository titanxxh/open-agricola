# Holder Card Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ordered resource stack support to CardState and implement 3 holder cards that use LIFO stacks (A102_Grocer, B83_MuddyPuddles, E40_BeeStatue).

**Architecture:** Extend `CardState` with `stack?: string[]`, add helpers in `card-state.ts`, render stack in `PlayedCardStats` frontend component. Cards use stack directly in handlers — no new actions needed.

**Tech Stack:** TypeScript, GameSession session tests, Vitest.

---

### Task 1: CardState type + stack helpers

**Files:**
- Modify: `shared/game/types.ts`
- Modify: `shared/cards/helpers/card-state.ts`

- [ ] **Step 1: Add `stack` to CardState**

In `shared/game/types.ts`, find `CardState` type (line 128) and add `stack`:

```typescript
export type CardState = {
  flagged?: boolean
  infobox?: string
  counters?: Record<string, number>
  extraData?: Record<string, unknown>
  stack?: string[]
}
```

- [ ] **Step 2: Add stack helpers to card-state.ts**

At the end of `shared/cards/helpers/card-state.ts`, add:

```typescript
export const getCardStack = (player: PlayerState, cardId: string): string[] =>
  player.cardStates?.[cardId]?.stack ?? []

export const pushToCardStack = (player: PlayerState, cardId: string, items: string[]): void => {
  const state = ensureCardState(player, cardId)
  if (!state.stack) state.stack = []
  state.stack.push(...items)
}

export const popFromCardStack = (player: PlayerState, cardId: string): string | undefined => {
  const stack = player.cardStates?.[cardId]?.stack
  if (!stack || stack.length === 0) return undefined
  return stack.pop()
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --project tsconfig.app.json`

- [ ] **Step 4: Commit**

```
feat: add stack field to CardState + stack helpers
```

---

### Task 2: Frontend stack rendering

**Files:**
- Modify: `src/components/board/FarmBoard.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Pass stack to PlayedCardStats**

In `src/components/board/FarmBoard.tsx`, find where `PlayedCardStats` is rendered (around line 924). Add `stack` prop:

```typescript
const cardStack = displayPlayer.cardStates?.[rawId]?.stack ?? []
// ... in JSX:
<PlayedCardStats
  // ...existing props
  stack={cardStack}
/>
```

Add `stack: string[]` to the PlayedCardStats props type.

- [ ] **Step 2: Render stack in PlayedCardStats**

In the `PlayedCardStats` component, after the `visibleCounters` rendering block and before `futureEntries`, add stack rendering:

```tsx
{stack.length > 0 && (
  <div className="card-stack">
    {[...stack].reverse().map((res, i) => (
      <span
        key={`stack-${i}`}
        className={`res-icon res-icon-${res}`}
        title={`#${stack.length - i}: ${res}`}
      />
    ))}
  </div>
)}
```

Update the `hasCounters` check to also include stack:
```typescript
const hasCounters = Object.keys(visibleCounters).length > 0 || stack.length > 0
```

- [ ] **Step 3: Add CSS**

In `src/App.css`, find `.card-future` styles and add after them:

```css
.card-stack {
  display: flex;
  gap: 1px;
  flex-wrap: wrap;
  padding: 2px 4px;
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --project tsconfig.app.json`

- [ ] **Step 5: Commit**

```
feat: render card stack as ordered resource icons in PlayedCardStats
```

---

### Task 3: A102_Grocer (anytime buy goods from stack)

**BGA behavior:** On buy: place 8 goods on card (wood, grain, reed, stone, vegetable, clay, reed, vegetable bottom-to-top). At any time: pay 1 food per good, take top good. Can buy multiple in one action.

**Files:**
- Create: `shared/cards/A/A102_Grocer.ts`
- Create: `server/__tests__/A102_Grocer-session.test.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1: Write session test**

```typescript
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { createInitialState } from '../../shared/logic/state'
import { getCardStack } from '../../shared/cards/helpers/card-state'

describe('A102_Grocer session', () => {
  const makeSession = () => {
    const state = createInitialState(42)
    state.players = state.players.slice(0, 2)
    const session = new GameSession(state)
    session.devPlayCard(0, 'A102_Grocer')
    return session
  }

  it('onBuy places 8 goods on stack', () => {
    const session = makeSession()
    const stack = getCardStack(session.getState().state.players[0], 'A102_Grocer')
    expect(stack).toEqual(['wood', 'grain', 'reed', 'stone', 'vegetable', 'clay', 'reed', 'vegetable'])
  })

  it('anytime action appears when player has food and stack not empty', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.food = 3
    session.loadState(s)
    session.takeAction(0, 'farmland')
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    const grocer = anytime.find((a: any) => a.id === 'A102-grocer-anytime')
    expect(grocer).toBeDefined()
  })

  it('buying top good: pay 1 food, gain vegetable (top of stack)', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.food = 5
    session.loadState(s)
    session.takeAction(0, 'farmland')
    const foodBefore = session.getState().state.players[0].resources.food
    const vegBefore = session.getState().state.players[0].resources.vegetable
    session.takeAnytimeAction(0, 'A102-grocer-anytime')
    const after = session.getState().state.players[0]
    expect(after.resources.food).toBe(foodBefore - 1)
    expect(after.resources.vegetable).toBe(vegBefore + 1)
    const stack = getCardStack(after, 'A102_Grocer')
    expect(stack.length).toBe(7)
    expect(stack[stack.length - 1]).toBe('reed') // new top
  })

  it('anytime not available when no food', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.food = 0
    session.loadState(s)
    session.takeAction(0, 'farmland')
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    expect(anytime.find((a: any) => a.id === 'A102-grocer-anytime')).toBeUndefined()
  })

  it('anytime not available when stack empty', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.food = 20
    s.players[0].cardStates = { A102_Grocer: { stack: [] } }
    session.loadState(s)
    session.takeAction(0, 'farmland')
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    expect(anytime.find((a: any) => a.id === 'A102-grocer-anytime')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement A102_Grocer**

```typescript
import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { pushToCardStack, getCardStack, popFromCardStack } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../game/types'
import { gainResources } from '../../actions/effects/gain'

const CARD_ID = 'A102_Grocer'
const GOODS: string[] = ['wood', 'grain', 'reed', 'stone', 'vegetable', 'clay', 'reed', 'vegetable']

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, [...GOODS])
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'A102-grocer-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    if (context.player.resources.food < 1) return
    const topResource = stack[stack.length - 1]
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            actionContext: { method: 'popAndGain' },
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.A102_Grocer.anytime',
      labelParams: { resource: topResource },
    }
  },
}

registerCardListener(anytimeListener)

export const A102_Grocer = new Occupation({
  id: CARD_ID,
  name: 'Grocer',
  deck: 'A',
  number: 102,
  category: 'GOODS_PROVIDER',
  desc: ['Place 8 goods on this card. At any time, you can pay 1 <FOOD> to buy the top good.'],
  cost: {},
  players: '1+',
})
```

**Note on `special-effect` with `popAndGain`:** The `special-effect` action may not support custom methods. If so, use a simpler approach: do the pop + gain directly in the handler. Since the handler returns a flow, you can't mutate state in the handler. Instead:

Alternative approach — use the existing `take-from-card` pattern but pop from stack. Check if `take-from-card` can work with stacks. If not, the simplest solution: after the pay flow succeeds, the engine continues. Use a second listener or `registerCardEffect` hook to handle the pop.

Actually the cleanest approach: pop the resource in a custom inline action. Read `shared/actions/effects/special-effect.ts` to see if it dispatches to card methods. If not, create a minimal `pop-card-stack` action or handle it by directly popping in the flow execution.

**Simplest working approach:** Pop in the anytime handler BEFORE returning the flow (the handler runs during buildAnytimeEntries for availability check AND during takeAnytimeAction for execution). But this won't work — the handler should be pure for availability checking.

**Best approach:** Use `store-on-card` with a negative value to "consume" the top, combined with a gain. OR: simply create a tiny action `pop-card-stack` that pops the top item and gives it to the player. This is the cleanest.

Read the codebase to find the best approach. The implementation subagent should check `shared/actions/effects/special-effect.ts` and decide.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Register in catalog.ts, commit**

```
feat: implement A102_Grocer (anytime buy goods from stack)
```

---

### Task 4: B83_MuddyPuddles (anytime buy goods with clay)

**BGA behavior:** On buy: place 5 goods (pig bottom, food, cattle, food, sheep top). At any time: pay 1 clay, take top good.

**Files:**
- Create: `shared/cards/B/B83_MuddyPuddles.ts`
- Create: `server/__tests__/B83_MuddyPuddles-session.test.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1: Write session test**

```typescript
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { createInitialState } from '../../shared/logic/state'
import { getCardStack } from '../../shared/cards/helpers/card-state'

describe('B83_MuddyPuddles session', () => {
  const makeSession = () => {
    const state = createInitialState(42)
    state.players = state.players.slice(0, 2)
    const session = new GameSession(state)
    session.devPlayCard(0, 'B83_MuddyPuddles')
    return session
  }

  it('onBuy places 5 goods on stack', () => {
    const session = makeSession()
    const stack = getCardStack(session.getState().state.players[0], 'B83_MuddyPuddles')
    expect(stack).toEqual(['boar', 'food', 'cattle', 'food', 'sheep'])
  })

  it('anytime: pay 1 clay, gain sheep (top)', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.clay = 3
    session.loadState(s)
    session.takeAction(0, 'farmland')
    const clayBefore = session.getState().state.players[0].resources.clay
    const sheepBefore = session.getState().state.players[0].resources.sheep
    session.takeAnytimeAction(0, 'B83-muddy-puddles-anytime')
    const after = session.getState().state.players[0]
    expect(after.resources.clay).toBe(clayBefore - 1)
    expect(after.resources.sheep).toBe(sheepBefore + 1)
    expect(getCardStack(after, 'B83_MuddyPuddles').length).toBe(4)
  })

  it('not available without clay', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].resources.clay = 0
    session.loadState(s)
    session.takeAction(0, 'farmland')
    const interaction = session.getState().interaction
    const anytime = interaction?.anytimeActions ?? []
    expect(anytime.find((a: any) => a.id === 'B83-muddy-puddles-anytime')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement B83_MuddyPuddles**

Same pattern as A102 but: MinorImprovement, cost `{ clay: 2 }`, stack `['boar', 'food', 'cattle', 'food', 'sheep']`, pay 1 clay per good. Use the same pop-and-gain mechanism chosen for A102.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Register in catalog.ts, commit**

```
feat: implement B83_MuddyPuddles (anytime buy goods with clay)
```

---

### Task 5: E40_BeeStatue (auto-gain on Day Laborer)

**BGA behavior:** On buy: place 5 goods (vegetable bottom, stone, grain, stone, grain top). When you use Day Laborer, automatically take top good. NOT anytime — triggered by action.

**Files:**
- Create: `shared/cards/E/E40_BeeStatue.ts`
- Create: `server/__tests__/E40_BeeStatue-session.test.ts`
- Modify: `shared/cards/catalog.ts`

- [ ] **Step 1: Write session test**

```typescript
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { createInitialState } from '../../shared/logic/state'
import { getCardStack } from '../../shared/cards/helpers/card-state'

describe('E40_BeeStatue session', () => {
  const makeSession = () => {
    const state = createInitialState(42)
    state.players = state.players.slice(0, 2)
    const session = new GameSession(state)
    session.devPlayCard(0, 'E40_BeeStatue')
    return session
  }

  it('onBuy places 5 goods on stack', () => {
    const session = makeSession()
    const stack = getCardStack(session.getState().state.players[0], 'E40_BeeStatue')
    expect(stack).toEqual(['vegetable', 'stone', 'grain', 'stone', 'grain'])
  })

  it('using day-laborer grants top good (grain)', () => {
    const session = makeSession()
    const grainBefore = session.getState().state.players[0].resources.grain
    session.takeAction(0, 'day-laborer')
    const after = session.getState().state.players[0]
    expect(after.resources.grain).toBe(grainBefore + 1)
    expect(getCardStack(after, 'E40_BeeStatue').length).toBe(4)
  })

  it('no trigger when stack is empty', () => {
    const session = makeSession()
    const s = session.getState().state
    s.players[0].cardStates = { E40_BeeStatue: { stack: [] } }
    session.loadState(s)
    const grainBefore = s.players[0].resources.grain
    session.takeAction(0, 'day-laborer')
    // day-laborer still gives its normal food, but no bonus from bee statue
    const after = session.getState().state.players[0]
    expect(getCardStack(after, 'E40_BeeStatue').length).toBe(0)
  })

  it('no trigger for other action spaces', () => {
    const session = makeSession()
    session.takeAction(0, 'farmland')
    const stack = getCardStack(session.getState().state.players[0], 'E40_BeeStatue')
    expect(stack.length).toBe(5) // unchanged
  })
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement E40_BeeStatue**

```typescript
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { pushToCardStack, getCardStack, popFromCardStack } from '../helpers/card-state'
import { gainResources } from '../../actions/effects/gain'
import type { Resource } from '../../game/types'

const CARD_ID = 'E40_BeeStatue'
const GOODS: string[] = ['vegetable', 'stone', 'grain', 'stone', 'grain']

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, [...GOODS])
  },
})

const dayLaborerListener: CardListenerRegistration = {
  id: 'E40-bee-statue-after-day-laborer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    // Pop and gain directly — this is an after-phase listener,
    // the context.player IS the acting player who owns the card
    const resource = popFromCardStack(context.player, CARD_ID)
    if (!resource) return
    gainResources(context.player, { [resource]: 1 } as Partial<Resource>)
    return {
      logKey: 'log.cardEffectGain',
      logParams: { cardId: CARD_ID, gain: { [resource]: 1 } },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(dayLaborerListener)

export const E40_BeeStatue = new MinorImprovement({
  id: CARD_ID,
  name: 'Bee Statue',
  deck: 'E',
  number: 40,
  cost: { clay: 2 },
  vp: 0,
  desc: ['Place 5 goods on this card. Each time you use the Day Laborer, take the top good.'],
  players: '1+',
})
```

Note: E40 uses a player-scope `after` listener (not anytime). The handler can mutate `context.player` directly since it runs during engine execution. Pop the resource and gain it immediately — no flow needed, just return a log result.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Register in catalog.ts, commit**

```
feat: implement E40_BeeStatue (auto-gain from stack on day-laborer)
```

---

### Task 6: i18n + full test suite

**Files:**
- Modify: `shared/i18n/en.ts`
- Modify: `shared/i18n/zh.ts`

- [ ] **Step 1: Add i18n keys**

In `shared/i18n/en.ts` cards section:
```typescript
A102_Grocer: { anytime: 'Grocer: Pay 1 Food → Buy top good' },
B83_MuddyPuddles: { anytime: 'Muddy Puddles: Pay 1 Clay → Take top good' },
```

In `shared/i18n/zh.ts` cards section:
```typescript
A102_Grocer: { anytime: '杂货商：付1食物 → 购买顶部商品' },
B83_MuddyPuddles: { anytime: '泥塘：付1黏土 → 取顶部商品' },
```

E40 doesn't need anytime label (it's not an anytime action).

- [ ] **Step 2: Run full test suite**

Run: `timeout 120 npx vitest run --exclude 'e2e-tests/**' --exclude 'scripts/**'`

- [ ] **Step 3: Commit**

```
feat: add i18n for holder card stack cards
```

---

## Implementation Order

1. **Task 1** — CardState type + helpers (prerequisite)
2. **Task 2** — Frontend rendering (prerequisite for visual verification)
3. **Task 3** — A102_Grocer (anytime + stack, most complex)
4. **Task 4** — B83_MuddyPuddles (same pattern, different cost)
5. **Task 5** — E40_BeeStatue (action-triggered, not anytime)
6. **Task 6** — i18n + full suite
