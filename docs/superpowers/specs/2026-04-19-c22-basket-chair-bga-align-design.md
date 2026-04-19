# C22 Basket Chair — Align with BGA

**Date:** 2026-04-19
**Branch:** `feat/c22-basket-chair-bga-align`
**Card:** `shared/cards/C/C22_BasketChair.ts`
**BGA reference:** `bga-agricola/modules/php/Cards/C/C22_BasketChair.php`

## 1. Problem

Current `C22_BasketChair` is a deliberate simplification (see `docs/card_progress.md §5`): it grants one extra optional `place-farmer` at the start of each round, skipping BGA's core mechanic — *move the first person you placed this work phase to this card, then place another person*.

The simplification drifts from BGA in two observable ways:

1. Once per round (every round), not once per buy — the simplification is active every turn after purchase.
2. Net +1 free placement per round, vs BGA's net +1 placement *only on the turn of purchase* at the cost of one additional at-home worker being consumed (1 held on C22, 1 on the new space).

This plan replaces the simplification with a faithful BGA-aligned implementation.

## 2. BGA behavior (canonical)

From `C22_BasketChair.php`:

- Card type `MINOR` with `privateSpace = true`, extends `PlayerActionCard`.
- `onBuy($player)` (work phase only): finds first farmer that this player placed this work phase (`Globals::getPlacedFarmers()[pId][0]`). If that farmer is on an action-space *and* not on Meeting Place, returns an optional `NODE_SEQ` that:
  1. (conditional) cleans up `JobContract` fake meeple,
  2. records `turnId` (for same-turn reactivation gate),
  3. `useActionSpaceNode($this, $farmer)` — moves the farmer onto this card's private space and triggers the card's flow.
- Main flow (triggered by `useActionSpaceNode`): `[setTurnId, PLACE_FARMER]` — i.e. player places another at-home farmer on any available space.
- `canBePlayed` gates same-turn reactivation via `turnId` match.

Net per buy: 2 at-home farmers consumed (1 held on the card, 1 on a new space); original space is freed for re-use.

## 3. Design

### 3.1 Scope decisions (user-approved)

- **A1 — C22 stays `MinorImprovement`**, not `PlayerActionCard`. Our existing `PlayerActionCard` abstraction models *clickable reusable action spaces* (D51 Archway, A39 Chapel, D127 HardworkingMan). C22 is not that — it merely *holds a farmer on the card*. Use a lighter mechanism.
- **B1 — No same-turn reactivation.** BGA's `canBePlayed` turnId gate is a deliberate simplification: if the player skips the onBuy optional seq, there is no second chance to activate. Record this as a deliberate deviation in `card_progress.md §5` / §6.
- **C2 — Extend the existing `recall-placed-worker` action** (rather than adding a new dedicated leaf). Add two params so BasketChair-like "recall first placement to a card-hold" use cases can compose on the existing primitive.

### 3.2 New infrastructure

#### 3.2.1 `card-held-workers` helper

New file: `shared/cards/helpers/card-held-workers.ts`.

```ts
holdWorkerOnCard(player, cardId, workerId): void
getWorkerHeldOnCard(player, cardId): string | undefined
releaseWorkerFromCard(player, cardId): string | undefined
getCardHeldWorkerIds(player): Set<string>   // union across all cards
```

Backing store: `player.cardStates[cardId].extraData.heldWorkerId` (single slot per card; sufficient for all known cards).

#### 3.2.2 `workersAtHome` extension

Edit `shared/game/player.ts`:

```ts
// Before
export const workersAtHome = (state, p) =>
  activeWorkers(p).filter(w => !isWorkerOnAnySpace(state, p.id, w.id))

// After
export const workersAtHome = (state, p) => {
  const held = getCardHeldWorkerIds(p)
  return activeWorkers(p).filter(
    w => !isWorkerOnAnySpace(state, p.id, w.id) && !held.has(w.id),
  )
}
```

`workersAvailable` and `smallestAvailableWorker` automatically respect the new exclusion.

#### 3.2.3 Return-home release

Edit `server/game-session.ts`: at the existing "return home" code path, after action-space `takenBy` is cleared, iterate every player's `cardStates` and clear all `heldWorkerId` values. Single central release site; no per-card `onReturnHome` needed.

#### 3.2.4 `recall-placed-worker` extension

Edit `shared/actions/effects/recall-placed-worker.ts`. New params:

- `forceFirst?: boolean` — skip the choice step. Target = first entry of `getRoundPlacementDetails(player)`. If that entry is missing, on Meeting Place (when `excludeMeetingPlace` is true, default), or the workerRef is no longer on the origin space → `fail`.
- `targetCardHold?: string` — after `removeWorkerRef(origin, playerId, workerId)`, call `holdWorkerOnCard(player, cardId, workerId)` instead of leaving the worker at home.

Existing `excludeSpaceId` / `excludeMeetingPlace` behavior unchanged; new params are additive and only exercised by C22 today.

### 3.3 C22 card file (rewrite)

```ts
import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { workersAvailable } from '../../game/player'

const CARD_ID = 'C22_BasketChair'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const first = getRoundPlacementDetails(player)[0]
    if (!first) return
    if (first.spaceId.startsWith('meeting-place')) return
    const origin = state.actionSpaces.find(s => s.id === first.spaceId)
    if (!origin?.takenBy.some(
      t => t.playerId === player.id && t.workerId === first.workerId,
    )) return
    // place-farmer step needs another at-home worker. targetCardHold keeps the
    // recalled worker off "home", so we verify workersAvailable >= 1 BEFORE recall.
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

Removed: `onBeforeStartOfTurn` and `onRoundEnd` handlers + the `__CARD_FLAG__` round-reset dance.

### 3.4 UI rendering

- Minor-card display component (identify precise file during implementation; candidates include `PlayerCard` / minor-card render components): when `cardStates[cardId].extraData.heldWorkerId` is set, overlay a worker token on the card using the player's color + the worker numeric id. Reuse existing worker-token styling.
- `ActionBoard`: no change. C22 is not added to `state.actionSpaces`, so it naturally does not render as an action space.
- `InteractionBar`: no change. Existing `choice` + optional-seq prompt handling already covers the two prompts (accept/skip seq, then place-farmer choice).

## 4. Testing

### 4.1 Unit tests (tier 1)

- `shared/cards/helpers/__tests__/card-held-workers.test.ts` (new)
  - hold / get / release round-trip.
  - `getCardHeldWorkerIds` aggregates across multiple cards.
- `shared/game/__tests__/player.test.ts` (extend)
  - `workersAtHome` excludes a worker held on a card; releasing restores it.
- `shared/actions/effects/__tests__/recall-placed-worker.test.ts` (new, if absent)
  - `forceFirst: true, targetCardHold: 'C22_BasketChair'` — origin space loses workerRef; `heldWorkerId` written; `workersAvailable` unchanged.
  - `forceFirst` with no placements → `fail`.
  - `forceFirst` with first on `meeting-place-*` → `fail`.
  - Legacy choice-mode path unchanged (regression).

### 4.2 Session tests (tier 2) — `server/__tests__/C22_BasketChair-session.test.ts` (rewrite)

All existing `onBeforeStartOfTurn` / `onRoundEnd` tests are deleted. New suite drives `GameSession`:

1. **Golden path**: p1 has 2 workers; worker `1` placed on `forest` (`recordRoundPlacement`); p1 has C22 in hand and 1 reed. `playMinor(C22)` → pending is choice (accept/skip). Accept → pending moves to `place-farmer` choice. Assert: `forest.takenBy` empty; `cardStates[C22].heldWorkerId === '1'`; `workersAvailable === 1`; Forest still listed as an available placement option. Select ClayPit → ClayPit has `{p1,'2'}`; `workersAvailable === 0`; `minorPlayed` includes C22; reed -= 1; VP += 1.
2. **Skip path**: Same setup; at the accept/skip prompt, skip. Assert: Forest still has worker `1`; no `heldWorkerId`; `minorPlayed` includes C22; worker `2` still at home.
3. **No placements**: p1 buys C22 without any prior placement this round → no flow; buy resolves cleanly.
4. **First placement on Meeting Place**: `recordRoundPlacement(player, 'meeting-place-family', '1')` → onBuy returns void; buy resolves cleanly.
5. **No at-home worker for step 2**: both workers placed (via test helpers) → onBuy returns void (since `workersAvailable < 1`); no flow offered.
6. **Re-placing on freed origin**: accept seq; in the place-farmer choice, select the just-freed Forest → succeeds; Forest ends up with worker `2`; wood reward is granted again (document this as intentional BGA-consistent behavior; re-verify BGA's `isDoable` during implementation and tighten with `excludeSpaceId` only if BGA forbids).
7. **Return home releases held worker**: accept seq; advance GameSession to end of work phase (or directly invoke the return-home routine). Assert `cardStates[C22].heldWorkerId` is cleared and `workersAvailable === familySize`.

### 4.3 Component tests (tier 3) — `src/components/**/__tests__/*.test.tsx`

- Minor-card render test: `cardStates[C22].heldWorkerId = '1'` → overlay rendered with player color + worker id. No overlay when unset.
- `InteractionBar.test.tsx`: supply mock `pending` for (a) accept/skip optional-seq and (b) the subsequent `place-farmer` choice; assert both render and emit the right `resolveChoice` payloads.
- `ActionBoard.test.tsx`: assert C22 is **not** rendered in the action-board region (contrast with D51/A39/D127 which are).

### 4.4 E2E tests (tier 4) — `e2e-tests/C22_BasketChair.spec.ts`

Playwright, `?player=p1&devMode=1`, 2p room:

1. **Smoke**: page loads, `.game-board` visible, no console errors.
2. **Golden path (via real game flow)**:
   - devMode: deal C22 into p1's `minorHand`.
   - devMode: advance to round 4.
   - devMode: ensure p1 has 1 reed.
   - p1 clicks the `minor-improvement` action space → worker placed on that space (this is round 4's first placement).
   - Minor-selection prompt → select C22 → pay 1 reed.
   - onBuy fires → accept/skip prompt visible.
   - Click **Accept** → assert: `minor-improvement` space worker render disappears; C22 card overlay shows worker `1`; place-farmer choice opens including `minor-improvement` as a now-free option.
   - Click ClayPit (or any free space) → assert: ClayPit shows worker `2`; `minorPlayed` shows C22; `workersAvailable` reads 0.
3. **Skip path**: same setup; click **Skip** → assert: `minor-improvement` still occupied; C22 without overlay; minorPlayed shows C22.

If devMode's state editor cannot fully set up the golden-path preconditions (deal specific card + round advance + resource edit), add a dev HTTP endpoint or dev-room JSON seed during implementation. Mark as an implementation-time confirmation.

## 5. Documentation sync (per CLAUDE.md hard rule)

- `docs/card_progress.md`
  - §2 current round: add `2026-04-19 · C22 BasketChair BGA-aligned · onBuy recalls first-placed farmer to card-hold + extra place-farmer`.
  - §5 deliberate simplifications: remove the C22 entry (no longer simplified).
  - §6 deliberate deviations: add C22 entry noting same-turn reactivation not supported + JobContractFake cleanup skipped.
  - §7 infrastructure: register `card-held-workers` helper, `workersAtHome` exclusion, return-home central release, and `recall-placed-worker` new params.
- `docs/ENGINE_ARCHITECTURE.md`
  - In the worker/action-space section add a short paragraph: *a worker may be "held" on a card via `cardStates[cardId].heldWorkerId`; such workers count as neither on an action space nor at home, and are released centrally during the return-home phase*.
- `docs/card_desc_audit.md`: no change (desc text already matches BGA).

## 6. Deliberate deviations from BGA

- **No same-turn reactivation**: BGA allows the card's private space to be activated on the same turn as its purchase (gated by `canBePlayed` turnId match). If the player skipped the onBuy optional seq, in BGA they can still reactivate later in the same turn. We skip this — if skipped, the card simply grants its 1 VP.
- **No JobContract fake-meeple cleanup**: BGA handles a special case where the first placement is on Day Laborer with a Job Contract fake meeple (B131/C23 interactions). We do not currently model that fake-meeple mechanism, so the cleanup branch is N/A.
- **Meeting Place exclusion preserved**: if the first placement is on any meeting-place action space, onBuy does not offer the flow — matches BGA exactly.

## 7. File change list

**New files**
- `shared/cards/helpers/card-held-workers.ts`
- `shared/cards/helpers/__tests__/card-held-workers.test.ts`
- `shared/actions/effects/__tests__/recall-placed-worker.test.ts` (if absent)
- `e2e-tests/C22_BasketChair.spec.ts`

**Edited files**
- `shared/cards/C/C22_BasketChair.ts` — rewrite per §3.3
- `shared/game/player.ts` — `workersAtHome` adds card-held exclusion
- `shared/game/__tests__/player.test.ts` — add coverage for the exclusion
- `shared/actions/effects/recall-placed-worker.ts` — add `forceFirst` / `targetCardHold`
- `server/game-session.ts` — central release of `heldWorkerId` at return-home
- `server/__tests__/C22_BasketChair-session.test.ts` — rewrite per §4.2
- `src/components/...` — minor-card render reads `heldWorkerId` (file located during implementation)
- `src/components/**/__tests__/*.test.tsx` — component coverage
- `docs/card_progress.md` — §§2/5/6/7 updates
- `docs/ENGINE_ARCHITECTURE.md` — worker section note

**Explicitly untouched**
- `shared/cards/types.ts` (C22 remains `MinorImprovement`)
- `shared/cards/player-action-space.ts` (not reused)
- `shared/actions/effects/place-farmer.ts` (generic behavior unchanged)
- `shared/cards/helpers/round-placement.ts` (already sufficient)
