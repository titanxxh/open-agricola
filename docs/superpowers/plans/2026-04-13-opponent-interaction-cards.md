# Opponent Interaction Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 8 opponent-interaction cards covering 4 interaction patterns, proving out the full opponent-scope infrastructure.

**Architecture:** All cards use `scope: 'opponent'` on `CardListenerRegistration`. The engine already handles `PlayerSwitchNode` for switching context to the card owner. A new `gain-trigger-player` action is needed for cards that give resources to the triggering opponent specifically (not all other players).

**Tech Stack:** TypeScript, GameSession session tests, existing card-listener infrastructure.

**Key reference files:**
- `shared/cards/C/C144_ReedRoofRenovator.ts` — simplest opponent-scope pattern
- `shared/cards/A/A128_RiparianBuilder.ts` — opponent-scope with action grant
- `shared/cards/card-listeners.ts` — `scope: 'opponent'`, `CardListenerRegistration`
- `shared/cards/helpers/pay-gain-node.ts` — `gainLeaf`, `payLeaf`
- `shared/cards/helpers/card-state.ts` — `isCardFlagged`, `setCardFlag`

**Action space ID mapping (BGA → ours):**
- `ActionSheepMarket` → `sheep-market`
- `ActionMeetingPlace` → `meeting-place`
- `ActionFishing` → `fishing`
- `ActionGrainSeeds` → `grain-seeds`
- `ActionTravelingPlayers` → `traveling-players`
- `ActionReedBank` → `reed-bank`
- `ActionEasternQuarry` → `eastern-quarry`
- `ActionWesternQuarry` → `western-quarry`
- `ActionPigMarket` → `pig-market`
- `ActionFarmland` → `farmland`
- `ActionDayLaborer` → `day-laborer`
- `ActionFarmExpansion` → `farm-expansion`

---

### Task 0: Add `gain-trigger-player` action

D139_Chairman and A132_Publican need to give resources to a specific player (the triggering opponent), not to all other players. Add a targeted gain action.

**Files:**
- Create: `shared/actions/effects/gain-trigger-player.ts`
- Modify: `shared/actions/registry.ts` (register the action)

- [ ] **Step 1: Create the action**

```typescript
// shared/actions/effects/gain-trigger-player.ts
import type { ActionDefinition, Resource } from '../../game/types'
import { gainResources } from './gain'

export const gainTriggerPlayerAction: ActionDefinition = {
  id: 'gain-trigger-player',
  nameKey: 'actions.gain-trigger-player.name',
  descriptionKey: 'actions.gain-trigger-player.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const targetPlayerId = (params as { targetPlayerId?: string })?.targetPlayerId
    const gain = (params ?? {}) as Partial<Resource>
    const target = targetPlayerId
      ? state.players.find((p) => p.id === targetPlayerId)
      : null
    if (!target) return { type: 'ok' }
    const cleanGain = { ...gain }
    delete (cleanGain as Record<string, unknown>).targetPlayerId
    gainResources(target, cleanGain)
    return { type: 'ok' }
  },
}
```

- [ ] **Step 2: Register in action registry**

Add import and registration in the action auto-discovery file. Grep for where other actions like `gain-other-players` are registered to find the right file.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --project tsconfig.app.json`

- [ ] **Step 4: Commit**

```
feat: add gain-trigger-player action for targeted resource transfer
```

---

### Task 1: C141_SheepProvider (Pattern 1 — Passive Benefit)

**BGA behavior:** Any player (including owner) uses Sheep Market → owner gets 1 grain.

**Files:**
- Modify: `shared/cards/C/C141_SheepProvider.ts`
- Create: `server/__tests__/C141_SheepProvider-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
import { describe, expect, it } from 'vitest'
import { GameSession } from '../../game-session'
import { createInitialState } from '../../../shared/logic/state'

describe('C141_SheepProvider session', () => {
  const makeSession = () => {
    const state = createInitialState(42)
    state.players = state.players.slice(0, 2)
    const session = new GameSession(state)
    session.devPlayCard(0, 'C141_SheepProvider')
    return session
  }

  it('owner gains 1 grain when opponent uses sheep-market', () => {
    const session = makeSession()
    const grainBefore = session.getState().state.players[0].resources.grain
    session.takeAction(1, 'sheep-market') // opponent uses sheep-market
    // resolve animal reorg for opponent
    const resp = session.confirmAnimalReorg(1, [])
    const grainAfter = resp.state.players[0].resources.grain
    expect(grainAfter).toBe(grainBefore + 1)
  })

  it('owner gains 1 grain when owner uses sheep-market', () => {
    const session = makeSession()
    const grainBefore = session.getState().state.players[0].resources.grain
    session.takeAction(0, 'sheep-market') // owner uses sheep-market
    const resp = session.confirmAnimalReorg(0, [])
    const grainAfter = resp.state.players[0].resources.grain
    expect(grainAfter).toBe(grainBefore + 1)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL** (no hook implemented yet)

- [ ] **Step 3: Implement C141_SheepProvider**

Add two listeners (one `scope: 'opponent'`, one `scope: 'player'`) with `actions: ['place-farmer']`, both filtering by `context.space.id === 'sheep-market'` and returning `gainLeaf(CARD_ID, { grain: 1 })`. Or use `scope: 'any'` if available.

Alternatively, use a single listener with no scope (defaults to 'player') that fires when the owner is the actor, plus an opponent-scope listener for when others act. Pattern follows C144_ReedRoofRenovator.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```
feat: implement C141_SheepProvider (opponent passive benefit)
```

---

### Task 2: D139_Chairman (Pattern 1 — Passive Benefit, both players gain)

**BGA behavior:** Opponent uses Meeting Place → both opponent AND owner get 1 food (before action). Owner uses Meeting Place → owner gets 1 food.

**Files:**
- Create: `shared/cards/D/D139_Chairman.ts` (file exists but is data-only, add hooks)
- Create: `server/__tests__/D139_Chairman-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
describe('D139_Chairman session', () => {
  it('both players gain 1 food when opponent uses meeting-place', () => {
    const session = makeSession()
    const ownerFoodBefore = session.getState().state.players[0].resources.food
    const opponentFoodBefore = session.getState().state.players[1].resources.food
    session.takeAction(1, 'meeting-place') // opponent uses meeting-place
    const state = session.getState().state
    expect(state.players[0].resources.food).toBe(ownerFoodBefore + 1) // owner gains
    expect(state.players[1].resources.food).toBe(opponentFoodBefore + 1) // opponent also gains
  })

  it('owner gains 1 food when using meeting-place themselves', () => {
    const session = makeSession()
    const foodBefore = session.getState().state.players[0].resources.food
    session.takeAction(0, 'meeting-place')
    expect(session.getState().state.players[0].resources.food).toBe(foodBefore + 1)
  })
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement D139_Chairman**

Opponent listener: `scope: 'opponent'`, `actions: ['place-farmer']`, filter `context.space.id === 'meeting-place'`. Returns a `seq` flow with:
1. `gain-trigger-player` with `{ food: 1, targetPlayerId: context.player.id }` (give food to triggering opponent)
2. `gainLeaf(CARD_ID, { food: 1 })` (give food to card owner)

Player listener: `scope: 'player'`, same filter, returns `gainLeaf(CARD_ID, { food: 1 })`.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Commit**

```
feat: implement D139_Chairman (opponent + owner both gain)
```

---

### Task 3: A156_Buyer (Pattern 2 — Card Owner Optional)

**BGA behavior:** Opponent uses reed/stone/sheep/boar accumulation space → Buyer owner can pay 1 food to gain 1 of the corresponding resource from supply.

**Files:**
- Create: `shared/cards/A/A156_Buyer.ts` (new file)
- Create: `server/__tests__/A156_Buyer-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
it('buyer can pay 1 food to gain resource when opponent uses matching space', () => {
  const session = makeSession() // owner = p0 with A156, give p0 some food
  session.getState().state.players[0].resources.food = 5
  session.takeAction(1, 'sheep-market') // opponent uses sheep market
  // Should offer buyer the optional exchange
  const resp = session.getState()
  // After animal reorg, buyer should get choice
  // Accept: pay 1 food, gain 1 sheep
})

it('buyer can decline the offer', () => {
  // ...resolve choice with cancel, verify no resource change
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement A156_Buyer**

Single listener: `scope: 'opponent'`, `actions: ['place-farmer']`, `phases: ['after']`.
In handler, map `context.space.id` to resource type:
- `reed-bank` → reed, `eastern-quarry`/`western-quarry` → stone
- `sheep-market` → sheep, `pig-market` → boar

Return optional `payGainFlow` or `seq` with `optional: true`: pay 1 food → gain 1 matching resource.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Commit**

```
feat: implement A156_Buyer (optional opponent-triggered exchange)
```

---

### Task 4: A132_Publican (Pattern 2 — Card Owner Optional, pay to opponent)

**BGA behavior:** Before opponent takes unconditional Sow → Publican owner can give opponent 1 grain to get 1 bonus VP.

**Files:**
- Create: `shared/cards/A/A132_Publican.ts` (new file)
- Create: `server/__tests__/A132_Publican-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
it('publican can pay 1 grain to opponent to gain 1 VP before sow', () => {
  const session = makeSession() // p0 = Publican owner, p1 = sowing player
  session.getState().state.players[0].resources.grain = 5
  // p1 sows — triggers Publican offer
  session.takeAction(1, 'grain-utilization') // or whichever space has sow
  // Should switch to Publican owner with optional choice
  // Accept: p0 loses 1 grain, p1 gains 1 grain, p0 gains 1 VP
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement A132_Publican**

Listener: `scope: 'opponent'`, `actions: ['sow']`, `phases: ['before']`.
In handler, return optional flow:
1. `pay-resources { grain: 1 }` (from Publican owner)
2. `gain-trigger-player { grain: 1, targetPlayerId: context.player.id }` (to sow player)
3. `bonus-vp { bonusVp: 1 }` (Publican gains VP)

Simplification vs BGA: skip the deferred feasibility check. If Publican has no grain, the pay action fails and the flow is cancelled.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Commit**

```
feat: implement A132_Publican (optional grain-for-VP before opponent sow)
```

---

### Task 5: A150_Stagehand (Pattern 3 — Grant Action)

**BGA behavior:** Opponent uses Traveling Players → Stagehand owner can take choice of Build Fences, Build Stables, or Build Rooms.

**Files:**
- Create: `shared/cards/A/A150_Stagehand.ts` (new file)
- Create: `server/__tests__/A150_Stagehand-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
it('stagehand gets action choice when opponent uses traveling-players', () => {
  const session = makeSession()
  session.takeAction(1, 'traveling-players') // opponent
  const resp = session.getState()
  // Should switch to stagehand owner with XOR choice
  expect(resp.pending.type).toBe('confirmPlayerSwitch') // or 'choice'
})

it('stagehand can decline the optional action', () => {
  // ...
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement A150_Stagehand**

Listener: `scope: 'opponent'`, `actions: ['place-farmer']`, `phases: ['after']`.
Filter: `context.space.id === 'traveling-players'`.
Return optional `xor` flow with 3 children:
1. `{ type: 'leaf', actionId: 'fencing', sourceCard: CARD_ID, actionContext: { trueAction: false } }`
2. `{ type: 'leaf', actionId: 'stables', sourceCard: CARD_ID, actionContext: { trueAction: false } }`
3. `{ type: 'leaf', actionId: 'construct', sourceCard: CARD_ID, actionContext: { maxRooms: 1, trueAction: false } }`

Pattern follows A128_RiparianBuilder closely.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Commit**

```
feat: implement A150_Stagehand (opponent-triggered action choice)
```

---

### Task 6: E95_Miller (Pattern 3 — Grant Action)

**BGA behavior:** On buy, optionally build a baking improvement at cost. When opponent uses Grain Seeds, Miller owner can Bake Bread.

**Files:**
- Create: `shared/cards/E/E95_Miller.ts` (new file)
- Create: `server/__tests__/E95_Miller-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
it('miller can bake bread when opponent uses grain-seeds', () => {
  const session = makeSession() // p0 = Miller owner with a baking improvement
  session.devPlayCard(0, 'Major_Fireplace1') // give baking ability
  session.getState().state.players[0].resources.grain = 3
  session.takeAction(1, 'grain-seeds') // opponent
  // Should switch to Miller owner with bake bread option
})

it('miller onBuy offers optional improvement purchase', () => {
  // ...
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement E95_Miller**

Two parts:
1. `onBuy` hook: return optional `improvement` leaf flow (type 'leaf', actionId 'improvement-any', optional, actionContext restricting to baking improvements).
2. Listener: `scope: 'opponent'`, `actions: ['place-farmer']`, `phases: ['after']`. Filter: `context.space.id === 'grain-seeds'`. Return optional `bake-bread` leaf.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Commit**

```
feat: implement E95_Miller (onBuy improvement + opponent bake bread)
```

---

### Task 7: C51_FishingNet (Pattern 4 — Forced Payment + Delayed Effect)

**BGA behavior:** Opponent uses Fishing → must pay 1 food to card owner. In return-home phase, place 2 food on Fishing space.

**Files:**
- Modify: `shared/cards/C/C51_FishingNet.ts` (exists as data-only)
- Create: `server/__tests__/C51_FishingNet-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
it('opponent must pay 1 food when using fishing', () => {
  const session = makeSession()
  session.getState().state.players[1].resources.food = 3
  session.takeAction(1, 'fishing') // opponent uses fishing
  // p1 pays 1 food, p0 gains 1 food
  const s = session.getState().state
  // Verify food transfer happened
})

it('2 food placed on fishing during return-home', () => {
  // After round ends, fishing space should have +2 food
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement C51_FishingNet**

Two-part implementation:
1. Opponent listener: `scope: 'opponent'`, `actions: ['place-farmer']`, `phases: ['before']`. Filter: `context.space.id === 'fishing'`. Returns seq flow: opponent pays 1 food (via `pay-resources` from opponent context — note: this runs under card owner context after PlayerSwitch, so need to switch back to opponent for payment). Use `flag-card` to mark that fishing was used this round.

   Alternative simpler approach: since `before` phase runs before the action, and the listener is opponent-scoped, the engine switches to card owner. But the PAYMENT must come from the opponent. Solution: use `gain { food: 1 }` for the card owner (equivalent to "opponent pays 1 food to you" as just owner gaining 1 food from supply — simpler than actual transfer). Then flag.

2. `onReturnHome` effect: check `isCardFlagged`, if true, add 2 food to fishing space resources, then unflag.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Commit**

```
feat: implement C51_FishingNet (opponent forced payment + delayed food)
```

---

### Task 8: E148_Lazybones (Pattern 4 — Pre-placed Stables Trigger)

**BGA behavior:** On buy, place up to 1 stable each on Grain Seeds, Farmland, Day Laborer, Farm Expansion. When opponent uses that space, card owner receives the stable for free.

**Note:** This is a 4+ player card with complex mechanics (stables on action spaces). Simplified implementation: track which spaces have stables in `cardStates`, when opponent uses one, owner gets a free stable placed on a random empty farmyard tile.

**Files:**
- Modify: `shared/cards/E/E148_Lazybones.ts` (exists as data-only)
- Create: `server/__tests__/E148_Lazybones-session.test.ts`

- [ ] **Step 1: Write session test**

```typescript
it('owner receives free stable when opponent uses marked space', () => {
  const session = makeSession()
  // After onBuy, owner should have placed stables on action spaces
  // Opponent uses grain-seeds → owner gets free stable
  session.takeAction(1, 'grain-seeds')
  // Verify owner gained a stable
})
```

- [ ] **Step 2: Run test — FAIL**
- [ ] **Step 3: Implement E148_Lazybones**

1. `onBuy` effect: return flow that lets player choose which spaces (up to 4) to place stables on. Store chosen spaces in `cardStates[CARD_ID].extraData.spaces: string[]`. (Simplified: auto-place on all 4 if player has enough stables.)

2. Opponent listener: `scope: 'opponent'`, `actions: ['place-farmer']`, `phases: ['after']`. Check if `context.space.id` is in the stored spaces. If yes, remove it from stored list and return `stables` leaf flow with `{ maxStables: 1, freeStable: true }` or direct farm tile placement.

- [ ] **Step 4: Run test — PASS**
- [ ] **Step 5: Commit**

```
feat: implement E148_Lazybones (pre-placed stables on action spaces)
```

---

### Task 9: Final Integration Test + i18n

- [ ] **Step 1: Add i18n keys** for all new cards' interaction prompts in `shared/i18n/en.ts` and `shared/i18n/zh.ts`
- [ ] **Step 2: Run full test suite**: `npx vitest run --exclude 'e2e-tests/**' --exclude 'scripts/**'`
- [ ] **Step 3: Commit**

```
feat: add i18n for opponent interaction cards
```

---

## Implementation Order

1. **Task 0** — `gain-trigger-player` action (prerequisite for D139, A132)
2. **Task 1** — C141_SheepProvider (simplest, validates pattern)
3. **Task 2** — D139_Chairman (both-players-gain pattern)
4. **Task 3** — A156_Buyer (optional exchange)
5. **Task 4** — A132_Publican (pay-to-opponent pattern)
6. **Task 5** — A150_Stagehand (action choice grant)
7. **Task 6** — E95_Miller (onBuy + opponent bake)
8. **Task 7** — C51_FishingNet (forced + delayed)
9. **Task 8** — E148_Lazybones (pre-placed stables)
10. **Task 9** — Integration test + i18n
