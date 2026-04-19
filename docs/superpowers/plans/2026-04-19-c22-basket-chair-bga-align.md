# C22 Basket Chair — BGA Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace C22 BasketChair's "extra placement per round" simplification with BGA-faithful semantics — onBuy recalls the first-placed farmer onto the card (held, not at home), then offers an extra `place-farmer`.

**Architecture:** Introduces one generic mechanism — *worker held on a card* — via `player.cardStates[cardId].extraData.heldWorkerId`. Extends `workersAtHome` to exclude card-held workers. Centralises release at the existing return-home site in `GameSession`. Extends `recall-placed-worker` with `forceFirst` / `targetCardHold` params. C22 stays a `MinorImprovement`; its `onBuy` returns an optional `seq` that composes the new primitives.

**Tech Stack:** TypeScript, Vitest (unit / session), Playwright (E2E), React + Vite (UI).

**Spec:** `docs/superpowers/specs/2026-04-19-c22-basket-chair-bga-align-design.md`

---

## Task 1: `card-held-workers` helper (new module)

**Files:**
- Create: `shared/cards/helpers/card-held-workers.ts`
- Create: `shared/cards/helpers/__tests__/card-held-workers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/cards/helpers/__tests__/card-held-workers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../game/types'
import {
  holdWorkerOnCard,
  getWorkerHeldOnCard,
  releaseWorkerFromCard,
  getCardHeldWorkerIds,
} from '../card-held-workers'

const makePlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} }) as unknown as PlayerState

describe('card-held-workers', () => {
  it('holds and reads a worker id on a card', () => {
    const p = makePlayer()
    holdWorkerOnCard(p, 'C22_BasketChair', '3')
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBe('3')
  })

  it('returns undefined when no worker is held', () => {
    const p = makePlayer()
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBeUndefined()
  })

  it('overwrites an existing hold', () => {
    const p = makePlayer()
    holdWorkerOnCard(p, 'C22_BasketChair', '3')
    holdWorkerOnCard(p, 'C22_BasketChair', '4')
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBe('4')
  })

  it('release returns the previously held worker id and clears it', () => {
    const p = makePlayer()
    holdWorkerOnCard(p, 'C22_BasketChair', '3')
    expect(releaseWorkerFromCard(p, 'C22_BasketChair')).toBe('3')
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBeUndefined()
  })

  it('release is a no-op when nothing is held', () => {
    const p = makePlayer()
    expect(releaseWorkerFromCard(p, 'C22_BasketChair')).toBeUndefined()
  })

  it('getCardHeldWorkerIds aggregates across cards', () => {
    const p = makePlayer()
    holdWorkerOnCard(p, 'C22_BasketChair', '3')
    holdWorkerOnCard(p, 'X_OtherCard', '4')
    expect(getCardHeldWorkerIds(p)).toEqual(new Set(['3', '4']))
  })

  it('getCardHeldWorkerIds returns empty set on a fresh player', () => {
    expect(getCardHeldWorkerIds(makePlayer())).toEqual(new Set<string>())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/card-held-workers.test.ts`
Expected: FAIL with "Cannot find module '../card-held-workers'".

- [ ] **Step 3: Write minimal implementation**

Create `shared/cards/helpers/card-held-workers.ts`:

```ts
import type { PlayerState } from '../../game/types'
import { ensureCardState } from './card-state'

const HELD_KEY = 'heldWorkerId'

export const holdWorkerOnCard = (
  player: PlayerState,
  cardId: string,
  workerId: string,
): void => {
  const cs = ensureCardState(player, cardId)
  cs.extraData = { ...(cs.extraData ?? {}), [HELD_KEY]: workerId }
}

export const getWorkerHeldOnCard = (
  player: PlayerState,
  cardId: string,
): string | undefined => {
  const value = player.cardStates?.[cardId]?.extraData?.[HELD_KEY]
  return typeof value === 'string' ? value : undefined
}

export const releaseWorkerFromCard = (
  player: PlayerState,
  cardId: string,
): string | undefined => {
  const current = getWorkerHeldOnCard(player, cardId)
  if (current === undefined) return undefined
  const cs = ensureCardState(player, cardId)
  if (cs.extraData) {
    const { [HELD_KEY]: _removed, ...rest } = cs.extraData
    cs.extraData = rest
  }
  return current
}

export const getCardHeldWorkerIds = (player: PlayerState): Set<string> => {
  const out = new Set<string>()
  const cardStates = player.cardStates ?? {}
  for (const key of Object.keys(cardStates)) {
    const value = cardStates[key]?.extraData?.[HELD_KEY]
    if (typeof value === 'string') out.add(value)
  }
  return out
}
```

Note: `ensureCardState` lives at `shared/cards/helpers/card-state.ts` and is the standard accessor used by other helpers (e.g. `round-placement.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/card-held-workers.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/cards/helpers/card-held-workers.ts shared/cards/helpers/__tests__/card-held-workers.test.ts
git commit -m "feat: add card-held-workers helper (held workers via cardStates.heldWorkerId)"
```

---

## Task 2: Extend `workersAtHome` to exclude card-held workers

**Files:**
- Modify: `shared/game/player.ts:29-30`
- Modify: `shared/game/__tests__/player.test.ts`

- [ ] **Step 1: Write the failing test**

Open `shared/game/__tests__/player.test.ts` first and read its existing fixture helpers (the file already has ~`it('workersAtHome excludes those currently on a space', ...)` at line 59 — reuse the same `p` / `s` construction pattern shown there).

Add two top-of-file imports:

```ts
import { holdWorkerOnCard, releaseWorkerFromCard } from '../../cards/helpers/card-held-workers'
```

Append inside the existing `describe('player helpers', ...)` block (adjust `makePlayer` / `makeState` names to whatever the file already uses):

```ts
it('workersAtHome excludes workers held on a card', () => {
  const p = makePlayer()             // two active workers, ids '1' and '2', at home
  const s = makeState([p])
  holdWorkerOnCard(p, 'C22_BasketChair', '1')
  expect(workersAtHome(s, p).map((w) => w.id)).toEqual(['2'])
  releaseWorkerFromCard(p, 'C22_BasketChair')
  expect(workersAtHome(s, p).map((w) => w.id).sort()).toEqual(['1', '2'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run shared/game/__tests__/player.test.ts`
Expected: FAIL — the new case expects worker '1' to be excluded but `workersAtHome` currently only filters `isWorkerOnAnySpace`.

- [ ] **Step 3: Write minimal implementation**

Edit `shared/game/player.ts`. Top of file, add the import:

```ts
import { getCardHeldWorkerIds } from '../cards/helpers/card-held-workers'
```

Replace the existing `workersAtHome` (around lines 29-30):

```ts
export const workersAtHome = (state: GameState, p: PlayerState): Worker[] => {
  const held = getCardHeldWorkerIds(p)
  return activeWorkers(p).filter(
    (w) => !isWorkerOnAnySpace(state, p.id, w.id) && !held.has(w.id),
  )
}
```

Verify no circular import: `card-held-workers.ts` imports only from `../../game/types` and `./card-state`; it does not import from `../../game/player`. Safe.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run shared/game/__tests__/player.test.ts`
Expected: PASS (all existing cases still pass, plus the new one).

- [ ] **Step 5: Run the full unit suite to catch regressions**

Run: `pnpm test`
Expected: 0 failures. (`workersAtHome` is widely used; any breakage surfaces here.)

- [ ] **Step 6: Commit**

```bash
git add shared/game/player.ts shared/game/__tests__/player.test.ts
git commit -m "feat(player): exclude card-held workers from workersAtHome"
```

---

## Task 3: Extend `recall-placed-worker` with `forceFirst` and `targetCardHold`

**Files:**
- Modify: `shared/actions/effects/recall-placed-worker.ts`
- Create: `shared/actions/effects/__tests__/recall-placed-worker.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `shared/actions/effects/__tests__/recall-placed-worker.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../../game/types'
import { recallPlacedWorkerAction } from '../recall-placed-worker'
import { recordRoundPlacement } from '../../../cards/helpers/round-placement'
import { getWorkerHeldOnCard } from '../../../cards/helpers/card-held-workers'
import { workersAvailable } from '../../../game/player'

const mkSpace = (id: string, takenBy: { playerId: string; workerId: string }[] = []): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy,
  }) as unknown as ActionSpace

const mkPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'p1',
    color: 'red',
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    cardStates: {},
    resources: {},
  }) as unknown as PlayerState

const mkState = (spaces: ActionSpace[], players: PlayerState[]): GameState =>
  ({
    actionSpaces: spaces,
    players,
    log: [],
    round: 1,
    currentPlayerIndex: 0,
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('recall-placed-worker — forceFirst + targetCardHold', () => {
  it('recalls the first-placed worker onto the target card (worker held, not at home)', () => {
    const forest = mkSpace('forest', [{ playerId: 'p1', workerId: '1' }])
    const p = mkPlayer()
    const s = mkState([forest], [p])
    recordRoundPlacement(p, 'forest', '1')

    const result = recallPlacedWorkerAction.execute({
      state: s,
      player: p,
      space: forest,
      params: { forceFirst: true, targetCardHold: 'C22_BasketChair' },
    } as any)

    expect(result.type).toBe('ok')
    expect(forest.takenBy).toEqual([])
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBe('1')
    // 2 active workers minus 1 held = 1 at home
    expect(workersAvailable(s, p)).toBe(1)
  })

  it('forceFirst fails when no placements were recorded this round', () => {
    const p = mkPlayer()
    const s = mkState([], [p])

    const result = recallPlacedWorkerAction.execute({
      state: s,
      player: p,
      space: { id: 'dummy' } as ActionSpace,
      params: { forceFirst: true, targetCardHold: 'C22_BasketChair' },
    } as any)

    expect(result.type).toBe('fail')
  })

  it('forceFirst fails when the first placement is on a meeting-place space', () => {
    const mp = mkSpace('meeting-place-family', [{ playerId: 'p1', workerId: '1' }])
    const p = mkPlayer()
    const s = mkState([mp], [p])
    recordRoundPlacement(p, 'meeting-place-family', '1')

    const result = recallPlacedWorkerAction.execute({
      state: s,
      player: p,
      space: mp,
      params: { forceFirst: true, targetCardHold: 'C22_BasketChair' },
    } as any)

    expect(result.type).toBe('fail')
    // No recall happened.
    expect(mp.takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBeUndefined()
  })

  it('forceFirst without targetCardHold returns the worker to home (legacy behavior)', () => {
    const forest = mkSpace('forest', [{ playerId: 'p1', workerId: '1' }])
    const p = mkPlayer()
    const s = mkState([forest], [p])
    recordRoundPlacement(p, 'forest', '1')

    const result = recallPlacedWorkerAction.execute({
      state: s,
      player: p,
      space: forest,
      params: { forceFirst: true },
    } as any)

    expect(result.type).toBe('ok')
    expect(forest.takenBy).toEqual([])
    // No card hold; worker is at home again.
    expect(workersAvailable(s, p)).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/recall-placed-worker.test.ts`
Expected: FAIL — current implementation ignores `forceFirst` / `targetCardHold`.

- [ ] **Step 3: Write minimal implementation**

Edit `shared/actions/effects/recall-placed-worker.ts`. At the top, after the existing imports, add:

```ts
import { holdWorkerOnCard } from '../../cards/helpers/card-held-workers'
```

Replace the `execute` (currently around lines 36-66) with:

```ts
  execute: ({ state, player, params }) => {
    const p = params as
      | {
          excludeSpaceId?: string
          excludeMeetingPlace?: boolean
          forceFirst?: boolean
          targetCardHold?: string
        }
      | undefined
    const excludeSpaceId = p?.excludeSpaceId
    const excludeMeetingPlace = p?.excludeMeetingPlace ?? true
    const forceFirst = p?.forceFirst === true
    const targetCardHold = p?.targetCardHold

    const applyRelocation = (space: ActionSpace, workerId: string | undefined) => {
      const removed = removeWorkerRef(space, player.id, workerId)
      if (removed && targetCardHold) {
        holdWorkerOnCard(player, targetCardHold, removed.workerId)
      }
    }

    if (forceFirst) {
      const placements = getRoundPlacementDetails(player)
      const first = placements[0]
      if (!first) return { type: 'fail', logKey: 'log.actionFail' }
      if (excludeMeetingPlace && isMeetingPlace(first.spaceId)) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      if (excludeSpaceId && first.spaceId === excludeSpaceId) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      const origin = state.actionSpaces.find((s) => s.id === first.spaceId)
      if (!origin) return { type: 'fail', logKey: 'log.actionFail' }
      if (!origin.takenBy.some((t) => t.playerId === player.id && t.workerId === first.workerId)) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      applyRelocation(origin, first.workerId)
      return { type: 'ok', logKey: 'log.cardEffectTrigger' }
    }

    const candidates = state.actionSpaces.filter((space) => {
      if (!spaceHasPlayer(space, player.id)) return false
      if (excludeSpaceId && space.id === excludeSpaceId) return false
      if (excludeMeetingPlace && isMeetingPlace(space.id)) return false
      return true
    })

    if (candidates.length === 0) return { type: 'fail', logKey: 'log.actionFail' }

    if (candidates.length === 1) {
      const only = candidates[0]!
      const placements = getRoundPlacementDetails(player)
      const entry = placements.find((e) => e.spaceId === only.id)
      applyRelocation(only, entry?.workerId)
      return { type: 'ok', logKey: 'log.cardEffectTrigger' }
    }

    return {
      type: 'choice',
      promptKey: 'ui.interactionRecallPlacedWorker',
      options: candidates.map((space) => ({
        value: space.id,
        labelKey: space.nameKey,
      })),
    }
  },
  resolveChoice: ({ state, player, params }, choice) => {
    const p = params as { targetCardHold?: string } | undefined
    const target = state.actionSpaces.find(
      (space) => space.id === choice && spaceHasPlayer(space, player.id),
    )
    if (!target) return { type: 'fail', logKey: 'log.actionFail' }
    const placements = getRoundPlacementDetails(player)
    const entry = placements.find((e) => e.spaceId === target.id)
    const removed = removeWorkerRef(target, player.id, entry?.workerId)
    if (removed && p?.targetCardHold) {
      holdWorkerOnCard(player, p.targetCardHold, removed.workerId)
    }
    return { type: 'ok', logKey: 'log.cardEffectTrigger' }
  },
```

Also add `import type { ActionSpace } from '../../game/types'` if not already present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/recall-placed-worker.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the session tests that exercise `recall-placed-worker`**

Run: `pnpm exec vitest run server/__tests__/D93_SheepInspector-session.test.ts` (pre-existing consumer of this action).
Expected: PASS — existing behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add shared/actions/effects/recall-placed-worker.ts shared/actions/effects/__tests__/recall-placed-worker.test.ts
git commit -m "feat(recall-placed-worker): add forceFirst and targetCardHold params"
```

---

## Task 4: Central release of `heldWorkerId` at return-home

**Files:**
- Modify: `server/game-session.ts:2267-2285` (the `continueReturnHomeHooks` function, specifically right after `this.state.actionSpaces.forEach((s) => { s.takenBy = [] })`)
- Create: `server/__tests__/card-held-return-home.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/card-held-return-home.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { holdWorkerOnCard, getWorkerHeldOnCard } from '../../shared/cards/helpers/card-held-workers'

describe('GameSession return-home releases card-held workers', () => {
  it('clears every heldWorkerId on every player when return-home runs', () => {
    const session = new GameSession()
    session.startGame({
      players: [
        { id: 'p1', name: 'p1', color: 'red' },
        { id: 'p2', name: 'p2', color: 'blue' },
      ],
      seed: 1,
    })
    const state = session.getState()
    holdWorkerOnCard(state.players[0]!, 'C22_BasketChair', '1')
    holdWorkerOnCard(state.players[1]!, 'X_OtherCard', '2')

    // Drive state into "all workers placed" so return-home triggers naturally.
    // Simplest: directly invoke the return-home path via the test hook.
    ;(session as any).continueReturnHomeHooks()

    expect(getWorkerHeldOnCard(state.players[0]!, 'C22_BasketChair')).toBeUndefined()
    expect(getWorkerHeldOnCard(state.players[1]!, 'X_OtherCard')).toBeUndefined()
  })
})
```

Note: if `startGame` has a different signature or `continueReturnHomeHooks` is not accessible, use whatever minimal GameSession bootstrap matches existing session tests (pattern examples: `server/__tests__/D24_BrotherlyLove-session.test.ts` or `server/__tests__/E93_Motivator-session.test.ts`). The key assertion is: after the return-home routine has finished, `heldWorkerId` entries are all cleared.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run server/__tests__/card-held-return-home.test.ts`
Expected: FAIL — return-home does not currently release heldWorkerId.

- [ ] **Step 3: Write minimal implementation**

Edit `server/game-session.ts`. At the top, after the existing imports, add:

```ts
import { releaseWorkerFromCard } from '../shared/cards/helpers/card-held-workers.ts'
```

Inside `continueReturnHomeHooks` (around line 2267), right after the existing `this.state.actionSpaces.forEach((s) => { s.takenBy = [] })` line, add:

```ts
    // Release any workers that cards were holding (e.g. C22_BasketChair).
    for (const p of this.state.players) {
      const cardStates = p.cardStates ?? {}
      for (const cardId of Object.keys(cardStates)) {
        releaseWorkerFromCard(p, cardId)
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run server/__tests__/card-held-return-home.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the wider session suite to catch regressions**

Run: `pnpm exec vitest run server/__tests__/`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add server/game-session.ts server/__tests__/card-held-return-home.test.ts
git commit -m "feat(game-session): release card-held workers at return-home"
```

---

## Task 5: Rewrite C22 card — remove simplification, wire new flow

**Files:**
- Modify: `shared/cards/C/C22_BasketChair.ts` (full rewrite)
- Delete/rewrite: `server/__tests__/C22_BasketChair-session.test.ts`

- [ ] **Step 1: Replace the C22 session test file**

Overwrite `server/__tests__/C22_BasketChair-session.test.ts` with session-level tests that drive `GameSession` through the real buy path (via `minor-improvement` action space). Use `server/__tests__/C119_SkillfulRenovator-session.test.ts` as the structural template — it already exercises `recordRoundPlacement` + GameSession + takeAction.

The seven required cases (see spec §4.2):

1. Golden path — accept the optional seq, recall first-placed, place extra farmer; assert forest empty, `heldWorkerId === '1'`, `workersAvailable === 1`, then place on ClayPit → verify placement state + reed -= 1 + VP += 1.
2. Skip path — skip the optional seq; assert Forest still occupied, no `heldWorkerId`, card played with VP +1.
3. No prior placement — no flow offered; buy resolves cleanly.
4. First placement on Meeting Place — no flow offered.
5. `workersAvailable` === 0 before onBuy — no flow offered (prefab via `setWorkersAtHome(s, p, 1)` placing one worker, then marking the second as placed too).
6. Re-placing on freed origin — accept seq; in place-farmer choice, select freed Forest → placement succeeds; worker '2' on Forest; reward granted.
7. Return home releases held worker — accept seq, drive session to end of work phase (or call the return-home hook directly); assert `heldWorkerId` cleared.

Structure each test like:

```ts
it('golden path: buys C22, recalls first farmer, places extra', async () => {
  const session = new GameSession()
  // ... bootstrap 2p game, land on p1's turn in round 3+, hand C22, 1 reed,
  //     prior placement on forest via recordRoundPlacement + space.takenBy push.
  const resp1 = session.takeAction('minor-improvement', { cardId: 'C22_BasketChair' })
  // Or: simulate the real path — placeFarmer on minor-improvement, then resolveChoice
  //     to pick C22 from hand. Match whatever the existing session tests do for
  //     "buy a minor via minor-improvement" — see A25_Bassinet-session.test.ts / D24 /
  //     C119 for the established pattern.
  expect(resp1.pending?.type).toBe('choice') // accept/skip prompt
  const resp2 = session.resolveChoice(/* accept value */)
  // After accept: recall fires automatically, pending advances to place-farmer choice.
  expect(resp2.pending?.type).toBe('choice')
  const resp3 = session.resolveChoice('clay-pit')
  expect(resp3.ok).toBe(true)
  const p1 = session.getState().players[0]!
  expect(getWorkerHeldOnCard(p1, 'C22_BasketChair')).toBe('1')
  // ... full assertion block per spec
})
```

Discover the exact session API (`takeAction` signature, `resolveChoice` signature, accept-seq prompt value) from an existing C-deck session test before writing. Do not guess.

- [ ] **Step 2: Run the new session tests to confirm they fail**

Run: `pnpm exec vitest run server/__tests__/C22_BasketChair-session.test.ts`
Expected: FAIL — current C22 still uses `onBeforeStartOfTurn` path.

- [ ] **Step 3: Rewrite the card file**

Overwrite `shared/cards/C/C22_BasketChair.ts` with:

```ts
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { workersAvailable } from '../../game/player'

const CARD_ID = 'C22_BasketChair'

/**
 * C22 Basket Chair (Minor Improvement, Even More set).
 *
 * BGA behavior (C22_BasketChair.php):
 *   When bought in the work phase, if the player has already placed a farmer
 *   this phase and that first farmer is on an action space other than Meeting
 *   Place, offer an optional sequence: (a) move that farmer to this card, then
 *   (b) place another at-home farmer on any available space.
 *
 * Net result per buy: 2 at-home farmers consumed (one held on this card, one on
 * the newly chosen space). The original space is freed for reuse.
 *
 * Deliberate deviations from BGA (tracked in docs/card_progress.md §6):
 *   - No same-turn reactivation of the card's private space (BGA's canBePlayed
 *     turnId gate is not replicated; skipping the onBuy seq forfeits the effect).
 *   - No JobContract fake-meeple cleanup (that mechanism is not modelled yet).
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const first = getRoundPlacementDetails(player)[0]
    if (!first) return
    if (first.spaceId.startsWith('meeting-place')) return
    const origin = state.actionSpaces.find((s) => s.id === first.spaceId)
    if (!origin) return
    if (!origin.takenBy.some(
      (t) => t.playerId === player.id && t.workerId === first.workerId,
    )) return
    // targetCardHold keeps the recalled worker off "home", so the place-farmer
    // step needs a separate at-home farmer. Guard up-front, matching BGA's
    // isDoable propagation.
    if (workersAvailable(state, player) < 1) return

    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'recall-placed-worker',
          params: { forceFirst: true, targetCardHold: CARD_ID },
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    }
  },
})

export const C22_BasketChair = new MinorImprovement({
  id: CARD_ID,
  name: 'Basket Chair',
  deck: 'C',
  number: 22,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you can immediately move the first person you placed this work phase to this card (unless it is on __Meeting Place__). If you do, immediately afterward, you can place another person.',
  ],
  cost: { reed: 1 },
  vp: 1,
  evenMoreSet: true,
})
```

- [ ] **Step 4: Run the new session tests**

Run: `pnpm exec vitest run server/__tests__/C22_BasketChair-session.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm test`
Expected: 0 failures. (If `hook-coverage-matrix` complains that C22 now lacks `onBeforeStartOfTurn`, update that coverage config — see its existing pattern.)

- [ ] **Step 6: Commit**

```bash
git add shared/cards/C/C22_BasketChair.ts server/__tests__/C22_BasketChair-session.test.ts
git commit -m "feat(C22): align BasketChair with BGA (onBuy recall + extra place-farmer)"
```

---

## Task 6: UI — render held-worker overlay on played C22 card

**Files:**
- Modify: `src/components/board/FarmBoard.tsx` (specifically the `PlayedCardStats` wrapper around line 1064-1078, OR `PlayedCardStats` component itself if it lives elsewhere)
- Modify: the component test file that covers played cards (discover: start with `src/components/board/__tests__/FarmBoard.test.tsx`)

- [ ] **Step 1: Locate the `PlayedCardStats` component**

```bash
grep -rn 'export.*PlayedCardStats' src --include='*.tsx'
```

It is defined in `FarmBoard.tsx` (or a sibling). Read the component's prop surface before editing.

- [ ] **Step 2: Write the failing component test**

Add a test to the appropriate `*.test.tsx` (likely `FarmBoard.test.tsx`) that:

- Renders the played cards list for a player whose `cardStates['C22_BasketChair'].extraData.heldWorkerId === '1'`.
- Asserts a held-worker marker is visible on that card (`data-testid="played-card-held-worker-C22_BasketChair"` or class `held-worker-marker`).
- Rerenders without `heldWorkerId` and asserts the marker is absent.

Use RTL patterns from the existing test file. Example shape:

```tsx
it('renders held-worker overlay when cardStates.heldWorkerId is set', () => {
  const player = {
    ...basePlayer,
    minorPlayed: ['C22_BasketChair'],
    cardStates: {
      C22_BasketChair: { extraData: { heldWorkerId: '1' } },
    },
  }
  render(<FarmBoard {...baseProps} displayPlayer={player} playedCards={['minor:C22_BasketChair']} />)
  expect(screen.getByTestId('played-card-held-worker-C22_BasketChair')).toBeVisible()
})
```

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run src/components/board/__tests__/FarmBoard.test.tsx`
Expected: FAIL — overlay not rendered.

- [ ] **Step 4: Implement the overlay**

In `FarmBoard.tsx` inside the played-cards `.map` (around line 1040-1079), before `<PlayedCardStats ...>`, read the held worker:

```tsx
const heldWorkerId = displayPlayer.cardStates?.[rawId]?.extraData?.heldWorkerId as string | undefined
```

Pass it through to `PlayedCardStats` as a new prop (`heldWorkerId?: string`). Inside `PlayedCardStats`, render a small worker-token overlay when `heldWorkerId` is truthy, styled in line with existing worker tokens (look at `ActionBoard.tsx` for the existing worker-token render pattern — reuse the same component / CSS class). Use `data-testid={`played-card-held-worker-${rawId}`}` on the overlay element.

Color comes from `displayPlayer.color`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/board/__tests__/FarmBoard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run `tsc` via the build pipeline to confirm no type regressions**

Run: `pnpm run build`
Expected: build succeeds. (Warnings about `/bga-img/*` are cosmetic and existed before.)

- [ ] **Step 7: Commit**

```bash
git add src/components/board/FarmBoard.tsx src/components/board/__tests__/FarmBoard.test.tsx
git commit -m "feat(ui): render held-worker overlay on played cards with heldWorkerId"
```

---

## Task 7: UI — confirm C22 not rendered as an ActionBoard action space

**Files:**
- Modify: `src/components/board/__tests__/ActionBoard.test.tsx`

- [ ] **Step 1: Write the assertion**

Add a test to `ActionBoard.test.tsx` that mounts ActionBoard with a player whose `minorPlayed` includes `C22_BasketChair` and whose `state.actionSpaces` does NOT include a C22 entry. Assert:

```tsx
expect(screen.queryByTestId('action-card-C22_BasketChair')).toBeNull()
// and: compare with a known PlayerActionCard (e.g. D51_Archway) that DOES render
// when the corresponding action space exists.
```

(Use whatever testid / selector ActionBoard already uses for action-card tiles; discover first.)

- [ ] **Step 2: Run the test to confirm it passes as-is (C22 is NOT a PlayerActionCard)**

Run: `pnpm exec vitest run src/components/board/__tests__/ActionBoard.test.tsx`
Expected: PASS already — this is a regression lock, not a change driver.

- [ ] **Step 3: Commit**

```bash
git add src/components/board/__tests__/ActionBoard.test.tsx
git commit -m "test(ui): lock C22 not rendered as an action-board space"
```

---

## Task 8: E2E test via Playwright

**Files:**
- Create: `e2e-tests/C22_BasketChair.spec.ts`

- [ ] **Step 1: Inspect existing devMode HTTP/WS endpoints**

Discover the exact endpoints used to (a) draw a card into a player's hand, (b) advance round, (c) edit resources. Starting point: `server/game-router.ts` (search for `/api/dev`) and `server/game-session.ts` `dev*` methods (`devDrawCard` at line 2843, `devSetSpaceTaken` at 2885, `devAddRooms` at 2898, etc.).

Document the endpoint list at the top of the new spec file as a comment so future authors know what is used.

- [ ] **Step 2: Write the E2E spec**

Create `e2e-tests/C22_BasketChair.spec.ts` using `e2e-tests/C75_Firewood.spec.ts` as structural template:

```ts
import { test, expect } from '@playwright/test'

test.describe('C22_BasketChair End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?player=p1&devMode=1')
    // ... plus any setup the other e2e specs do (dev mode checkbox if required)
  })

  test('smoke: page loads cleanly', async ({ page }) => {
    await expect(page.locator('.game-board')).toBeVisible()
  })

  test('golden path: buy C22 via minor-improvement, accept recall, place extra', async ({ page, request }) => {
    // devMode: deal C22 to p1's minor hand, advance to round 4, ensure 1 reed.
    // Sequence of dev API calls goes here. Use `request.post('/api/dev/...', {...})`
    // pointing at the dev endpoints discovered in Step 1.

    // Click the minor-improvement action space.
    // ... selector from ActionBoard (data-testid preferred).

    // Interaction bar: select C22 from minor selection prompt.
    // Click accept on the optional-seq prompt.
    // Assert minor-improvement space worker chip disappears.
    // Assert C22 played card shows the held-worker overlay:
    //   await expect(page.getByTestId('played-card-held-worker-C22_BasketChair')).toBeVisible()
    // Interaction bar: place-farmer choice → click a free space (clay-pit).
    // Assert clay-pit shows worker chip.
  })

  test('skip path: decline the optional seq', async ({ page, request }) => {
    // Same setup. Click "skip" on the optional-seq prompt.
    // Assert minor-improvement still shows worker chip.
    // Assert C22 shown in played-cards but without held-worker overlay.
  })
})
```

Implementation choices during writing:
- If the dev endpoints cannot fully set up the preconditions (deal specific card + advance round + edit reed), extend the dev surface in a separate commit before finalising the E2E. Candidates: a `/api/dev/advance-round` endpoint + a `/api/dev/set-resource`.
- Prefer stable selectors: `data-testid` over role+name, since Chinese UI labels change with locale.

- [ ] **Step 3: Run the E2E against running dev servers**

```bash
# Terminal 1
./restart-intranet.sh
# Terminal 2
pnpm run test:e2e -- e2e-tests/C22_BasketChair.spec.ts
```

Expected: PASS (3 cases).

- [ ] **Step 4: Commit**

```bash
git add e2e-tests/C22_BasketChair.spec.ts
# ... plus any new dev endpoints if added:
git commit -m "test(e2e): add C22_BasketChair golden/skip/smoke Playwright specs"
```

---

## Task 9: Documentation sync

**Files:**
- Modify: `docs/card_progress.md` (§§1, 2, 5, 6, 7, 8)
- Modify: `docs/ENGINE_ARCHITECTURE.md` (worker/action-space section)

- [ ] **Step 1: Update `docs/card_progress.md`**

- §2 Current batch: add
  ```
  - 2026-04-19 · C22 BasketChair BGA-aligned · onBuy recalls first-placed farmer to card-hold + extra place-farmer (removes the per-round simplification).
  ```
- §5 Deliberate simplifications: remove the existing C22 row (no longer a simplification).
- §6 Deliberate deviations: add
  ```
  | C22 BasketChair | No same-turn reactivation; no JobContract fake-meeple cleanup | BGA's canBePlayed turnId gate is skipped (if the buyer declines the onBuy optional seq, the card gives only VP); JobContract fake isn't modelled yet. |
  ```
- §7 Infrastructure: add
  ```
  - `shared/cards/helpers/card-held-workers.ts` + `workersAtHome` exclusion + central release at return-home: a worker can be "held" on a card via `cardStates[cardId].extraData.heldWorkerId`, excluded from "at home" accounting, and released during the return-home phase. First used by C22.
  - `recall-placed-worker` params: `forceFirst`, `targetCardHold`.
  ```
- §8 Timeline: add a new row for 2026-04-19 with the C22 re-alignment.
- §1 Overview: implementation count unchanged (C22 was already counted as implemented).

- [ ] **Step 2: Update `docs/ENGINE_ARCHITECTURE.md`**

In the worker / action-space section, add a short paragraph:

> **Card-held workers** — a card may hold a worker via `player.cardStates[cardId].extraData.heldWorkerId`. Such workers count as neither on an action space (not in any `takenBy`) nor at home (`workersAtHome` excludes them). They are released centrally at return-home, immediately after action-space `takenBy` is cleared. First consumer: C22 BasketChair.

- [ ] **Step 3: Commit**

```bash
git add docs/card_progress.md docs/ENGINE_ARCHITECTURE.md
git commit -m "docs: sync card_progress and ENGINE_ARCHITECTURE for C22 BGA alignment"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: 0 failures.

- [ ] **Step 2: Lint**

Run: `pnpm run lint`
Expected: no NEW errors beyond the pre-existing ~340 `any`-type warnings (see CLAUDE.md).

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: success.

- [ ] **Step 4: E2E (with dev servers running)**

Run: `pnpm run test:e2e -- e2e-tests/C22_BasketChair.spec.ts`
Expected: PASS.

- [ ] **Step 5: Fetch + branch state check**

```bash
git fetch
git status
git log --oneline main..HEAD
```

Confirm the branch contains exactly the planned commits and nothing unrelated.
