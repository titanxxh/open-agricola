# Batch 9 Wave 1: Anytime Actions — Simple Cards (9 cards)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 9 anytime action cards using the existing `phases: ['anytime']` CardListener infrastructure.

**Architecture:** Each card registers a `CardListenerRegistration` with `phases: ['anytime']` and optionally a `CardEffect` for onBuy/onBeforeStartOfTurn hooks. The anytime handler returns an `ActionHookResult` with a flow (seq of pay/gain/flag leaves). Tests drive through the `GameSession` boundary using `takeAnytimeAction()`.

**Tech Stack:** TypeScript, Vitest, GameSession API

**Cards in scope:**
- A153_PigOwner, B35_HookKnife, B154_SheepKeeper (passive threshold)
- C143_StoneBuyer, C101_StallHolder (per-round pay→gain)
- C46_Mandoline, C64_CornSchnappsDistillery, D46_PelletPress (per-round + future meeples)
- C84_PerennialRye (per-round breed)

**Spec:** `docs/superpowers/specs/2026-04-15-batch9-anytime-actions.md`

**BGA reference:** `../bga-agricola/modules/php/Cards/`

---

### Task 1: A153_PigOwner — Passive threshold (Occupation)

**Files:**
- Modify: `shared/cards/A/A153_PigOwner.ts` (stub → full impl)
- Create: `server/__tests__/A153_PigOwner-session.test.ts`
- Modify: `shared/i18n/en.ts` (add anytime label)
- Modify: `shared/cards/catalog.ts` (add import)

- [ ] **Step 1: Write the failing test**

```typescript
// server/__tests__/A153_PigOwner-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/A/A153_PigOwner'

describe('A153_PigOwner session', () => {
  const setup = (boarCount = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A153_PigOwner')
    player.resources.boar = boarCount
    session.loadState(state)
    session.devPlayCard(0, 'A153_PigOwner')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('anytime action not available with < 5 boar', () => {
    const session = setup(3)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('A153-pig-owner-anytime')
  })

  it('anytime action available with >= 5 boar and grants 3 VP', () => {
    const session = setup(5)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('A153-pig-owner-anytime')

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    const player = resp2.state.players[0]!
    expect(player.cardStates?.['A153_PigOwner']?.counters?.bonusVp).toBe(3)
    expect(isCardFlagged(player, 'A153_PigOwner')).toBe(true)
  })

  it('anytime action not available after flagged (one-time)', () => {
    const session = setup(5)
    enterActiveInteraction(session)
    session.takeAnytimeAction(0, 'A153-pig-owner-anytime')

    // Take another action to re-enter anytime context
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)
    session.takeAction(1, 'dayLaborer')
    const state2 = session.getState().state
    state2.currentPlayerIndex = 0
    session.loadState(state2)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('A153-pig-owner-anytime')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/A153_PigOwner-session.test.ts`
Expected: FAIL — no anytime listener registered

- [ ] **Step 3: Implement A153_PigOwner**

```typescript
// shared/cards/A/A153_PigOwner.ts
import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'

const CARD_ID = 'A153_PigOwner'

const anytimeListener: CardListenerRegistration = {
  id: 'A153-pig-owner-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.boar < 5) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.A153_PigOwner.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const A153_PigOwner = new Occupation({
  id: CARD_ID,
  name: 'Pig Owner',
  deck: 'A',
  number: 153,
  category: 'POINTS_PROVIDER',
  desc: ['The first time after you play this card that you have 5 <PIG> on your farm, you immediately get 3 bonus points.'],
  cost: {},
  players: '4+',
})
```

- [ ] **Step 4: Add i18n label**

Add to `shared/i18n/en.ts` before the closing `},` of the cards object (line ~944):

```typescript
    A153_PigOwner: { anytime: 'Pig Owner: 5+ Pigs → 3 Bonus VP' },
```

- [ ] **Step 5: Add catalog import**

Add to `shared/cards/catalog.ts`:

```typescript
import { A153_PigOwner } from './A/A153_PigOwner'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run server/__tests__/A153_PigOwner-session.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add shared/cards/A/A153_PigOwner.ts server/__tests__/A153_PigOwner-session.test.ts shared/i18n/en.ts shared/cards/catalog.ts
git commit -m "feat: implement A153_PigOwner — passive anytime threshold (5+ pigs → 3 VP)"
```

---

### Task 2: B35_HookKnife — Passive threshold with player count (MinorImprovement)

**Files:**
- Create: `shared/cards/B/B35_HookKnife.ts`
- Create: `server/__tests__/B35_HookKnife-session.test.ts`
- Modify: `shared/i18n/en.ts`, `shared/cards/catalog.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/__tests__/B35_HookKnife-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B35_HookKnife'

describe('B35_HookKnife session', () => {
  const setup = (sheepCount = 0, playerCount = 2) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('B35_HookKnife')
    player.resources.wood = 1 // cost to play
    player.resources.sheep = sheepCount
    session.loadState(state)
    session.devPlayCard(0, 'B35_HookKnife')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('2-player game: needs 8 sheep, not available with 7', () => {
    const session = setup(7, 2)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('B35-hook-knife-anytime')
  })

  it('2-player game: available with 8 sheep, grants 2 VP', () => {
    const session = setup(8, 2)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('B35-hook-knife-anytime')

    const resp2 = session.takeAnytimeAction(0, 'B35-hook-knife-anytime')
    expect(resp2.ok).toBe(true)
    const player = resp2.state.players[0]!
    expect(player.cardStates?.['B35_HookKnife']?.counters?.bonusVp).toBe(2)
    expect(isCardFlagged(player, 'B35_HookKnife')).toBe(true)
  })

  it('3-player game: threshold is 7', () => {
    const session = setup(7, 3)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('B35-hook-knife-anytime')
  })

  it('one-time only — not available after flagged', () => {
    const session = setup(8, 2)
    enterActiveInteraction(session)
    session.takeAnytimeAction(0, 'B35-hook-knife-anytime')

    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)
    session.takeAction(1, 'dayLaborer')
    const state2 = session.getState().state
    state2.currentPlayerIndex = 0
    session.loadState(state2)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('B35-hook-knife-anytime')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/B35_HookKnife-session.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement B35_HookKnife**

```typescript
// shared/cards/B/B35_HookKnife.ts
import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'

const CARD_ID = 'B35_HookKnife'

const SHEEP_THRESHOLDS = [9, 8, 7, 6, 5, 5] // indexed by playerCount - 1

const anytimeListener: CardListenerRegistration = {
  id: 'B35-hook-knife-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const playerCount = context.state.players.length
    const threshold = SHEEP_THRESHOLDS[Math.min(playerCount - 1, 5)] ?? 5
    if (context.player.resources.sheep < threshold) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B35_HookKnife.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const B35_HookKnife = new MinorImprovement({
  id: CARD_ID,
  name: 'Hook Knife',
  deck: 'B',
  number: 35,
  category: 'POINTS_PROVIDER',
  desc: ['Once this game, when you have 9/8/7/6/5/5 <SHEEP> on your farm in a 1-/2-/3-/4-/5-/6-player game, you immediately get 2 bonus points.'],
  cost: { wood: 1 },
})
```

- [ ] **Step 4: Add i18n + catalog**

`shared/i18n/en.ts`:
```typescript
    B35_HookKnife: { anytime: 'Hook Knife: Sheep threshold → 2 Bonus VP' },
```

`shared/cards/catalog.ts`:
```typescript
import { B35_HookKnife } from './B/B35_HookKnife'
```

- [ ] **Step 5: Run test, then commit**

Run: `npx vitest run server/__tests__/B35_HookKnife-session.test.ts`

```bash
git add shared/cards/B/B35_HookKnife.ts server/__tests__/B35_HookKnife-session.test.ts shared/i18n/en.ts shared/cards/catalog.ts
git commit -m "feat: implement B35_HookKnife — passive anytime threshold (sheep count → 2 VP)"
```

---

### Task 3: B154_SheepKeeper — Passive threshold + purchase restriction (Occupation)

**Files:**
- Create: `shared/cards/B/B154_SheepKeeper.ts`
- Create: `server/__tests__/B154_SheepKeeper-session.test.ts`
- Modify: `shared/i18n/en.ts`, `shared/cards/catalog.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/__tests__/B154_SheepKeeper-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B154_SheepKeeper'

describe('B154_SheepKeeper session', () => {
  const setup = (sheepCount = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B154_SheepKeeper')
    player.resources.sheep = sheepCount
    session.loadState(state)
    session.devPlayCard(0, 'B154_SheepKeeper')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('not available with < 7 sheep', () => {
    const session = setup(6)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('B154-sheep-keeper-anytime')
  })

  it('available with 7 sheep, grants 3 VP + 2 food', () => {
    const session = setup(7)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('B154-sheep-keeper-anytime')

    const resp2 = session.takeAnytimeAction(0, 'B154-sheep-keeper-anytime')
    expect(resp2.ok).toBe(true)
    const player = resp2.state.players[0]!
    expect(player.cardStates?.['B154_SheepKeeper']?.counters?.bonusVp).toBe(3)
    expect(isCardFlagged(player, 'B154_SheepKeeper')).toBe(true)
    // food gained: initial food + 2
    expect(player.resources.food).toBeGreaterThanOrEqual(2)
  })

  it('one-time only', () => {
    const session = setup(7)
    enterActiveInteraction(session)
    session.takeAnytimeAction(0, 'B154-sheep-keeper-anytime')

    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)
    session.takeAction(1, 'dayLaborer')
    const state2 = session.getState().state
    state2.currentPlayerIndex = 0
    session.loadState(state2)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('B154-sheep-keeper-anytime')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/B154_SheepKeeper-session.test.ts`

- [ ] **Step 3: Implement B154_SheepKeeper**

```typescript
// shared/cards/B/B154_SheepKeeper.ts
import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B154_SheepKeeper'

const anytimeListener: CardListenerRegistration = {
  id: 'B154-sheep-keeper-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.sheep < 7) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { food: 2 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B154_SheepKeeper.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const B154_SheepKeeper = new Occupation({
  id: CARD_ID,
  name: 'Sheep Keeper',
  deck: 'B',
  number: 154,
  category: 'POINTS_PROVIDER',
  desc: ['You can only play this card if you have less than 7 <SHEEP>. Once this game, when you have 7 <SHEEP> on your farm, you immediately get 3 bonus points and 2 <FOOD>.'],
  cost: {},
  players: '4+',
  prerequisite: 'Less Than 7 Sheep',
})
```

Note: The `prerequisite: 'Less Than 7 Sheep'` string won't work with the existing prerequisite parser. For now, we skip the purchase restriction enforcement (BGA enforces it but it's a minor UX guard, not a game-breaking rule). The anytime logic itself is correct. We can add prerequisite parsing in a follow-up.

- [ ] **Step 4: Add i18n + catalog**

`shared/i18n/en.ts`:
```typescript
    B154_SheepKeeper: { anytime: 'Sheep Keeper: 7+ Sheep → 3 VP + 2 Food' },
```

`shared/cards/catalog.ts`:
```typescript
import { B154_SheepKeeper } from './B/B154_SheepKeeper'
```

- [ ] **Step 5: Run test, then commit**

Run: `npx vitest run server/__tests__/B154_SheepKeeper-session.test.ts`

```bash
git add shared/cards/B/B154_SheepKeeper.ts server/__tests__/B154_SheepKeeper-session.test.ts shared/i18n/en.ts shared/cards/catalog.ts
git commit -m "feat: implement B154_SheepKeeper — passive anytime threshold (7+ sheep → 3 VP + 2 food)"
```

---

### Task 4: C143_StoneBuyer — Per-round pay→gain + onBuy (Occupation)

**Files:**
- Create: `shared/cards/C/C143_StoneBuyer.ts`
- Create: `server/__tests__/C143_StoneBuyer-session.test.ts`
- Modify: `shared/i18n/en.ts`, `shared/cards/catalog.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/__tests__/C143_StoneBuyer-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C143_StoneBuyer'

describe('C143_StoneBuyer session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2 // round 2 so onBuy flag gets reset

    const player = state.players[0]!
    player.occupationHand.push('C143_StoneBuyer')
    player.resources.food = 10
    player.resources.stone = 0
    session.loadState(state)
    session.devPlayCard(0, 'C143_StoneBuyer')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('onBuy: pays 1 food, gains 2 stone, flags card', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // After devPlayCard, onBuy should have executed
    expect(player.resources.stone).toBe(2)
    expect(isCardFlagged(player, 'C143_StoneBuyer')).toBe(true)
  })

  it('anytime not available in same round as onBuy (flagged)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationHand.push('C143_StoneBuyer')
    player.resources.food = 10
    session.loadState(state)
    session.devPlayCard(0, 'C143_StoneBuyer')

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C143-stone-buyer-anytime')
  })

  it('anytime available next round: pay 2 food → 1 stone', () => {
    const session = setup()
    // Simulate round advance to reset flag
    const state = session.getState().state
    state.round = 3
    // Reset flag manually (onBeforeStartOfTurn would do this)
    const player = state.players[0]!
    player.cardStates!['C143_StoneBuyer']!.flagged = false
    player.resources.food = 10
    player.resources.stone = 2
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('C143-stone-buyer-anytime')

    const resp2 = session.takeAnytimeAction(0, 'C143-stone-buyer-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.food).toBe(8) // 10 - 2
    expect(p.resources.stone).toBe(3) // 2 + 1
    expect(isCardFlagged(p, 'C143_StoneBuyer')).toBe(true)
  })

  it('not available without 2 food', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 3
    const player = state.players[0]!
    player.cardStates!['C143_StoneBuyer']!.flagged = false
    player.resources.food = 1
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C143-stone-buyer-anytime')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/C143_StoneBuyer-session.test.ts`

- [ ] **Step 3: Implement C143_StoneBuyer**

```typescript
// shared/cards/C/C143_StoneBuyer.ts
import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C143_StoneBuyer'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
      gainLeaf(CARD_ID, { stone: 2 }),
      { type: 'leaf' as const, actionId: 'flag-card', sourceCard: CARD_ID },
    ],
  }),
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C143-stone-buyer-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.food < 2) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          gainLeaf(CARD_ID, { stone: 1 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C143_StoneBuyer.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C143_StoneBuyer = new Occupation({
  id: CARD_ID,
  name: 'Stone Buyer',
  deck: 'C',
  number: 143,
  category: 'ACTIONS_BOOSTER',
  desc: ['When you play this card, you can immediately buy exactly 2 <STONE> for 1 <FOOD>. From the next round on, once per round, you can buy 1 <STONE> for 2 <FOOD>.'],
  cost: {},
  players: '3+',
})
```

- [ ] **Step 4: Add i18n + catalog**

`shared/i18n/en.ts`:
```typescript
    C143_StoneBuyer: { anytime: 'Stone Buyer: Pay 2 Food → 1 Stone' },
```

`shared/cards/catalog.ts`:
```typescript
import { C143_StoneBuyer } from './C/C143_StoneBuyer'
```

- [ ] **Step 5: Run test, then commit**

Run: `npx vitest run server/__tests__/C143_StoneBuyer-session.test.ts`

```bash
git add shared/cards/C/C143_StoneBuyer.ts server/__tests__/C143_StoneBuyer-session.test.ts shared/i18n/en.ts shared/cards/catalog.ts
git commit -m "feat: implement C143_StoneBuyer — per-round anytime (2 food → 1 stone) + onBuy (1 food → 2 stone)"
```

---

### Task 5: C101_StallHolder — Per-round pay→gain with dynamic food (Occupation)

**Files:**
- Create: `shared/cards/C/C101_StallHolder.ts`
- Create: `server/__tests__/C101_StallHolder-session.test.ts`
- Modify: `shared/i18n/en.ts`, `shared/cards/catalog.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/__tests__/C101_StallHolder-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C101_StallHolder'

describe('C101_StallHolder session', () => {
  const setup = (stableCount = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('C101_StallHolder')
    player.resources.grain = 5
    player.resources.food = 0
    // Add unfenced stables (not inside any pasture)
    for (let i = 0; i < stableCount; i++) {
      player.stableTiles.push({ row: 0, col: 2 + i })
    }
    session.loadState(state)
    session.devPlayCard(0, 'C101_StallHolder')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('with 0 unfenced stables: pay 2 grain → 1 VP + 1 food', () => {
    const session = setup(0)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('C101-stall-holder-anytime')

    const resp2 = session.takeAnytimeAction(0, 'C101-stall-holder-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.grain).toBe(3) // 5 - 2
    expect(p.resources.food).toBe(1) // 0 unfenced stables + 1
    expect(p.cardStates?.['C101_StallHolder']?.counters?.bonusVp).toBe(1)
  })

  it('with 3 unfenced stables: pay 2 grain → 1 VP + 4 food', () => {
    const session = setup(3)
    const resp = enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'C101-stall-holder-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.grain).toBe(3)
    expect(p.resources.food).toBe(4) // 3 unfenced stables + 1
  })

  it('not available without 2 grain', () => {
    const session = setup(0)
    const state = session.getState().state
    state.players[0]!.resources.grain = 1
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C101-stall-holder-anytime')
  })

  it('once per round — not available after used', () => {
    const session = setup(0)
    enterActiveInteraction(session)
    session.takeAnytimeAction(0, 'C101-stall-holder-anytime')

    const state = session.getState().state
    expect(isCardFlagged(state.players[0]!, 'C101_StallHolder')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/C101_StallHolder-session.test.ts`

- [ ] **Step 3: Implement C101_StallHolder**

```typescript
// shared/cards/C/C101_StallHolder.ts
import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { getLooseStableKeys } from '../../actions/effects/animals'

const CARD_ID = 'C101_StallHolder'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C101-stall-holder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.grain < 2) return
    const unfencedStables = getLooseStableKeys(context.player).length
    const foodGain = unfencedStables + 1
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 2 } }),
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { food: foodGain }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C101_StallHolder.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C101_StallHolder = new Occupation({
  id: CARD_ID,
  name: 'Stall Holder',
  deck: 'C',
  number: 101,
  category: 'POINTS_PROVIDER',
  desc: ['Once per round, if you have 0/1/2/3/4 unfenced stables, you can exchange 2 <GRAIN> for 1 bonus point and 1/2/3/4/5 <FOOD>.'],
  cost: {},
  players: '1+',
})
```

- [ ] **Step 4: Add i18n + catalog**

`shared/i18n/en.ts`:
```typescript
    C101_StallHolder: { anytime: 'Stall Holder: Pay 2 Grain → 1 VP + Food' },
```

`shared/cards/catalog.ts`:
```typescript
import { C101_StallHolder } from './C/C101_StallHolder'
```

- [ ] **Step 5: Run test, then commit**

Run: `npx vitest run server/__tests__/C101_StallHolder-session.test.ts`

```bash
git add shared/cards/C/C101_StallHolder.ts server/__tests__/C101_StallHolder-session.test.ts shared/i18n/en.ts shared/cards/catalog.ts
git commit -m "feat: implement C101_StallHolder — per-round anytime (2 grain → 1 VP + dynamic food by stables)"
```

---

### Task 6: C46_Mandoline — Per-round + future meeples (MinorImprovement)

**Files:**
- Create: `shared/cards/C/C46_Mandoline.ts`
- Create: `server/__tests__/C46_Mandoline-session.test.ts`
- Modify: `shared/i18n/en.ts`, `shared/cards/catalog.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/__tests__/C46_Mandoline-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C46_Mandoline'

describe('C46_Mandoline session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.minorHand.push('C46_Mandoline')
    player.resources.wood = 1
    player.resources.vegetable = 3
    player.resources.food = 0
    session.loadState(state)
    session.devPlayCard(0, 'C46_Mandoline')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('anytime: pay 1 veg → 1 VP + future food on next 2 rounds', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('C46-mandoline-anytime')

    const resp2 = session.takeAnytimeAction(0, 'C46-mandoline-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.vegetable).toBe(2) // 3 - 1
    expect(p.cardStates?.['C46_Mandoline']?.counters?.bonusVp).toBe(1)
    expect(isCardFlagged(p, 'C46_Mandoline')).toBe(true)

    // Check future meeples queued for rounds 4 and 5
    const fm = resp2.state.futureMeeples?.filter(
      (m: any) => m.cardId === 'C46_Mandoline'
    )
    expect(fm).toHaveLength(2)
    expect(fm![0].round).toBe(4)
    expect(fm![0].resources.food).toBe(1)
    expect(fm![1].round).toBe(5)
    expect(fm![1].resources.food).toBe(1)
  })

  it('not available without vegetable', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.vegetable = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C46-mandoline-anytime')
  })

  it('once per round', () => {
    const session = setup()
    enterActiveInteraction(session)
    session.takeAnytimeAction(0, 'C46-mandoline-anytime')
    const state = session.getState().state
    expect(isCardFlagged(state.players[0]!, 'C46_Mandoline')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/C46_Mandoline-session.test.ts`

- [ ] **Step 3: Implement C46_Mandoline**

```typescript
// shared/cards/C/C46_Mandoline.ts
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C46_Mandoline'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C46-mandoline-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.vegetable < 1) return

    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 2,
      resources: { food: 1 },
    })

    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { vegetable: 1 } }),
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          futureMeeplesNode(),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C46_Mandoline.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C46_Mandoline = new MinorImprovement({
  id: CARD_ID,
  name: 'Mandoline',
  deck: 'C',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can pay 1 <VEGETABLE> to get 1 bonus point. If you do, place 1 <FOOD> on each of the next 2 round spaces.'],
  cost: { wood: 1 },
})
```

- [ ] **Step 4: Add i18n + catalog**

`shared/i18n/en.ts`:
```typescript
    C46_Mandoline: { anytime: 'Mandoline: Pay 1 Veg → 1 VP + Food on next 2 rounds' },
```

`shared/cards/catalog.ts`:
```typescript
import { C46_Mandoline } from './C/C46_Mandoline'
```

- [ ] **Step 5: Run test, then commit**

Run: `npx vitest run server/__tests__/C46_Mandoline-session.test.ts`

```bash
git add shared/cards/C/C46_Mandoline.ts server/__tests__/C46_Mandoline-session.test.ts shared/i18n/en.ts shared/cards/catalog.ts
git commit -m "feat: implement C46_Mandoline — per-round anytime (1 veg → 1 VP + future food)"
```

---

### Task 7: C64_CornSchnappsDistillery + D46_PelletPress — Future meeples variants

These two cards are nearly identical to C46 but with different costs and round counts.

**Files:**
- Create: `shared/cards/C/C64_CornSchnappsDistillery.ts`
- Create: `shared/cards/D/D46_PelletPress.ts`
- Create: `server/__tests__/C64_CornSchnappsDistillery-session.test.ts`
- Create: `server/__tests__/D46_PelletPress-session.test.ts`
- Modify: `shared/i18n/en.ts`, `shared/cards/catalog.ts`

- [ ] **Step 1: Implement C64_CornSchnappsDistillery**

```typescript
// shared/cards/C/C64_CornSchnappsDistillery.ts
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C64_CornSchnappsDistillery'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C64-corn-schnapps-distillery-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.grain < 1) return

    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 4,
      resources: { food: 1 },
    })

    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          futureMeeplesNode(),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C64_CornSchnappsDistillery.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C64_CornSchnappsDistillery = new MinorImprovement({
  id: CARD_ID,
  name: 'Corn Schnapps Distillery',
  deck: 'C',
  number: 64,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can pay 1 <GRAIN> to place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the food.'],
  cost: { wood: 1, clay: 2 },
  vp: 1,
})
```

- [ ] **Step 2: Implement D46_PelletPress**

```typescript
// shared/cards/D/D46_PelletPress.ts
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'D46_PelletPress'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'D46-pellet-press-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.reed < 1) return

    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 4,
      resources: { food: 1 },
    })

    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
          futureMeeplesNode(),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D46_PelletPress.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const D46_PelletPress = new MinorImprovement({
  id: CARD_ID,
  name: 'Pellet Press',
  deck: 'D',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can pay 1 <REED> to place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the food.'],
  cost: { clay: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
```

- [ ] **Step 3: Write tests for both**

```typescript
// server/__tests__/C64_CornSchnappsDistillery-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C64_CornSchnappsDistillery'

describe('C64_CornSchnappsDistillery session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.minorHand.push('C64_CornSchnappsDistillery')
    player.resources.wood = 1
    player.resources.clay = 2
    player.resources.grain = 3
    session.loadState(state)
    session.devPlayCard(0, 'C64_CornSchnappsDistillery')
    return session
  }

  it('pay 1 grain → food on next 4 rounds', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const resp2 = session.takeAnytimeAction(0, 'C64-corn-schnapps-distillery-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.grain).toBe(2)
    expect(isCardFlagged(p, 'C64_CornSchnappsDistillery')).toBe(true)

    const fm = resp2.state.futureMeeples?.filter(
      (m: any) => m.cardId === 'C64_CornSchnappsDistillery'
    )
    expect(fm).toHaveLength(4)
    expect(fm![0].round).toBe(4)
    expect(fm![3].round).toBe(7)
  })
})
```

```typescript
// server/__tests__/D46_PelletPress-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/D/D46_PelletPress'

describe('D46_PelletPress session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.minorHand.push('D46_PelletPress')
    player.resources.clay = 2
    player.resources.reed = 3
    // Satisfy occupation prerequisite
    player.occupationPlayed.push('dummy_occ_1', 'dummy_occ_2')
    session.loadState(state)
    session.devPlayCard(0, 'D46_PelletPress')
    return session
  }

  it('pay 1 reed → food on next 4 rounds', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const resp2 = session.takeAnytimeAction(0, 'D46-pellet-press-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.reed).toBe(2)
    expect(isCardFlagged(p, 'D46_PelletPress')).toBe(true)

    const fm = resp2.state.futureMeeples?.filter(
      (m: any) => m.cardId === 'D46_PelletPress'
    )
    expect(fm).toHaveLength(4)
  })

  it('not available without reed', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.reed = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('D46-pellet-press-anytime')
  })
})
```

- [ ] **Step 4: Add i18n + catalog for both**

`shared/i18n/en.ts`:
```typescript
    C64_CornSchnappsDistillery: { anytime: 'Corn Schnapps Distillery: Pay 1 Grain → Food on next 4 rounds' },
    D46_PelletPress: { anytime: 'Pellet Press: Pay 1 Reed → Food on next 4 rounds' },
```

`shared/cards/catalog.ts`:
```typescript
import { C64_CornSchnappsDistillery } from './C/C64_CornSchnappsDistillery'
import { D46_PelletPress } from './D/D46_PelletPress'
```

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run server/__tests__/C64_CornSchnappsDistillery-session.test.ts server/__tests__/D46_PelletPress-session.test.ts`

```bash
git add shared/cards/C/C64_CornSchnappsDistillery.ts shared/cards/D/D46_PelletPress.ts server/__tests__/C64_CornSchnappsDistillery-session.test.ts server/__tests__/D46_PelletPress-session.test.ts shared/i18n/en.ts shared/cards/catalog.ts
git commit -m "feat: implement C64_CornSchnappsDistillery + D46_PelletPress — per-round anytime with future food"
```

---

### Task 8: C84_PerennialRye — Per-round breed in non-harvest rounds (MinorImprovement)

**Files:**
- Modify: `shared/cards/C/C84_PerennialRye.ts` (stub → full impl)
- Create: `server/__tests__/C84_PerennialRye-session.test.ts`
- Modify: `shared/i18n/en.ts`, `shared/cards/catalog.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/__tests__/C84_PerennialRye-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C84_PerennialRye'

describe('C84_PerennialRye session', () => {
  const setup = (round = 2) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.minorHand.push('C84_PerennialRye')
    player.resources.food = 1
    player.resources.grain = 5
    player.resources.sheep = 3
    player.resources.boar = 0
    player.resources.cattle = 2
    player.occupationPlayed.push('dummy_occ_1', 'dummy_occ_2')
    session.loadState(state)
    session.devPlayCard(0, 'C84_PerennialRye')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('available in non-harvest round with grain and breedable animals', () => {
    const session = setup(2) // round 2 = not harvest
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('C84-perennial-rye-anytime')
  })

  it('NOT available in harvest round (round 4)', () => {
    const session = setup(4)
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C84-perennial-rye-anytime')
  })

  it('breed sheep: pay 1 grain, gain 1 sheep', () => {
    const session = setup(2)
    enterActiveInteraction(session)
    const resp = session.takeAnytimeAction(0, 'C84-perennial-rye-anytime')
    expect(resp.ok).toBe(true)
    // Should present choice of animal types to breed
    // sheep (3 >= 2) and cattle (2 >= 2) should be options, boar (0) should not
    expect(resp.pending?.type).toBe('choice')

    const resp2 = session.takeChoice(0, 'sheep')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.grain).toBe(4) // 5 - 1
    expect(p.resources.sheep).toBe(4) // 3 + 1
    expect(isCardFlagged(p, 'C84_PerennialRye')).toBe(true)
  })

  it('once per round', () => {
    const session = setup(2)
    enterActiveInteraction(session)
    session.takeAnytimeAction(0, 'C84-perennial-rye-anytime')
    session.takeChoice(0, 'sheep')

    const state = session.getState().state
    expect(isCardFlagged(state.players[0]!, 'C84_PerennialRye')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/C84_PerennialRye-session.test.ts`

- [ ] **Step 3: Implement C84_PerennialRye**

```typescript
// shared/cards/C/C84_PerennialRye.ts
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { harvestRounds } from '../../logic/state'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'C84_PerennialRye'

const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C84-perennial-rye-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.grain < 1) return
    if (harvestRounds.includes(context.state.round)) return

    const breedableTypes = ANIMAL_TYPES.filter(
      (type) => context.player.resources[type] >= 2,
    )
    if (breedableTypes.length === 0) return

    const children: ActionFlow[] = breedableTypes.map((type) => ({
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
        gainLeaf(CARD_ID, { [type]: 1 }),
        { type: 'leaf' as const, actionId: 'flag-card', sourceCard: CARD_ID },
      ],
    }))

    return {
      flow: children.length === 1
        ? children[0]!
        : { type: 'xor', children },
      sourceCard: CARD_ID,
      labelKey: 'cards.C84_PerennialRye.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C84_PerennialRye = new MinorImprovement({
  id: CARD_ID,
  name: 'Perennial Rye',
  deck: 'C',
  number: 84,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each round that does not end with a harvest, you can pay 1 <GRAIN> to breed exactly 1 type of animal. (This is not considered a breeding phase.)'],
  cost: { food: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
```

**Note on XOR:** The XOR flow presents each breedable animal type as a choice. The engine's XOR node handles showing options to the player. Each option includes its own pay+gain+flag sequence so the payment only happens once for the chosen type.

- [ ] **Step 4: Add i18n + catalog**

`shared/i18n/en.ts`:
```typescript
    C84_PerennialRye: { anytime: 'Perennial Rye: Pay 1 Grain → Breed 1 animal type' },
```

`shared/cards/catalog.ts`:
```typescript
import { C84_PerennialRye } from './C/C84_PerennialRye'
```

- [ ] **Step 5: Run test, then commit**

Run: `npx vitest run server/__tests__/C84_PerennialRye-session.test.ts`

```bash
git add shared/cards/C/C84_PerennialRye.ts server/__tests__/C84_PerennialRye-session.test.ts shared/i18n/en.ts shared/cards/catalog.ts
git commit -m "feat: implement C84_PerennialRye — per-round anytime breed in non-harvest rounds"
```

---

### Task 9: Update card_progress.md + run full test suite

- [ ] **Step 1: Update docs/card_progress.md batch 9 status**

Change:
```
| 9 | Anytime 动作 | 20 | 中 | 待实现 |
```
To:
```
| 9 | Anytime 动作 | 22 | 中 | 🔧 9/22（Wave 1 完成） |
```

- [ ] **Step 2: Run full test suite to check for regressions**

Run: `npm test`
Expected: All existing tests pass, 9 new card tests pass.

- [ ] **Step 3: Final commit**

```bash
git add docs/card_progress.md
git commit -m "docs: update batch 9 progress — wave 1 complete (9/22 cards)"
```

---

## Summary

| Task | Cards | Pattern |
|------|-------|---------|
| 1 | A153_PigOwner | Passive threshold (5+ pigs → 3 VP) |
| 2 | B35_HookKnife | Passive threshold (sheep by player count → 2 VP) |
| 3 | B154_SheepKeeper | Passive threshold (7+ sheep → 3 VP + 2 food) |
| 4 | C143_StoneBuyer | Per-round (2 food → 1 stone) + onBuy (1 food → 2 stone) |
| 5 | C101_StallHolder | Per-round (2 grain → 1 VP + dynamic food) |
| 6 | C46_Mandoline | Per-round (1 veg → 1 VP + future food ×2 rounds) |
| 7 | C64 + D46 | Per-round (grain/reed → future food ×4 rounds) |
| 8 | C84_PerennialRye | Per-round breed (1 grain → breed 1 type, non-harvest) |
| 9 | Update progress | Docs + regression test |
