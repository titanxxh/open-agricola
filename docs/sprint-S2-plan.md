# Sprint S2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll out `InteractionRequest` to all 8 kinds (`farm-select` / `selection` / `card-draft` newly added) + collapse `InteractionState` 8 stateId → 3 + collapse `ClientCommand` choice family to single `resolveChoice` + split `game-core.ts` into 4 phase mixins (Setup / Round / Harvest / Draft) + wrap composite emit in real `InteractionNode` (delete `Engine.lastEmittedChoice` cache) + clean S1 carry-overs (3 confirm shims, ws.ts variants, EMPTY_ENGINE_STACK_CURSOR fallback) + delete `PendingAction` union type.

**Architecture:** Leaf actions emit `{ type: 'request', request: InteractionRequest, promptKey, promptParams }` with structured payload (no string-encoding). `GameCore.buildInteraction()` derives `InteractionState` purely by switching on `request.kind`. Session lives in 5 files: `session-core.ts` (cross-phase: dispatch / undo / runEngineSteps / buildInteraction / resumeStageFlow / continueAfterSubFlow umbrella) + 4 phase mixins. `PromptKey` is a closed union type, `PromptParams<K>` is a derived conditional type.

**Tech Stack:** TypeScript strict mode (`tsconfig.app.json` + `tsconfig.server.json` + `tsconfig.node.json`); vitest fast/slow projects; WebSocket + HTTP transport; pnpm workspace.

**Spec reference:** `docs/sprint-S2-spec.md` (sections cross-referenced as `[spec §X]`).
**Lean spec:** `docs/superpowers/specs/2026-05-03-sprint-S2-design.md`
**Cross-sprint contract:** `docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md`

**Branch:** `sprint-S2-interaction-request` (worktree `.worktree/sprint-S2-interaction-request`).

---

## File Structure Overview

### New files

| Path | Responsibility |
|---|---|
| `shared/game/prompt-keys.ts` | `PromptKey` closed union + `PromptParams<K>` conditional type |
| `shared/session/session-core.ts` | Main `GameCore` class (cross-phase state + dispatch + buildInteraction + resumeStageFlow + continueAfterSubFlow) |
| `shared/session/phases/setup.ts` | Setup mixin (init / loadState / custom card injection) |
| `shared/session/phases/round.ts` | Round mixin (takeAction / worker placement / confirm-* triggers + handlers / round transition / `continueAfterReorganize_returningHome` + `_roundEnd`) |
| `shared/session/phases/harvest.ts` | Harvest mixin (field / feed / breed phases + `continueAfterReorganize_harvestBreed` + 12 harvest hook handlers) |
| `shared/session/phases/draft.ts` | Draft mixin (wraps `shared/draft/draft-manager.ts` + `card-draft` kind emit/resolve) |
| `shared/game/__tests__/prompt-keys.test.ts` | `PromptKey` / `PromptParams<K>` type tests |
| `shared/session/phases/__tests__/setup.test.ts` | Setup mixin unit tests |
| `shared/session/phases/__tests__/round.test.ts` | Round mixin unit tests |
| `shared/session/phases/__tests__/harvest.test.ts` | Harvest mixin unit tests |
| `shared/session/phases/__tests__/draft.test.ts` | Draft mixin unit tests |

### Modified files

| Path | Reason |
|---|---|
| `shared/game/types.ts` | Add 3 InteractionRequest kinds (`farm-select` / `selection` / `card-draft`); collapse `InteractionState` to 3 stateId; tighten `promptKey` field to `PromptKey`; tighten `promptParams` to typed schema; delete `PendingAction` union type wholesale (after all consumers migrated in Task 13) |
| `shared/game/serialization.ts` | Make `serializeState(state, ctx)` `ctx` required; delete `EMPTY_ENGINE_STACK_CURSOR` fallback |
| `shared/protocol/ws.ts` | Delete `commitFarm` / `commitSelection` / `commitChoice` / `confirmFeed` / `feed` / `nextPlayer` / `confirmPlayerSwitch` / `confirmHarvestFeed` / `confirmAnimalReorg` / `draftSubmit` ClientCommand variants |
| `shared/protocol/game.ts` | Delete `pending: PendingAction` from `GameSyncPayload` |
| `shared/session/game-core.ts` | Replaced by `session-core.ts` + 4 mixins; old file becomes a thin re-export shim, or deleted |
| `shared/engine/engine.ts` | Delete `lastEmittedChoice` cache + `peekPendingChoiceFromComposite()` getter; snapshot/restore drop `lastEmittedChoice` field |
| `shared/engine/nodes.ts` | OrNode/XorNode/OptionalNode emit construct real `InteractionNode` (instead of writing `lastEmittedChoice` cache) |
| `shared/actions/effects/plow.ts` | Emit `{ type: 'request', request: { kind: 'farm-select', farm: { farmType: 'plow', selectableTiles } } }` directly |
| `shared/actions/effects/sow.ts` | Same pattern with `farmType: 'sow'` + `selectableFields` |
| `shared/actions/effects/fencing.ts` | `farmType: 'fence'` + `selectableEdges` + `extraWood` |
| `shared/actions/effects/construct.ts` | `farmType: 'room'` + `selectableTiles` + `maxSelections` |
| `shared/actions/effects/stables.ts` | `farmType: 'stable'` + `selectableTiles` + `maxSelections` |
| `shared/actions/effects/internal/selection.ts` | Emit `{ kind: 'selection', selection: { selectionType: 'farm-position' \| 'occupation-hand', selectablePositions/selectableCards, min/max } }`; `resolveChoice` reads `payload.positions` / `payload.cards` directly (no `choice.split(',')`) |
| `server/game-router.ts` | Delete confirmXxx HTTP routes (already partially S1) |
| `server/game/room-manager.ts` | Delete confirmXxx WS command routes (already partially S1) |
| `client/services/gameTransport.ts` | Rename `confirmNextPlayer / confirmPlayerSwitch / confirmHarvestFeed` methods to `resolveChoice` |
| `client/components/board/DraftOverlay*` | Switch data source from `state.draft` to `interaction.request` (kind: 'card-draft') |
| `client/components/interaction/*` | Switch from `interaction.stateId === 'farmSelect'` to `interaction.stateId === 'wait' && interaction.request.kind === 'farm-select'` |
| ~68 session test files (`server/__tests__/*.test.ts`) | Codemod `session.confirmXxx()` → `session.dispatch({ type: 'resolveChoice', ... })` |
| ~35 skip-tracker entries (`docs/skip-tracker.md`) | Process: ≥ 15 skips lifted (mechanically codemoded `'choice'` shape assertions); newly-introduced skips ≤ 5 |
| `docs/sprint-S2-progress.md` (new) | S2 carry-overs to S3 (any deferred items) |

### Locked decisions (do not re-litigate)

Per spec §11 + cross-sprint contract:
- 8 InteractionRequest kinds [L]; closed union, no new kinds added in S2
- `farm-select` single kind + `farmType` closed union of 5 (plow / sow / fence / room / stable) [L]
- `selection` single kind + `selectionType` closed union of 2 (farm-position / occupation-hand) [L]
- `feed` keeps queue-embedded payload (no nested sub-flow per player) [L]
- `card-draft` wraps existing `shared/draft/draft-manager.ts` simultaneous model; no BGA pass-around [L]
- Session traits: 4 mixins named `Setup / Round / Harvest / Draft` [L]
- 6 method-boundary decisions in spec §3.6 [L]
- `promptKey` is `PromptKey` closed union; `promptParams: PromptParams<K>` derived [L]
- `ChoiceNode` already gone (S1) — verify only [L]
- No per-connection card-draft view (issue #7) [L]

---

## Task 1: Add `PromptKey` closed union + `PromptParams<K>` conditional type

**Files:**
- Create: `shared/game/prompt-keys.ts`
- Create: `shared/game/__tests__/prompt-keys.test.ts`
- Modify: `shared/game/types.ts`

- [ ] **Step 1.1: Create `shared/game/prompt-keys.ts`**

```ts
import type { ReorganizeTrigger } from '../actions/effects/reorganize'
import type { CropType } from './field'

export type PromptKey =
  | 'ui.interactionAnimalReorg'
  | 'ui.confirmNextPlayer'
  | 'ui.confirmPlayerSwitch'
  | 'ui.harvestFeed'
  | 'ui.interactionPlow'
  | 'ui.interactionSow'
  | 'ui.interactionFence'
  | 'ui.interactionRoom'
  | 'ui.interactionStable'
  | 'ui.interactionSelection'
  | 'ui.interactionOccupationHand'
  | 'ui.interactionCardDraft'
  | 'ui.interactionExchange'
  | 'ui.interactionBakeBread'
  | 'ui.interactionFlowSelect'
  | 'ui.interactionOptionalAction'
  | `ui.cards.${string}`

export type PromptParams<K extends PromptKey> =
  K extends 'ui.harvestFeed'              ? { remaining: number; foodUsed: number }
  : K extends 'ui.interactionAnimalReorg' ? { trigger: ReorganizeTrigger }
  : K extends 'ui.interactionSow'         ? { allowedCrops?: CropType[]; needed?: number }
  : K extends 'ui.interactionRoom'        ? { needed?: number; maxSelections?: number }
  : K extends 'ui.interactionStable'      ? { needed?: number; maxSelections?: number }
  : K extends 'ui.interactionFence'       ? { extraWood?: number }
  : K extends 'ui.interactionSelection'   ? { maxSelections: number; minSelections?: number }
  : K extends 'ui.interactionOccupationHand' ? { maxSelections: number; minSelections: number }
  : K extends `ui.cards.${string}`        ? Record<string, unknown>
  : Record<string, never>
```

(`ReorganizeTrigger` and `CropType` are existing types — verify their import paths via grep first; adjust if either lives elsewhere.)

- [ ] **Step 1.2: Create unit test file**

Create `shared/game/__tests__/prompt-keys.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { PromptKey, PromptParams } from '../prompt-keys'

describe('PromptKey + PromptParams', () => {
  it('PromptKey is a closed union', () => {
    expectTypeOf<'ui.harvestFeed'>().toMatchTypeOf<PromptKey>()
    expectTypeOf<'ui.interactionPlow'>().toMatchTypeOf<PromptKey>()
    expectTypeOf<'ui.cards.A123_FrameBuilder'>().toMatchTypeOf<PromptKey>()
  })

  it('PromptParams maps harvestFeed to remaining/foodUsed', () => {
    expectTypeOf<PromptParams<'ui.harvestFeed'>>().toEqualTypeOf<{ remaining: number; foodUsed: number }>()
  })

  it('PromptParams maps interactionPlow to empty record', () => {
    expectTypeOf<PromptParams<'ui.interactionPlow'>>().toEqualTypeOf<Record<string, never>>()
  })

  it('PromptParams maps card-specific keys to Record<string, unknown> escape hatch', () => {
    expectTypeOf<PromptParams<'ui.cards.A123_FrameBuilder'>>().toEqualTypeOf<Record<string, unknown>>()
  })
})
```

- [ ] **Step 1.3: Run test, expect FAIL (file may not import correctly)**

Run: `pnpm exec vitest run shared/game/__tests__/prompt-keys.test.ts`
Expected: PASS (these are pure type assertions; no runtime behavior).
If FAIL: most likely cause is missing `expectTypeOf` import or wrong path.

- [ ] **Step 1.4: Verify typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: 0 errors. Pure additive types, no consumer breakage.

- [ ] **Step 1.5: Commit**

```bash
git add shared/game/prompt-keys.ts shared/game/__tests__/prompt-keys.test.ts
git commit -m "feat(types): add PromptKey closed union + PromptParams<K> conditional type"
```

---

## Task 2: Extend `InteractionRequest` with `farm-select` / `selection` / `card-draft` kinds

**Files:**
- Modify: `shared/game/types.ts`

- [ ] **Step 2.1: Add `FarmSelectType` and `SelectionKind` closed unions to `shared/game/types.ts`**

After existing `SubFlowKind` definition (around line 580), add:

```ts
export type FarmSelectType = 'plow' | 'sow' | 'fence' | 'room' | 'stable'
export type SelectionKind = 'farm-position' | 'occupation-hand'
```

Update `SubFlowKind` to include the 3 new kinds:

```ts
export type SubFlowKind =
  | 'choice'
  | 'animal-reorg'
  | 'confirm-next-player'
  | 'confirm-player-switch'
  | 'feed'
  | 'farm-select'      // NEW
  | 'selection'        // NEW
  | 'card-draft'       // NEW
```

- [ ] **Step 2.2: Extend `InteractionRequest` union with 3 new variants**

Add (immediately after existing 5 variants):

```ts
export type InteractionRequest =
  // existing 5 variants ...
  | { kind: 'farm-select'
      farm:
        | { farmType: 'plow'; selectableTiles: FarmTilePosition[] }
        | { farmType: 'sow'
            selectableFields: { tile: FarmTilePosition; allowedCrops: ('grain' | 'vegetable' | 'wood')[]; sourceCard?: string }[]
            maxSelections?: number }
        | { farmType: 'fence'; selectableEdges: string[]; extraWood?: number }
        | { farmType: 'room'; selectableTiles: FarmTilePosition[]; maxSelections: number }
        | { farmType: 'stable'; selectableTiles: FarmTilePosition[]; maxSelections: number }
      options?: ActionChoiceOption[]
    }
  | { kind: 'selection'
      selection:
        | { selectionType: 'farm-position'
            selectablePositions: FarmTilePosition[]
            minSelections?: number
            maxSelections: number }
        | { selectionType: 'occupation-hand'
            selectableCards: string[]
            minSelections: number
            maxSelections: number }
    }
  | { kind: 'card-draft'
      mode: 'simultaneous'
      round: number
      totalRounds: number
      poolSize: number
      seatOrder: string[]
      pools: Record<string, { occ: string[]; minor: string[] }>
      pendingPicks: string[]
      kept: Record<string, { occ: string[]; minor: string[] }>
    }
```

(`FarmTilePosition` is existing in same file. `ActionChoiceOption` too.)

- [ ] **Step 2.3: Run typecheck**

Run: `pnpm exec tsc -b`
Expected: 0 errors. Pure type additions, no consumer breakage yet.

- [ ] **Step 2.4: Commit**

```bash
git add shared/game/types.ts
git commit -m "feat(types): extend InteractionRequest with farm-select / selection / card-draft kinds"
```

---

## Task 3: Tighten `promptKey` field to `PromptKey` type + `promptParams` to `PromptParams<K>`

**Files:**
- Modify: `shared/game/types.ts` (multiple sites)
- Modify: `shared/engine/nodes.ts` (InteractionNode's `promptKey` field)
- Modify: `shared/engine/engine.ts` (snapshot/restore type signatures)

- [ ] **Step 3.1: Add `PromptKey` import + tighten `InteractionState.wait.promptKey` field**

In `shared/game/types.ts`, near top:

```ts
import type { PromptKey, PromptParams } from './prompt-keys'
```

Find `InteractionState` `'wait'` variant. Update `promptKey` field type:

```ts
| (InteractionBase & {
    stateId: 'wait'
    playerIndex: number
    spaceId?: string
    promptKey?: PromptKey                                  // was: string
    promptParams?: PromptParams<NonNullable<PromptKey>>     // was: Record<string, unknown>
    sourceCard?: string
    request: InteractionRequest
    // ...
  })
```

(Note: `'wait'` stateId may not exist yet in `InteractionState` if Task 4 hasn't run. For Task 3, locate the existing equivalent in current `InteractionState` and tighten its `promptKey: string` to `PromptKey`. Task 4 will collapse stateIds to 3.)

- [ ] **Step 3.2: Tighten `InteractionNode.promptKey` field type**

In `shared/engine/nodes.ts`, find `InteractionNode` class:

```ts
import type { PromptKey } from '../game/prompt-keys'

export class InteractionNode extends LeafNode {
  // existing fields
  promptKey?: PromptKey                  // was: string
  promptParams?: Record<string, unknown> // keep loose for now; tighten in Task 11 once schema is fully in place
  // ...
}
```

- [ ] **Step 3.3: Tighten engine snapshot/restore signature**

In `shared/engine/engine.ts`, find `Engine.snapshot()` and `Engine.restore()` for the `choiceData.promptKey` field. Change `promptKey?: string` → `promptKey?: PromptKey`.

- [ ] **Step 3.4: Add typecheck loop fix-up**

Run: `pnpm exec tsc -b 2>&1 | head -30`
Expected: errors at sites that emit `promptKey: 'ui.somethingNew'` where the literal isn't in `PromptKey`. For each:
- If literal exists but you forgot to add to PromptKey union → update prompt-keys.ts
- If literal is dynamically generated (e.g. `\`ui.cards.\${cardId}\``) → use `as PromptKey` cast (it matches the template literal branch)
- Most existing `'ui.interactionXxx'` literals are already in PromptKey union

- [ ] **Step 3.5: Run forced-green subset to confirm no behavior change**

```bash
pnpm exec vitest run \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/harvest-session.test.ts \
  server/__tests__/harvest-feed-session.test.ts \
  server/__tests__/on-end-turn-session.test.ts \
  server/__tests__/stage-hook-flow.test.ts \
  tests/pending-undo-regression.test.ts \
  shared/engine/__tests__/ \
  shared/game/__tests__/ 2>&1 | tail -10
```
Expected: ALL PASS (forced-green baseline 143/143).

- [ ] **Step 3.6: Commit**

```bash
git add shared/game/types.ts shared/engine/nodes.ts shared/engine/engine.ts
git commit -m "refactor(types): tighten promptKey field to PromptKey closed union"
```

---

## Task 4: Collapse `InteractionState` stateId 8 → 3 (idle / wait / gameover)

**Files:**
- Modify: `shared/game/types.ts`
- Modify: `shared/session/game-core.ts` (`buildInteraction()` body)
- Modify: `client/components/interaction/*` (frontend stateId switch)

- [ ] **Step 4.1: Replace `InteractionState` definition**

In `shared/game/types.ts`:

```ts
export type InteractionState =
  | { stateId: 'idle'; allowedCommands: InteractionCommand[]; anytimeActions: AnytimeAction[] }
  | { stateId: 'wait'
      playerIndex: number
      spaceId?: string
      promptKey?: PromptKey
      promptParams?: Record<string, unknown>
      sourceCard?: string
      request: InteractionRequest
      // ★ keep request-kind-specific accessor fields for backward compat during migration:
      options?: ActionChoiceOption[]            // duplicates request.options for kind === 'choice'; will deprecate
      farm?: InteractionFarmSelection           // for kind === 'farm-select' — to be replaced by request.farm
      selection?: InteractionSelection          // for kind === 'selection' — to be replaced by request.selection
      zones?: InteractionAnimalReorgZone[]      // for kind === 'animal-reorg'
      remaining?: number                         // for kind === 'feed'
      foodUsed?: number                          // for kind === 'feed'
      feedQueue?: FeedQueueEntry[]               // for kind === 'feed'
      nextPlayerIndex?: number                   // for kind === 'confirm-next-player'
      fromPlayerIndex?: number                   // for kind === 'confirm-player-switch'
      toPlayerIndex?: number                     // for kind === 'confirm-player-switch'
      allowedCommands: InteractionCommand[]
      anytimeActions: AnytimeAction[]
    }
  | { stateId: 'gameover'
      winners: string[]
      scores: PlayerScoreSummary[]
      allowedCommands: InteractionCommand[]
      anytimeActions: [] }
```

(The duplicated accessor fields are transitional — keep them in this task so frontend can iterate. Task 11 cleans up duplicate accessors.)

- [ ] **Step 4.2: Rewrite `GameCore.buildInteraction()` to emit only 3 stateIds**

Find `buildInteraction()` in `shared/session/game-core.ts` (post-S1: derives from `engineStack.peekInteraction()`). Replace the body:

```ts
private buildInteraction(): InteractionState {
  if (this.gameOver) {
    return {
      stateId: 'gameover',
      winners: this.computeWinners(),
      scores: this.computeScores(),
      allowedCommands: ['newGame', 'loadGame'],
      anytimeActions: [],
    }
  }
  const node = this.engineStack.peekInteraction()
  const composite = this.engineStack.peekPendingChoiceFromComposite()
  const frame = this.engineStack.current()

  if (!node || !frame) {
    return {
      stateId: 'idle',
      allowedCommands: ['takeAction', 'newGame', 'loadGame', 'undoStep', 'undoAction', 'devCreatePasture'],
      anytimeActions: this.buildAnytimeEntries().map((e) => e.descriptor),
    }
  }

  const playerIndex = frame.ownerPlayerIndex
  const spaceId = frame.spaceId
  const request = node.request!
  const promptKey = node.promptKey
  const promptParams = node.promptParams ?? composite?.promptParams
  const sourceCard = (node as { sourceCard?: string }).sourceCard

  // Build kind-specific accessor fields for transitional frontend
  const accessor: Partial<Extract<InteractionState, { stateId: 'wait' }>> = {}
  switch (request.kind) {
    case 'choice':
      accessor.options = request.options
      break
    case 'animal-reorg':
      accessor.zones = request.zones
      break
    case 'farm-select':
      // Build legacy InteractionFarmSelection from request.farm:
      accessor.farm = farmRequestToLegacy(request.farm)
      break
    case 'selection':
      accessor.selection = selectionRequestToLegacy(request.selection)
      break
    case 'feed':
      accessor.remaining = request.remaining
      accessor.foodUsed = request.foodUsed
      accessor.feedQueue = request.feedQueue
      break
    case 'confirm-next-player':
      accessor.nextPlayerIndex = request.nextPlayerIndex
      break
    case 'confirm-player-switch':
      accessor.fromPlayerIndex = request.fromPlayerIndex
      accessor.toPlayerIndex = request.toPlayerIndex
      break
    case 'card-draft':
      // No flat accessor — frontend reads request directly
      break
  }

  return {
    stateId: 'wait',
    playerIndex,
    spaceId,
    promptKey,
    promptParams,
    sourceCard,
    request,
    ...accessor,
    allowedCommands: this.computeAllowedCommands(request.kind),
    anytimeActions: this.buildAnytimeEntries().map((e) => e.descriptor),
  }
}

private computeAllowedCommands(kind: SubFlowKind): InteractionCommand[] {
  switch (kind) {
    case 'animal-reorg':
    case 'choice':
      return ['resolveChoice', 'undoStep', 'undoAction']
    case 'farm-select':
    case 'selection':
      return ['resolveChoice', 'undoStep', 'undoAction']
    case 'feed':
    case 'confirm-next-player':
    case 'confirm-player-switch':
    case 'card-draft':
      return ['resolveChoice']
  }
}
```

`farmRequestToLegacy` / `selectionRequestToLegacy` are tiny helpers translating new shape to old `InteractionFarmSelection` / `InteractionSelection` — define inline (~10 lines each) or in same file.

- [ ] **Step 4.3: Update frontend stateId switches**

Find usages: `grep -rn "stateId === 'choice'\|stateId === 'farmSelect'\|stateId === 'selection'\|stateId === 'animalReorg'\|stateId === 'harvestFeed'\|stateId === 'confirmNextPlayer'\|stateId === 'confirmPlayerSwitch'" client/`

For each hit, replace with:
- `stateId === 'wait' && interaction.request?.kind === '<corresponding new kind>'`

E.g. `client/components/interaction/InteractionBar.tsx` had:
```ts
if (interaction.stateId === 'choice') { /* ... */ }
```
Becomes:
```ts
if (interaction.stateId === 'wait' && interaction.request?.kind === 'choice') { /* ... */ }
```

- [ ] **Step 4.4: Run forced-green subset**

```bash
pnpm exec vitest run \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/harvest-session.test.ts \
  server/__tests__/harvest-feed-session.test.ts \
  server/__tests__/on-end-turn-session.test.ts \
  server/__tests__/stage-hook-flow.test.ts \
  tests/pending-undo-regression.test.ts \
  tests/protocol-types.test.ts \
  shared/engine/__tests__/ \
  shared/game/__tests__/ 2>&1 | tail -10
```
Expected: ALL PASS.

- [ ] **Step 4.5: Run typecheck**

Run: `pnpm exec tsc -b`
Expected: 0 errors. (May surface frontend errors from missed stateId switch sites — fix them.)

- [ ] **Step 4.6: Commit**

```bash
git add shared/game/types.ts shared/session/game-core.ts client/
git commit -m "refactor(protocol): collapse InteractionState stateId 8 → 3 (idle/wait/gameover)"
```

---

## Task 5: Rewrite plow / sow leaf actions to emit `farm-select` directly

**Files:**
- Modify: `shared/actions/effects/plow.ts`
- Modify: `shared/actions/effects/sow.ts`

- [ ] **Step 5.1: Rewrite `plow.ts execute()`**

In `shared/actions/effects/plow.ts`, find existing `execute` (post-S1: emits `{ type: 'request', request: { kind: 'choice' }, promptKey: 'ui.interactionPlow' }`). Replace:

```ts
execute: (ctx): ActionExecutionResult => {
  const { state, player, costs } = ctx
  const selectableTiles = computePlowableTiles(state, player)   // existing helper
  if (selectableTiles.length === 0) return { type: 'fail', logKey: 'log.actionFail' }

  return {
    type: 'request',
    request: {
      kind: 'farm-select',
      farm: { farmType: 'plow', selectableTiles },
    },
    promptKey: 'ui.interactionPlow',
  }
}
```

(`computePlowableTiles` lives in `shared/logic/farm/plow-validation.ts`; verify exact name + import.)

- [ ] **Step 5.2: Rewrite `sow.ts execute()`**

In `shared/actions/effects/sow.ts`, similar change with `farmType: 'sow'`:

```ts
execute: (ctx): ActionExecutionResult => {
  const { state, player, actionContext } = ctx
  const selectableFields = computeSowableFields(state, player, actionContext)
  if (selectableFields.length === 0) return { type: 'fail', logKey: 'log.actionFail' }

  const allowedCrops = (actionContext?.allowedCrops as ('grain' | 'vegetable' | 'wood')[]) ?? ['grain', 'vegetable']
  const maxSelections = actionContext?.maxSelections as number | undefined

  return {
    type: 'request',
    request: {
      kind: 'farm-select',
      farm: { farmType: 'sow', selectableFields, maxSelections },
    },
    promptKey: 'ui.interactionSow',
    promptParams: { allowedCrops, needed: maxSelections },
  }
}
```

(`computeSowableFields` lives in `shared/logic/farm/sow-validation.ts`.)

- [ ] **Step 5.3: Update `resolveChoice` of plow / sow to read structured payload**

Plow `resolveChoice`:

```ts
resolveChoice: (ctx, _selection, payload) => {
  const tiles = (payload as { tiles?: FarmTilePosition[] })?.tiles
  if (!tiles || tiles.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
  const tile = tiles[0]   // plow always selects 1
  return executePlow(ctx.state, ctx.player, tile)
}
```

Sow `resolveChoice`:

```ts
resolveChoice: (ctx, _selection, payload) => {
  const fields = (payload as { fields?: { tile: FarmTilePosition; crop: 'grain' | 'vegetable' | 'wood' }[] })?.fields ?? []
  if (fields.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
  return executeSow(ctx.state, ctx.player, fields)
}
```

(`executePlow` / `executeSow` are existing internal helpers; verify names.)

- [ ] **Step 5.4: Run plow/sow session tests**

```bash
pnpm exec vitest run \
  server/__tests__/plow-session.test.ts \
  server/__tests__/sow-session.test.ts 2>&1 | tail -10
```

Tests likely fail because they call legacy `commitFarm({ type: 'plow', tiles })` or assert `pending.farm.selectableTiles`. Track failures; if mechanical, update tests in this task; if too entangled, mark them as Task 12 codemod targets and add `it.skip` with note.

- [ ] **Step 5.5: Run forced-green subset**

```bash
pnpm exec vitest run \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/harvest-session.test.ts \
  tests/pending-undo-regression.test.ts \
  shared/engine/__tests__/ 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5.6: Run typecheck**

Run: `pnpm exec tsc -b` → 0 errors.

- [ ] **Step 5.7: Commit**

```bash
git add shared/actions/effects/plow.ts shared/actions/effects/sow.ts server/__tests__/plow-session.test.ts server/__tests__/sow-session.test.ts
git commit -m "refactor(actions): plow + sow emit farm-select kind directly; structured payload"
```

---

## Task 6: Rewrite fence / room / stable leaf actions to emit `farm-select` directly

**Files:**
- Modify: `shared/actions/effects/fencing.ts`
- Modify: `shared/actions/effects/construct.ts` (room-build path)
- Modify: `shared/actions/effects/stables.ts`

- [ ] **Step 6.1: Rewrite `fencing.ts execute()`**

```ts
execute: (ctx): ActionExecutionResult => {
  const { state, player, costs, actionContext } = ctx
  const selectableEdges = computeFencableEdges(state, player)
  const extraWood = (actionContext?.extraWood as number) ?? 0

  return {
    type: 'request',
    request: {
      kind: 'farm-select',
      farm: { farmType: 'fence', selectableEdges, extraWood },
    },
    promptKey: 'ui.interactionFence',
    promptParams: { extraWood },
  }
}

resolveChoice: (ctx, _selection, payload) => {
  const edges = (payload as { edges?: string[] })?.edges ?? []
  if (edges.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
  return executeFenceBuild(ctx.state, ctx.player, edges)
}
```

(`computeFencableEdges` from `shared/logic/farm/fence-validation.ts`; `executeFenceBuild` is the post-validation apply.)

- [ ] **Step 6.2: Rewrite `construct.ts` room-build branch**

`construct.ts` handles both rooms and stables (multi-action). Find the room-build path's `execute`:

```ts
execute: (ctx): ActionExecutionResult => {
  // ... existing prerequisite + cost check ...
  const selectableTiles = computeRoomBuildableTiles(state, player)
  if (selectableTiles.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
  const maxSelections = computeMaxBuildableRooms(state, player)

  return {
    type: 'request',
    request: {
      kind: 'farm-select',
      farm: { farmType: 'room', selectableTiles, maxSelections },
    },
    promptKey: 'ui.interactionRoom',
    promptParams: { needed: maxSelections, maxSelections },
  }
}

resolveChoice: (ctx, _selection, payload) => {
  const tiles = (payload as { tiles?: FarmTilePosition[] })?.tiles ?? []
  if (tiles.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
  return executeRoomBuild(ctx.state, ctx.player, tiles)
}
```

- [ ] **Step 6.3: Rewrite `stables.ts execute()`**

```ts
execute: (ctx): ActionExecutionResult => {
  const { state, player } = ctx
  const selectableTiles = computeStableBuildableTiles(state, player)
  const maxSelections = computeMaxBuildableStables(state, player)

  return {
    type: 'request',
    request: {
      kind: 'farm-select',
      farm: { farmType: 'stable', selectableTiles, maxSelections },
    },
    promptKey: 'ui.interactionStable',
    promptParams: { needed: maxSelections, maxSelections },
  }
}

resolveChoice: (ctx, _selection, payload) => {
  const tiles = (payload as { tiles?: FarmTilePosition[] })?.tiles ?? []
  if (tiles.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
  return executeStableBuild(ctx.state, ctx.player, tiles)
}
```

- [ ] **Step 6.4: Run session tests for fence / room / stable**

```bash
pnpm exec vitest run \
  server/__tests__/construct-room-payment-session.test.ts \
  server/__tests__/fence-resolveChoice.test.ts \
  server/__tests__/stables-resolveChoice.test.ts 2>&1 | tail -15
```

Some tests may fail because they call `commitFarm({ type: 'fence', edges })` or assert pending shape. If mechanical, fix here; if entangled, mark as Task 12 target.

- [ ] **Step 6.5: Run forced-green subset**

Run: `pnpm exec vitest run server/__tests__/reorganize-engine-session.test.ts server/__tests__/harvest-session.test.ts tests/pending-undo-regression.test.ts shared/engine/__tests__/ 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 6.6: Run typecheck**

Run: `pnpm exec tsc -b` → 0 errors.

- [ ] **Step 6.7: Commit**

```bash
git add shared/actions/effects/fencing.ts shared/actions/effects/construct.ts shared/actions/effects/stables.ts server/__tests__/
git commit -m "refactor(actions): fencing + construct + stables emit farm-select kind directly"
```

---

## Task 7: Rewrite `internal/selection.ts` — emit `selection` kind + structured payload (delete `choice.split(',')`)

**Files:**
- Modify: `shared/actions/effects/internal/selection.ts`

- [ ] **Step 7.1: Rewrite `execute()`**

```ts
import { writeCardExtraData } from '../../../cards/helpers/card-state'
import { runSelectionEffect } from '../../helpers/selection-effect-registry'
import type { ActionDefinition, FarmTilePosition } from '../../../game/types'

export const selectionAction: ActionDefinition = {
  id: 'selection',
  nameKey: 'actions.selection.name',
  descriptionKey: 'actions.selection.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, actionContext }) => {
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    const maxSelections = (actionContext?.maxSelections as number) ?? 1
    const minSelections = (actionContext?.minSelections as number) ?? 1

    if (kind === 'occupation-hand') {
      const selectableCards = (actionContext?.selectableCards as string[]) ?? player.occupationHand
      return {
        type: 'request',
        request: {
          kind: 'selection',
          selection: {
            selectionType: 'occupation-hand',
            selectableCards,
            minSelections,
            maxSelections,
          },
        },
        promptKey: 'ui.interactionOccupationHand',
        promptParams: { maxSelections, minSelections },
      }
    }

    // default: farm-position
    const selectablePositions = (actionContext?.selectablePositions as FarmTilePosition[])
      ?? computeFarmPositions(player)
    return {
      type: 'request',
      request: {
        kind: 'selection',
        selection: {
          selectionType: 'farm-position',
          selectablePositions,
          minSelections,
          maxSelections,
        },
      },
      promptKey: 'ui.interactionSelection',
      promptParams: { maxSelections, minSelections },
    }
  },
  resolveChoice: ({ player, sourceCard, actionContext, state }, _selection, payload) => {
    const positions = (payload as { positions?: string[] })?.positions ?? []
    const cards = (payload as { cards?: string[] })?.cards ?? []

    // Persist to card state if a sourceCard owns the selection (preserves S1 behavior)
    if (sourceCard) {
      const selected = positions.length > 0 ? positions : cards
      writeCardExtraData(player, sourceCard, 'selectedPositions', selected)
    }

    const effect = actionContext?.selectionEffect as string | undefined
    if (effect) {
      const followup = runSelectionEffect(effect, {
        player,
        positions,
        cards,
        sourceCard,
        state,
      })
      if (followup) {
        return {
          type: 'flow',
          flow: followup,
          extraData: { selectedPositions: positions, selectedCards: cards },
        }
      }
    }

    return {
      type: 'ok',
      extraData: { selectedPositions: positions, selectedCards: cards },
    }
  },
}

function computeFarmPositions(player: PlayerState): FarmTilePosition[] {
  // existing logic from buildFarmPositionSelectionInteraction; inline here
  // ...
}
```

(`runSelectionEffect` is existing in `selection-effect-registry.ts` but its signature accepts `positions` only — Task 7 extends it to also accept `cards`. Update that file too.)

- [ ] **Step 7.2: Update `runSelectionEffect` signature**

In `shared/actions/helpers/selection-effect-registry.ts`, extend the callback type to optionally accept `cards`:

```ts
export type SelectionEffectFn = (input: {
  player: PlayerState
  positions: string[]
  cards: string[]                 // NEW
  sourceCard?: string
  state: GameState
}) => ActionFlow | undefined

export function runSelectionEffect(name: string, input: SelectionEffectFn extends (i: infer I) => any ? I : never): ReturnType<SelectionEffectFn> {
  const fn = registry.get(name)
  return fn?.(input)
}
```

Update each registered fn (grep `registerSelectionEffect`) to accept the extended input. (Older effects may simply ignore `cards`.)

- [ ] **Step 7.3: Verify no `.split(',')` left in selection.ts**

Run: `grep -n "\.split(',\\?')" shared/actions/effects/internal/selection.ts`
Expected: empty.

- [ ] **Step 7.4: Run forced-green subset**

```bash
pnpm exec vitest run shared/engine/__tests__/ tests/pending-undo-regression.test.ts 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 7.5: Run typecheck**

Run: `pnpm exec tsc -b` → 0 errors.

- [ ] **Step 7.6: Commit**

```bash
git add shared/actions/effects/internal/selection.ts shared/actions/helpers/selection-effect-registry.ts
git commit -m "refactor(actions): selection.ts emits selection kind with structured payload (no split-comma)"
```

---

## Task 8: Wrap composite emit in real `InteractionNode` (delete `Engine.lastEmittedChoice` cache)

**Files:**
- Modify: `shared/engine/nodes.ts` (OrNode / XorNode / OptionalNode emit logic)
- Modify: `shared/engine/engine.ts` (delete cache field + getter; snapshot/restore drop cache)
- Modify: `server/__tests__/choice-disabled-option.test.ts` (rewrite to not access private field)

- [ ] **Step 8.1: Identify composite emit sites**

Run:
```bash
grep -nE "lastEmittedChoice|peekPendingChoiceFromComposite" shared/engine/ shared/session/ server/
```
Note all hits. The cache writes are in `OrNode` / `XorNode` (around L1207) and `OptionalNode` (around L1290) of pre-Task-8 nodes.ts; readers are in `Engine.peekPendingChoiceFromComposite()` + `GameCore.buildInteraction()` + `GameCore.getCurrentPending()` + `GameCore.resolvePendingChoice()`.

- [ ] **Step 8.2: Rewrite OrNode / XorNode / OptionalNode emit to construct InteractionNode**

In `shared/engine/nodes.ts`, in each composite class's emit-choice path:

```ts
// OLD (cached approach):
this.engine.lastEmittedChoice = {
  nodeId: this.id,
  promptKey: 'ui.interactionFlowSelect',
  options: choiceOptions,
}
return { type: 'choice', nodeId: this.id, choice: { promptKey: ..., options: choiceOptions } }

// NEW (construct real InteractionNode):
const interactionNode = new InteractionNode(
  this.engine.nextSyntheticNodeId('interaction:composite-or'),  // or 'composite-xor' / 'composite-optional'
  choiceOptions,
  { kind: 'choice', options: choiceOptions },
)
interactionNode.promptKey = 'ui.interactionFlowSelect'
// Insert interactionNode as a child of `this` (composite parent), or use engine.injectInteractionAt(this, interactionNode)
this.children.unshift(interactionNode)
this.engine.pendingInteractionNodeId = interactionNode.id
this.engine.pendingInteractionActionId = INTERACTION_ONLY_ACTION_ID
this.engine.pendingInteractionOwnerNodeId = this.id   // composite owns the interaction
this.engine.pendingInteractionContext = { params: {}, costs: {}, sourceCard: undefined, actionContext: undefined }
return { type: 'choice', nodeId: interactionNode.id, choice: { promptKey: 'ui.interactionFlowSelect', options: choiceOptions } }
```

(`INTERACTION_ONLY_ACTION_ID` from `shared/engine/engine-stack.ts` re-exported in S1.)

- [ ] **Step 8.3: Delete `Engine.lastEmittedChoice` field + `peekPendingChoiceFromComposite()` getter**

In `shared/engine/engine.ts`, find:

```ts
private lastEmittedChoice: { nodeId: string; promptKey?: PromptKey; options: ActionChoiceOption[]; promptParams?: Record<string, unknown> } | null = null

peekPendingChoiceFromComposite() { ... }
```

Delete both. Also delete from `snapshot()` body and `restore()` body the writes/reads of `lastEmittedChoice`.

- [ ] **Step 8.4: Update `GameCore.buildInteraction()` / `getCurrentPending()` / `resolvePendingChoice()` to drop fallback to composite cache**

Find sites in `shared/session/game-core.ts`:
```bash
grep -n "peekPendingChoiceFromComposite\|composite\." shared/session/game-core.ts
```

Each site that reads composite cache as fallback after `engineStack.peekInteraction()` returns null — now the InteractionNode is real, so `peekInteraction()` always returns it directly. Remove the composite-fallback branches.

- [ ] **Step 8.5: Rewrite `choice-disabled-option.test.ts` to not access private field**

In `server/__tests__/choice-disabled-option.test.ts`, replace any access like:
```ts
;(session.getEngineStack().current()!.engine as unknown as { lastEmittedChoice: { options: ActionChoiceOption[] } }).lastEmittedChoice.options[0].disabled = true
```

with a hook-based or fixture-based approach: use a test action whose `execute()` returns options where `disabled: true` is set in the option object itself, not patched at runtime via private field. Pattern:

```ts
const disabledTestAction: ActionDefinition = {
  id: 'test-disabled-choice',
  // ...
  execute: () => ({
    type: 'request',
    request: {
      kind: 'choice',
      options: [{ value: 'a', labelKey: 'a' }, { value: 'b', labelKey: 'b', disabled: true }],
    },
  }),
}
```

(`ActionChoiceOption.disabled?: boolean` — verify field exists in type; if not, add to types.)

Then assert that `dispatch({ type: 'resolveChoice', selection: 'b' })` returns `ok: false` (already locked by S1 Task 11 dispatch validation).

- [ ] **Step 8.6: Run engine tests + composite-emit-related session tests**

```bash
pnpm exec vitest run shared/engine/__tests__/ server/__tests__/choice-disabled-option.test.ts 2>&1 | tail -15
```

Expected: PASS. If composite emit construction has issues (children placement / pendingInteractionOwnerNodeId), fix and retry.

- [ ] **Step 8.7: Run forced-green subset**

```bash
pnpm exec vitest run \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/harvest-session.test.ts \
  tests/pending-undo-regression.test.ts \
  tests/protocol-types.test.ts \
  shared/engine/__tests__/ \
  shared/game/__tests__/serialization-cursor.test.ts 2>&1 | tail -15
```

Expected: ALL PASS (143/143 + composite emit tests).

- [ ] **Step 8.8: Run typecheck**

Run: `pnpm exec tsc -b` → 0 errors.

- [ ] **Step 8.9: Commit**

```bash
git add shared/engine/nodes.ts shared/engine/engine.ts shared/session/game-core.ts server/__tests__/choice-disabled-option.test.ts
git commit -m "refactor(engine): wrap composite (Or/Xor/Optional) emit in InteractionNode; delete lastEmittedChoice cache"
```

---

## Task 9: Extract `Setup` mixin from `game-core.ts`

**Files:**
- Create: `shared/session/phases/setup.ts`
- Create: `shared/session/phases/__tests__/setup.test.ts`
- Modify: `shared/session/game-core.ts`

- [ ] **Step 9.1: Identify Setup-phase methods in game-core.ts**

Inspect `shared/session/game-core.ts`. Setup methods:
- `constructor` body that handles `cardRegistry` / `customCards` / `sessionCardContext`
- `init()` (if exists)
- `loadState(stateOrSeed)` — including cursor-recovery branch
- `restoreEngineStackFromCursor(cursor)`
- `getCustomCardDefs()`
- `updatePlayerName(playerIndex, name)`

- [ ] **Step 9.2: Create `shared/session/phases/setup.ts`**

```ts
import type { GameCore } from '../session-core'
// ... imports as needed

export class SetupPhase {
  constructor(private core: GameCore) {}

  init(options: GameCoreOptions): void {
    // body of GameCore constructor's init logic, refactored to take options
    // ...
  }

  loadState(stateOrSeed: GameState | StateWithCursor | number | undefined): void {
    // body of GameCore.loadState
    // ...
  }

  restoreEngineStackFromCursor(cursor: EngineStackCursor): void {
    // body of GameCore.restoreEngineStackFromCursor
    // ...
  }

  getCustomCardDefs(): CustomCardDef[] {
    return this.core.sessionCardContext?.customCardDefs() ?? []
  }

  updatePlayerName(playerIndex: number, name: string): void {
    const player = this.core.state.players[playerIndex]
    if (player && name.trim()) player.name = name.trim()
  }
}
```

- [ ] **Step 9.3: Wire mixin from session-core.ts**

In `shared/session/game-core.ts` (or rename to `session-core.ts` in Task 13), add:

```ts
import { SetupPhase } from './phases/setup'

export class GameCore {
  setup: SetupPhase

  constructor(options: GameCoreOptions = {}) {
    this.setup = new SetupPhase(this)
    this.setup.init(options)
    if (options.stateOrSeed !== undefined) this.setup.loadState(options.stateOrSeed)
  }

  // ... rest of GameCore
}
```

Move the original constructor body (init + loadState parts) into `SetupPhase.init` / `SetupPhase.loadState`.

- [ ] **Step 9.4: Add Setup mixin unit test**

Create `shared/session/phases/__tests__/setup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GameCore } from '../../session-core'   // or game-core, depending on where main class lives

describe('SetupPhase', () => {
  it('init() configures cardRegistry on a new GameCore', () => {
    const core = new GameCore()
    expect(core.setup).toBeDefined()
    expect(core.state.players.length).toBeGreaterThan(0)
  })

  it('loadState() restores from a serialized state with engineStackCursor', () => {
    const core = new GameCore()
    const serialized = { state: core.state, engineStackCursor: { frames: [] } }
    const restored = new GameCore({ stateOrSeed: serialized })
    expect(restored.state.players).toEqual(core.state.players)
    expect(restored.getEngineStack().depth()).toBe(0)
  })

  it('updatePlayerName trims and applies to player', () => {
    const core = new GameCore()
    core.setup.updatePlayerName(0, '  Alice  ')
    expect(core.state.players[0].name).toBe('Alice')
  })
})
```

- [ ] **Step 9.5: Run Setup tests + forced-green subset**

```bash
pnpm exec vitest run shared/session/phases/__tests__/setup.test.ts 2>&1 | tail -10
pnpm exec vitest run server/__tests__/reorganize-engine-session.test.ts server/__tests__/harvest-session.test.ts tests/pending-undo-regression.test.ts 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 9.6: Run typecheck**

Run: `pnpm exec tsc -b` → 0 errors.

- [ ] **Step 9.7: Commit**

```bash
git add shared/session/phases/setup.ts shared/session/phases/__tests__/setup.test.ts shared/session/game-core.ts
git commit -m "refactor(session): extract SetupPhase mixin (init / loadState / restoreEngineStackFromCursor)"
```

---

## Task 10: Extract `Round` mixin (worker placement + confirm-* + round transition + `_returningHome` + `_roundEnd`)

**Files:**
- Create: `shared/session/phases/round.ts`
- Create: `shared/session/phases/__tests__/round.test.ts`
- Modify: `shared/session/game-core.ts`

This is the largest single task — roundPhase covers ~700 lines including takeAction, worker placement, confirm-* triggers/handlers, round transition, and 2 reorganize continuations.

- [ ] **Step 10.1: Identify Round-phase methods**

Methods to move:
- `takeAction(playerIndex, spaceId)` + worker placement chain
- `placeWorker(...)` (if private)
- `runPlaceFarmerAfterHooks(...)` (S1 already in-place mutation pattern)
- `startConfirmNextPlayer(nextPlayerIndex)` (S1 introduced)
- `startConfirmPlayerSwitch(fromPlayerIndex, toPlayerIndex)` (S1)
- `handleConfirmNextPlayerResolved(nextPlayerIndex)` (S1; includes BGA stLabor skip-next loop)
- `handleConfirmPlayerSwitchResolved(toPlayerIndex)` (S1)
- `nextPlayerIdx(...)` / `shouldSkipPlayerTurn(...)` helpers
- `finalizeActionLog(...)` / `finalizeCompletedAction(...)` / `finishCompletedActionTurn(...)`
- Round transition: round end / round start hook triggers / first player switch
- `continueAfterReorganize_returningHome(playerIndex)` (S1)
- `continueAfterReorganize_roundEnd(playerIndex, originPlayerIndex)` (S1)

- [ ] **Step 10.2: Create `shared/session/phases/round.ts`**

```ts
import type { GameCore } from '../session-core'
import type { GameState, PlayerState, ActionFlow } from '../../game/types'
// ... other imports

export class RoundPhase {
  constructor(private core: GameCore) {}

  takeAction(playerIndex: number, spaceId: string): SessionResponse {
    // body of GameCore.takeAction
    // delegates worker placement, runEngineSteps via this.core
    // ...
  }

  startConfirmNextPlayer(nextPlayerIndex: number): void {
    const node = new InteractionNode(
      this.core.makeNodeId('interaction:confirm-next-player'),
      [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
      { kind: 'confirm-next-player', nextPlayerIndex },
    )
    node.promptKey = 'ui.confirmNextPlayer'
    this.core.pushInteractionFrame(node, nextPlayerIndex, 'confirm-next-player')
  }

  startConfirmPlayerSwitch(fromPlayerIndex: number, toPlayerIndex: number): void {
    const node = new InteractionNode(
      this.core.makeNodeId('interaction:confirm-player-switch'),
      [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
      { kind: 'confirm-player-switch', fromPlayerIndex, toPlayerIndex },
    )
    node.promptKey = 'ui.confirmPlayerSwitch'
    this.core.pushInteractionFrame(node, toPlayerIndex, 'confirm-player-switch')
  }

  handleConfirmNextPlayerResolved(nextPlayerIndex: number): SessionResponse {
    this.core.pushHistory()
    this.core.state.currentPlayerIndex = nextPlayerIndex
    while (this.core.engineStack.depth() > 0) this.core.engineStack.pop()
    this.core.actionStartIndex = null
    this.core.history = []
    // BGA stLabor() skip-next loop:
    let safety = this.core.state.players.length
    while (safety-- > 0) {
      const allWorkersUsedNow = this.core.state.players.every((p) => workersAvailable(this.core.state, p) <= 0)
      if (allWorkersUsedNow) break
      const current = this.core.state.players[this.core.state.currentPlayerIndex]
      if (!current) break
      if (workersAvailable(this.core.state, current) <= 0) {
        const next = this.nextPlayerIdx(this.core.state.players, this.core.state.currentPlayerIndex)
        if (next === this.core.state.currentPlayerIndex) break
        this.core.state.currentPlayerIndex = next
        continue
      }
      if (!shouldSkipPlayerTurn(this.core.state, current)) break
      this.core.state.log.unshift({ key: 'log.playerSkipped', params: { playerName: current.name } })
      const next = this.nextPlayerIdx(this.core.state.players, this.core.state.currentPlayerIndex)
      if (next === this.core.state.currentPlayerIndex) break
      this.core.state.currentPlayerIndex = next
    }
    return this.core.respond()
  }

  handleConfirmPlayerSwitchResolved(toPlayerIndex: number): SessionResponse {
    this.core.pushHistory(false, true)
    const top = this.core.engineStack.current()
    if (top) {
      top.ownerPlayerIndex = toPlayerIndex
      top.deferredPlayerSwitch = null
    }
    this.core.engineStack.pop()
    return this.core.runEngineSteps()
  }

  continueAfterReorganize_returningHome(playerIndex: number): void {
    // body from S1
    // ...
  }

  continueAfterReorganize_roundEnd(playerIndex: number, originPlayerIndex: number | null): void {
    // body from S1
    // ...
  }

  // ... + nextPlayerIdx / round transition / etc.
}
```

- [ ] **Step 10.3: Wire RoundPhase from session-core.ts**

In `shared/session/game-core.ts`, add:

```ts
import { RoundPhase } from './phases/round'

export class GameCore {
  setup: SetupPhase
  round: RoundPhase
  // ...

  constructor(options: GameCoreOptions = {}) {
    this.setup = new SetupPhase(this)
    this.round = new RoundPhase(this)
    // ...
  }

  takeAction(playerIndex: number, spaceId: string): SessionResponse {
    return this.round.takeAction(playerIndex, spaceId)
  }
}
```

`dispatch.resolveChoice` switch route to mixin:

```ts
public resolveChoice(input: { selection?: string; payload?: unknown }): SessionResponse {
  const node = this.engineStack.peekInteraction()
  if (!node?.request) return this.respond(false, 'no pending interaction')
  switch (node.request.kind) {
    case 'confirm-next-player':
      return this.round.handleConfirmNextPlayerResolved(node.request.nextPlayerIndex)
    case 'confirm-player-switch':
      return this.round.handleConfirmPlayerSwitchResolved(node.request.toPlayerIndex)
    case 'feed':
      return this.harvest.handleFeedResolved(input.payload)
    case 'card-draft':
      return this.draft.handleCardDraftResolved(input.payload)
    case 'animal-reorg':
    case 'choice':
    case 'farm-select':
    case 'selection':
      return this.forwardToEngine(input)   // engine.resolveChoice → action.resolveChoice
    default: {
      const _exhaustive: never = node.request
      return this.respond(false, `unknown interaction kind`)
    }
  }
}
```

- [ ] **Step 10.4: Update `continueAfterSubFlow` umbrella to dispatch to mixins**

In session-core (or wherever S1's umbrella lives):

```ts
private continueAfterSubFlow(frame: EngineFrame): void {
  const stage = frame.stageResume
  if (!stage) return this.runEngineSteps()
  switch (stage.hook) {
    case 'onReorganizeComplete': {
      const trigger = (stage.extra?.trigger as ReorganizeTrigger) ?? 'anytime'
      const originPlayerIndex = (stage.extra?.originPlayerIndex as number | null | undefined) ?? null
      if (trigger === 'returning-home') return this.round.continueAfterReorganize_returningHome(stage.playerIndex)
      if (trigger === 'harvest-breed')  return this.harvest.continueAfterReorganize_harvestBreed(stage.playerIndex)
      if (trigger === 'round-end')      return this.round.continueAfterReorganize_roundEnd(stage.playerIndex, originPlayerIndex)
      return this.runEngineSteps()
    }
    default: return this.resumeStageFlow(stage)
  }
}
```

- [ ] **Step 10.5: Add Round mixin unit tests**

Create `shared/session/phases/__tests__/round.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GameCore } from '../../session-core'

describe('RoundPhase', () => {
  it('takeAction places worker and emits interaction', () => {
    const core = new GameCore({ stateOrSeed: 42 })
    const resp = core.takeAction(0, /* spaceId */ 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
  })

  it('startConfirmNextPlayer pushes synthetic frame with kind=confirm-next-player', () => {
    const core = new GameCore({ stateOrSeed: 42 })
    core.round.startConfirmNextPlayer(1)
    const node = core.engineStack.peekInteraction()
    expect(node?.request?.kind).toBe('confirm-next-player')
    expect(node?.request).toMatchObject({ nextPlayerIndex: 1 })
  })

  it('handleConfirmNextPlayerResolved advances currentPlayerIndex', () => {
    const core = new GameCore({ stateOrSeed: 42 })
    core.round.startConfirmNextPlayer(1)
    const resp = core.round.handleConfirmNextPlayerResolved(1)
    expect(resp.ok).toBe(true)
    expect(core.state.currentPlayerIndex).toBe(1)
  })
})
```

- [ ] **Step 10.6: Run Round mixin tests + forced-green subset**

```bash
pnpm exec vitest run shared/session/phases/__tests__/round.test.ts 2>&1 | tail -10
pnpm exec vitest run \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/harvest-session.test.ts \
  server/__tests__/on-end-turn-session.test.ts \
  server/__tests__/stage-hook-flow.test.ts \
  tests/pending-undo-regression.test.ts \
  shared/engine/__tests__/ 2>&1 | tail -10
```

Expected: PASS (143/143 baseline maintained).

- [ ] **Step 10.7: Run typecheck**

Run: `pnpm exec tsc -b` → 0 errors.

- [ ] **Step 10.8: Commit**

```bash
git add shared/session/phases/round.ts shared/session/phases/__tests__/round.test.ts shared/session/game-core.ts
git commit -m "refactor(session): extract RoundPhase mixin (takeAction / confirm-* / round transition)"
```

---

## Task 11: Extract `Harvest` mixin (field / feed / breed + `_harvestBreed` continuation + 12 harvest hook handlers)

**Files:**
- Create: `shared/session/phases/harvest.ts`
- Create: `shared/session/phases/__tests__/harvest.test.ts`
- Modify: `shared/session/game-core.ts`

- [ ] **Step 11.1: Identify Harvest-phase methods**

- `startHarvest()`
- Field phase: `startHarvestFieldPhase` / `harvestField` / `endHarvestFieldPhase`
- Feed phase: `startHarvestFeedingPhase` / `startFeedSubFlow` / `handleFeedResolved` / `endHarvestFeedingPhase`
- Breed phase: `startBreedPhase` / `continueEndHarvestEffects`
- Animal-bred detection + reorg pivot in `runEngineSteps` (this part stays in core but Harvest mixin owns the helper)
- `continueAfterReorganize_harvestBreed(playerIndex)`
- 12 harvest stage hook handlers: `continueBeforeHarvest` / `continueAfterReap` / `continueOnHarvest` / `continueOnEndHarvest` / `continueOnAfterHarvest` / `continueOnStartHarvestFeedingPhase` / `continueOnHarvestFeedingPhase` / `continueOnEndHarvestFeedingPhase` / `continueOnStartHarvestFieldPhase` / `continueOnHarvestFieldPhase` / `continueOnEndHarvestFieldPhase` / `continueOnBreedPhase`

- [ ] **Step 11.2: Create `shared/session/phases/harvest.ts`**

```ts
import type { GameCore } from '../session-core'
import type { GameState, PlayerState, FeedQueueEntry, FeedSelection } from '../../game/types'

export class HarvestPhase {
  constructor(private core: GameCore) {}

  startHarvest(): void {
    // body of GameCore.startHarvest
    // ...
  }

  startFeedSubFlow(playerIndex: number, remaining: number, foodUsed: number, feedQueue?: FeedQueueEntry[]): void {
    const node = new InteractionNode(
      this.core.makeNodeId('interaction:feed'),
      [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
      { kind: 'feed', remaining, foodUsed, feedQueue },
    )
    node.promptKey = 'ui.harvestFeed'
    this.core.pushInteractionFrame(node, playerIndex, 'feed')
  }

  handleFeedResolved(payload: { selections: FeedSelection[] } | FeedSelection[]): SessionResponse {
    const selections = Array.isArray(payload) ? payload : payload.selections
    // body from S1 confirmHarvestFeed (~150 lines: lookupExchange / cappedSelections / 
    // BASIC_CONVERSION_SOURCE_ID handling / exchange application / begging / feedQueue advance)
    // Use this.core.engineStack.current()?.ownerPlayerIndex for player index
    // After processing, if more queue entries: this.startFeedSubFlow(next.index, next.remaining, next.foodUsed, queue.slice(1))
    // Else: this.core.engineStack.pop(); this.startBreedPhase()
    // ...
  }

  continueAfterReorganize_harvestBreed(playerIndex: number): void {
    // body from S1
  }

  startBreedPhase(): void {
    // body from S1
  }

  // 12 hook handlers:
  continueBeforeHarvest(): void { /* ... */ }
  continueAfterReap(): void { /* ... */ }
  continueOnHarvest(): void { /* ... */ }
  // ... 9 more
}
```

- [ ] **Step 11.3: Wire HarvestPhase from session-core.ts**

```ts
import { HarvestPhase } from './phases/harvest'

export class GameCore {
  setup: SetupPhase
  round: RoundPhase
  harvest: HarvestPhase
  // ...

  constructor(options: GameCoreOptions = {}) {
    this.setup = new SetupPhase(this)
    this.round = new RoundPhase(this)
    this.harvest = new HarvestPhase(this)
    // ...
  }
}
```

`resumeStageFlow` (in session-core or stage-resume.ts) dispatches to harvest.continue<HookName>:

```ts
private resumeStageFlow(stage: StageResumeState): void {
  switch (stage.hook) {
    case 'onBeforeHarvest':  return this.harvest.continueBeforeHarvest()
    case 'onAfterReap':      return this.harvest.continueAfterReap()
    case 'onHarvest':        return this.harvest.continueOnHarvest()
    case 'onEndHarvest':     return this.harvest.continueOnEndHarvest()
    case 'onAfterHarvest':   return this.harvest.continueOnAfterHarvest()
    case 'onStartHarvestFeedingPhase':  return this.harvest.continueOnStartHarvestFeedingPhase()
    case 'onHarvestFeedingPhase':       return this.harvest.continueOnHarvestFeedingPhase()
    case 'onEndHarvestFeedingPhase':    return this.harvest.continueOnEndHarvestFeedingPhase()
    case 'onStartHarvestFieldPhase':    return this.harvest.continueOnStartHarvestFieldPhase()
    case 'onHarvestFieldPhase':         return this.harvest.continueOnHarvestFieldPhase()
    case 'onEndHarvestFieldPhase':      return this.harvest.continueOnEndHarvestFieldPhase()
    case 'onBreedPhase':                return this.harvest.continueOnBreedPhase()
    case 'onRoundStart':                return this.round.continueRoundStart()
    case 'onEndTurn':                   return this.round.continueEndTurn()
    case 'onReturnHome':                return this.round.continueReturnHome()
    case 'onStartReturnHome':           return this.round.continueStartReturnHome()
    case 'onAfterRoundEnd':             return this.round.continueAfterRoundEnd()
    case 'onAllWorkersPlaced':          return this.round.continueAllWorkersPlaced()
    case 'onBeforeReturnHome':          return this.round.continueBeforeReturnHome()
    case 'onBeforeStartOfTurn':         return this.round.continueBeforeStartOfTurn()
    case 'onStartHarvest':              return this.harvest.continueOnStartHarvest()
    case 'onStartHarvestFeedingPhase':  return this.harvest.continueOnStartHarvestFeedingPhase()
    case 'onReorganizeComplete':        return this.continueAfterSubFlow(this.engineStack.current()!)
    default: return this.runEngineSteps()
  }
}
```

(Verify hook list matches the actual `StageResumeState.hook` union; some entries may be deprecated.)

- [ ] **Step 11.4: Add Harvest mixin unit tests**

Create `shared/session/phases/__tests__/harvest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GameCore } from '../../session-core'

describe('HarvestPhase', () => {
  it('startFeedSubFlow pushes synthetic frame with kind=feed', () => {
    const core = new GameCore({ stateOrSeed: 42 })
    core.harvest.startFeedSubFlow(0, 5, 0)
    const node = core.engineStack.peekInteraction()
    expect(node?.request?.kind).toBe('feed')
    expect(node?.request).toMatchObject({ remaining: 5, foodUsed: 0 })
  })

  it('handleFeedResolved advances feedQueue', () => {
    const core = new GameCore({ stateOrSeed: 42 })
    core.harvest.startFeedSubFlow(0, 3, 0, [{ index: 1, remaining: 4, foodUsed: 0 }])
    const resp = core.harvest.handleFeedResolved({ selections: [] })
    expect(resp.ok).toBe(true)
    // After resolving player 0, expect next frame for player 1:
    const node = core.engineStack.peekInteraction()
    expect(node?.request?.kind).toBe('feed')
    expect(node?.request).toMatchObject({ remaining: 4 })
  })
})
```

- [ ] **Step 11.5: Run Harvest mixin tests + forced-green subset**

```bash
pnpm exec vitest run shared/session/phases/__tests__/harvest.test.ts 2>&1 | tail -10
pnpm exec vitest run \
  server/__tests__/harvest-session.test.ts \
  server/__tests__/harvest-feed-session.test.ts \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/stage-hook-flow.test.ts \
  shared/game/__tests__/serialization-cursor.test.ts 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 11.6: Run typecheck**

Run: `pnpm exec tsc -b` → 0 errors.

- [ ] **Step 11.7: Commit**

```bash
git add shared/session/phases/harvest.ts shared/session/phases/__tests__/harvest.test.ts shared/session/game-core.ts
git commit -m "refactor(session): extract HarvestPhase mixin (field/feed/breed + 12 hook handlers + harvestBreed continuation)"
```

---

## Task 12: Extract `Draft` mixin + wrap `card-draft` kind to InteractionRequest

**Files:**
- Create: `shared/session/phases/draft.ts`
- Create: `shared/session/phases/__tests__/draft.test.ts`
- Modify: `shared/session/game-core.ts`
- Modify: `shared/protocol/ws.ts` (delete `draftSubmit` ClientCommand variant)
- Modify: `server/game-router.ts` (delete `/api/game/draft-submit` HTTP route)
- Modify: `server/game/room-manager.ts` (delete `'draftSubmit'` WS command case)
- Modify: `client/components/board/DraftOverlay*` (switch data source)

- [ ] **Step 12.1: Create `shared/session/phases/draft.ts`**

```ts
import type { GameCore } from '../session-core'
import {
  startSimultaneousDraft,
  applyDraftPick,
  advanceDraftRound,
  draftComplete,
  allPlayersPicked,
} from '../../draft/draft-manager'
import { InteractionNode } from '../../engine/nodes'
import { INTERACTION_ONLY_ACTION_ID, subflowSpaceId } from '../../engine/engine-stack'

export class DraftPhase {
  constructor(private core: GameCore) {}

  startDraft(): void {
    const draftState = startSimultaneousDraft(this.core.state)
    this.core.state.draft = draftState
    this.core.state.phase = 'draft'
    this.startCardDraftPrompt()
  }

  private startCardDraftPrompt(): void {
    const draft = this.core.state.draft
    if (!draft) return
    const node = new InteractionNode(
      this.core.makeNodeId('interaction:card-draft'),
      [],   // no choice options; UI reads request.pools
      {
        kind: 'card-draft',
        mode: 'simultaneous',
        round: draft.round,
        totalRounds: draft.totalRounds,
        poolSize: draft.poolSize,
        seatOrder: draft.seatOrder,
        pools: draft.pools,
        pendingPicks: draft.pendingPicks,
        kept: draft.kept,
      },
    )
    node.promptKey = 'ui.interactionCardDraft'
    this.core.engineStack.push({
      engine: this.core.createFlowEngine({ type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }),
      source: { kind: 'flow', flow: { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID } },
      ownerPlayerIndex: 0,   // simultaneous; UI per-player from pendingPicks
      spaceId: subflowSpaceId('card-draft'),
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'card-draft',
    })
    this.core.engineStack.current()!.engine.injectInteraction(node)
  }

  handleCardDraftResolved(payload: unknown): SessionResponse {
    const { playerId, pickedOcc, pickedMinor } = payload as {
      playerId: string
      pickedOcc?: string
      pickedMinor?: string
    }
    const draft = this.core.state.draft
    if (!draft) return this.core.respond(false, 'no draft in progress')

    applyDraftPick(draft, playerId, { pickedOcc, pickedMinor })

    if (allPlayersPicked(draft)) {
      advanceDraftRound(draft)
      if (draftComplete(draft)) {
        this.core.engineStack.pop()
        this.core.state.phase = 'work'
        this.core.state.draft = null
        return this.core.runEngineSteps()
      }
      // next round: replace InteractionNode with updated request
      this.core.engineStack.pop()
      this.startCardDraftPrompt()
    }
    return this.core.respond()
  }
}
```

(`startSimultaneousDraft` / `applyDraftPick` / `advanceDraftRound` / `draftComplete` / `allPlayersPicked` are existing exports of `shared/draft/draft-manager.ts` — verify exact names; adjust if different. The function may be named `applyPick` etc.)

- [ ] **Step 12.2: Wire DraftPhase from session-core.ts**

```ts
import { DraftPhase } from './phases/draft'

export class GameCore {
  setup: SetupPhase
  round: RoundPhase
  harvest: HarvestPhase
  draft: DraftPhase
  // ...

  constructor(options: GameCoreOptions = {}) {
    this.setup = new SetupPhase(this)
    this.round = new RoundPhase(this)
    this.harvest = new HarvestPhase(this)
    this.draft = new DraftPhase(this)
    // ...
  }
}
```

`resolveChoice` switch already routes `case 'card-draft': return this.draft.handleCardDraftResolved(input.payload)` (added in Task 10 Step 10.3).

- [ ] **Step 12.3: Replace existing draft entry with DraftPhase**

Find existing draft-entry code in game-core.ts (likely in createInitialState or wherever phase=='draft' starts). Replace direct `state.draft = ...` writes with `this.draft.startDraft()`.

- [ ] **Step 12.4: Delete `'draftSubmit'` ClientCommand variant**

In `shared/protocol/ws.ts`:

```ts
// DELETE:
//   | { type: 'draftSubmit'; playerId: string; pickedOcc?: string; pickedMinor?: string }
```

(The protocol's resolveChoice variant already handles card-draft via `payload`.)

- [ ] **Step 12.5: Delete `/api/game/draft-submit` HTTP route**

In `server/game-router.ts`, find and delete the case for `'draftSubmit'` (if any). Same for WS command in `server/game/room-manager.ts`.

- [ ] **Step 12.6: Update `client/components/board/DraftOverlay` data source**

Find `DraftOverlay.tsx` (or similar). Replace reads of `state.draft` with `interaction.request` (when `interaction.stateId === 'wait' && interaction.request.kind === 'card-draft'`):

```tsx
// OLD:
const draft = useGameState((s) => s.draft)
if (!draft) return null

// NEW:
const interaction = useInteraction()
if (interaction.stateId !== 'wait' || interaction.request.kind !== 'card-draft') return null
const draft = interaction.request   // typed as card-draft variant
```

UI rendering body unchanged (fields like `pools` / `pendingPicks` / `kept` are identical between `DraftState` and `card-draft` request).

- [ ] **Step 12.7: Update client transport for draft submit**

In `client/services/gameTransport.ts`, find `draftSubmit` method. Rename to `resolveChoice`:

```ts
// OLD:
draftSubmit(playerId: string, picks: { pickedOcc?: string; pickedMinor?: string }): Promise<...> { ... }

// NEW: (use existing resolveChoice; no specific draft method needed)
// callers: this.transport.resolveChoice({ payload: { playerId, ...picks } })
```

Update DraftOverlay's submit handler to call `transport.resolveChoice({ payload: { playerId: myId, pickedOcc, pickedMinor } })`.

- [ ] **Step 12.8: Add Draft mixin unit tests**

Create `shared/session/phases/__tests__/draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GameCore } from '../../session-core'

describe('DraftPhase', () => {
  it('startDraft pushes card-draft request', () => {
    const core = new GameCore({ stateOrSeed: 42, options: { draft: 'simultaneous' } })
    core.draft.startDraft()
    const node = core.engineStack.peekInteraction()
    expect(node?.request?.kind).toBe('card-draft')
  })

  it('handleCardDraftResolved processes picks', () => {
    const core = new GameCore({ stateOrSeed: 42, options: { draft: 'simultaneous' } })
    core.draft.startDraft()
    const node = core.engineStack.peekInteraction()
    if (node?.request?.kind !== 'card-draft') throw new Error('expected card-draft')
    const playerId = node.request.seatOrder[0]
    const occ = node.request.pools[playerId]?.occ[0]
    const resp = core.draft.handleCardDraftResolved({ playerId, pickedOcc: occ })
    expect(resp.ok).toBe(true)
  })

  it('completing all rounds transitions to work phase', () => {
    // simulate full draft via repeated handleCardDraftResolved
    // ...
  })
})
```

- [ ] **Step 12.9: Run Draft mixin tests + forced-green subset**

```bash
pnpm exec vitest run shared/session/phases/__tests__/draft.test.ts 2>&1 | tail -10
pnpm exec vitest run \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/harvest-session.test.ts \
  server/__tests__/__draft__/ \
  shared/game/__tests__/serialization-cursor.test.ts 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 12.10: Run typecheck**

Run: `pnpm exec tsc -b` → 0 errors.

- [ ] **Step 12.11: Commit**

```bash
git add shared/session/phases/draft.ts shared/session/phases/__tests__/draft.test.ts shared/session/game-core.ts shared/protocol/ws.ts server/game-router.ts server/game/room-manager.ts client/components/board/DraftOverlay*.tsx client/services/gameTransport.ts
git commit -m "refactor(session): extract DraftPhase mixin; wrap card-draft kind to InteractionRequest"
```

---

## Task 13: Final cleanup — delete `PendingAction` union + ClientCommand legacy variants + GameCore confirm shims + EMPTY_ENGINE_STACK_CURSOR

**Files:**
- Modify: `shared/game/types.ts` (delete `PendingAction` union)
- Modify: `shared/game/serialization.ts` (delete `EMPTY_ENGINE_STACK_CURSOR` + ctx required)
- Modify: `shared/protocol/ws.ts` (delete remaining legacy variants)
- Modify: `shared/protocol/game.ts` (delete `pending: PendingAction` from `GameSyncPayload`)
- Modify: `shared/session/game-core.ts` (delete 3 confirm adapter shims; rename file to session-core.ts)
- Modify: `client/services/gameTransport.ts` (rename methods)
- Modify: `server/game-router.ts` / `server/game/room-manager.ts` (delete remaining confirmXxx routes)
- Modify: ~30 test files using `serializeState(state)` without ctx

- [ ] **Step 13.1: Delete `serializeState` `ctx` optional + EMPTY_ENGINE_STACK_CURSOR**

In `shared/game/serialization.ts`:

```ts
// DELETE:
// const EMPTY_ENGINE_STACK_CURSOR: EngineStackCursor = Object.freeze({
//   frames: Object.freeze([]) as readonly EngineFrameCursor[],
// }) as EngineStackCursor

// CHANGE:
export const serializeState = (
  state: GameState,
  ctx: { engineStack: EngineStack },     // was: ctx?: { engineStack: EngineStack }
): SerializedGameState => {
  // body uses ctx.engineStack.toCursor() unconditionally
}
```

Same for `serializeStateForPlayer`.

- [ ] **Step 13.2: Codemod ~30 test callers of `serializeState(state)` to pass ctx**

Run: `grep -rn "serializeState(" shared/ server/ tests/ | grep -v test.ts.snap`
For each non-test caller: already migrated in S1.
For each test caller (the ~30 left): pass minimal ctx:

```ts
// OLD:
const serialized = serializeState(state)

// NEW:
const session = new GameSession()   // or use existing test setup
const serialized = serializeState(state, { engineStack: session.getEngineStack() })

// OR if no session in scope: construct an empty stack:
import { EngineStack } from '../../shared/engine/engine-stack'
const serialized = serializeState(state, { engineStack: new EngineStack() })
```

(Consider writing a tiny test helper `serializeWithEmptyStack(state)` if pattern repeats > 5 times.)

- [ ] **Step 13.3: Delete 3 GameCore confirm adapter shims**

In `shared/session/game-core.ts`, find and delete:

```ts
// DELETE:
// public confirmNextPlayer(): SessionResponse {
//   if (this.pending.type !== 'confirmNextPlayer') return this.respond(false, 'no pending confirmNextPlayer')
//   return this.handleConfirmNextPlayerResolved(this.pending.nextPlayerIndex)
// }
// public confirmPlayerSwitch(): SessionResponse { ... }
// public confirmHarvestFeed(playerIndex: number, selections: ...): SessionResponse { ... }
```

(All 3 methods deleted entirely.)

- [ ] **Step 13.4: Delete remaining ClientCommand legacy variants**

In `shared/protocol/ws.ts`:

```ts
// DELETE:
//   | { type: 'confirmNextPlayer' }
//   | { type: 'confirmPlayerSwitch' }
//   | { type: 'feed'; selections: FeedSelection[] }
//   | { type: 'nextPlayer' }    // if exists separately
```

(`resolveChoice` already handles all 5 + 3 new kinds.)

- [ ] **Step 13.5: Delete `pending: PendingAction` from `GameSyncPayload`**

In `shared/protocol/game.ts`:

```ts
// DELETE:
//   pending: PendingAction
```

(`GameSyncPayload` already carries the cursor via `state.engineStack`; pending is fully redundant after Task 4.)

- [ ] **Step 13.6: Delete `PendingAction` union type**

In `shared/game/types.ts`, find:

```ts
export type PendingAction =
  | { type: 'none' }
  | { type: 'choice'; ... }
  | { type: 'animalReorg'; ... }
  | { type: 'harvestFeed'; ... }
  | { type: 'confirmNextPlayer'; ... }
  | { type: 'confirmPlayerSwitch'; ... }
  | { type: 'cardDraft'; ... }
```

Delete the entire definition.

If `clonePending` / `getCurrentPending` / other consumers still exist in game-core.ts, delete them or repurpose:
- `clonePending` is dead after PendingAction deletion → delete
- `getCurrentPending` was used by HistoryEntry write path; if HistoryEntry.pending field stays (S1 progress confirmed `undoStep` reads it), then `getCurrentPending` returns a structurally-equivalent ad-hoc shape. Decide:
  - (a) `HistoryEntry.pending: { type: 'choice' | 'none' }` — narrow to just what `undoStep` reads
  - (b) Restructure undoStep to not read pending.type → delete pending field from HistoryEntry too

→ Decision: choose (a) — narrow to discriminator-only. Define a local `HistorySentinel = { kind: 'choice' | 'none' }` and write that.

- [ ] **Step 13.7: Codemod ~68 session test files for `confirmXxx` calls**

Use ts-morph or perl/sed:

```bash
# Find:
grep -rln "session\.confirmNextPlayer\|session\.confirmPlayerSwitch\|session\.confirmHarvestFeed" server/__tests__/ tests/ | sort -u > /tmp/codemod-targets.txt

# For each file: replace
#   session.confirmNextPlayer()           → session.dispatch({ type: 'resolveChoice' })
#   session.confirmPlayerSwitch()         → session.dispatch({ type: 'resolveChoice' })
#   session.confirmHarvestFeed(idx, sel)  → session.dispatch({ type: 'resolveChoice', payload: { selections: sel } })
```

Test by running fast suite:

```bash
pnpm test:fast 2>&1 | tail -10
```

Expected: 0 fail (or fewer fail than before — most card tests asserting old shape now caught).

- [ ] **Step 13.8: Verify forced-green subset all PASS + lint + build**

```bash
pnpm exec vitest run \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/harvest-session.test.ts \
  server/__tests__/harvest-feed-session.test.ts \
  server/__tests__/on-end-turn-session.test.ts \
  server/__tests__/stage-hook-flow.test.ts \
  tests/pending-undo-regression.test.ts \
  tests/protocol-types.test.ts \
  tests/game-sync-pipeline.test.ts \
  shared/actions/effects/__tests__/reorganize-engine.test.ts \
  shared/engine/__tests__/ \
  shared/game/__tests__/ \
  shared/session/phases/__tests__/ 2>&1 | tail -10

pnpm test:fast 2>&1 | tail -5
pnpm test:slow 2>&1 | tail -5
pnpm exec tsc -b 2>&1 | tail -5
pnpm run lint 2>&1 | tail -3
pnpm run build 2>&1 | tail -5
```

Expected: All green.

- [ ] **Step 13.9: Verify spec §7 DoD (full checklist walk)**

- [ ] `PendingAction` not in code (`grep -rn "PendingAction" shared/ server/ src/ client/`)
- [ ] `InteractionState` only has 3 stateId
- [ ] `InteractionRequest` 8 kinds
- [ ] `PromptKey` closed union exists
- [ ] `GameSyncPayload.pending` not in code
- [ ] `ClientCommand` choice family only `resolveChoice`
- [ ] `session-core.ts` ≤ 800 lines
- [ ] 4 mixins exist
- [ ] `Engine.lastEmittedChoice` not in code
- [ ] OrNode/XorNode/OptionalNode emit construct InteractionNode
- [ ] 3 GameCore confirm shims gone
- [ ] `client/services/gameTransport.ts` renamed methods
- [ ] `EMPTY_ENGINE_STACK_CURSOR` not in code
- [ ] `serializeState` `ctx` required
- [ ] `selection.ts` `choice.split(',')` not in code
- [ ] cursor round-trip 8 kinds (3 todo from S1 + 5 covered already; add farm-select / selection / card-draft tests)
- [ ] skip-tracker reduced ≥ 15

If any unchecked, add a fix step here.

- [ ] **Step 13.10: Add 3 cursor round-trip tests for new kinds**

Append to `shared/game/__tests__/serialization-cursor.test.ts`:

```ts
it('farm-select sub-flow survives serialize/rehydrate', () => {
  const session = new GameSession({ stateOrSeed: 42 })
  // Drive to plow interaction (e.g. take family-growth-with-farmland action)
  session.dispatch({ type: 'action', spaceId: 'plow' })
  
  const before = session.getInteraction()
  expect(before.stateId).toBe('wait')
  expect(before.request?.kind).toBe('farm-select')
  
  const serialized = serializeState(session.getState(), { engineStack: session.getEngineStack() })
  const { state, engineStackCursor } = rehydrateState(serialized)
  const restored = new GameSession({ stateOrSeed: { state, engineStackCursor } })
  
  const after = restored.getInteraction()
  expect(after.stateId).toBe('wait')
  expect(after.request?.kind).toBe('farm-select')
})

it('selection sub-flow survives serialize/rehydrate', () => {
  // similar pattern with farm-position selection
})

it('card-draft sub-flow survives serialize/rehydrate', () => {
  const session = new GameSession({ stateOrSeed: 42, options: { draft: 'simultaneous' } })
  // session starts in draft phase; should already have card-draft request
  
  const before = session.getInteraction()
  expect(before.stateId).toBe('wait')
  expect(before.request?.kind).toBe('card-draft')
  
  const serialized = serializeState(session.getState(), { engineStack: session.getEngineStack() })
  const { state, engineStackCursor } = rehydrateState(serialized)
  const restored = new GameSession({ stateOrSeed: { state, engineStackCursor } })
  
  const after = restored.getInteraction()
  expect(after.stateId).toBe('wait')
  expect(after.request?.kind).toBe('card-draft')
})
```

Run: `pnpm exec vitest run shared/game/__tests__/serialization-cursor.test.ts`
Expected: 8 PASS (5 existing + 3 new).

- [ ] **Step 13.11: Update `docs/skip-tracker.md`**

For each newly resolved skip (from Task 5/6/7 leaf rewrites + Task 8 composite cleanup + Task 13 confirm shim removal):
1. Move row from "Active skips" to "Resolved skips" with note "Resolved in S2"
2. Tally: target ≥ 15 lifted

For any newly-introduced skip (should be ≤ 5):
1. Add to "Active skips" with reason
2. Target sprint S7 (or sooner if specific S3/S4 task)

- [ ] **Step 13.12: Update `docs/sprint-S2-progress.md` (new file)**

Create `docs/sprint-S2-progress.md`:

```markdown
# Sprint S2 — completed YYYY-MM-DD

InteractionRequest 8 kind full rollout + Session traits split + composite emit InteractionNode + S1 carry-overs cleaned.

## Completed
- All 8 InteractionRequest kinds operational (3 new: farm-select, selection, card-draft)
- InteractionState collapsed 8 → 3 stateId (idle/wait/gameover)
- ClientCommand choice family unified to resolveChoice
- PendingAction union deleted
- Session split: session-core (cross-phase) + Setup/Round/Harvest/Draft mixins
- Engine.lastEmittedChoice cache eliminated; composite (Or/Xor/Optional) emit constructs real InteractionNode
- 3 GameCore confirm adapter shims deleted; ClientCommand legacy variants deleted
- EMPTY_ENGINE_STACK_CURSOR fallback deleted; serializeState ctx required
- promptKey closed union; promptParams typed schema
- selection.ts string-encoding eliminated
- Skip-tracker: <N1> → <N2> active skips (lifted <delta>)

## Carry-overs to S3
- (any items deferred during S2)

## Carry-overs to S7 (card test regression)
- <list>
```

- [ ] **Step 13.13: Final commit**

```bash
git add shared/ server/ client/ tests/ docs/skip-tracker.md docs/sprint-S2-progress.md
git commit -m "refactor(s2): final cleanup — delete PendingAction union + 3 confirm shims + EMPTY_ENGINE_STACK_CURSOR + ws.ts legacy variants

Sprint S2 complete. Closes interaction request rollout and session traits split.
"
```

- [ ] **Step 13.14: Optional rebase + open PR**

```bash
git fetch origin main
git rebase origin/main   # should be fast-forward unless main moved
# Do NOT push automatically — wait for user instruction
```

PR draft:

```bash
gh pr create --draft --title "S2: InteractionRequest full rollout + Session traits split" --body "$(cat <<'EOF'
## Summary
Implements docs/sprint-S2-spec.md:
- 8 InteractionRequest kinds operational
- InteractionState 8→3 stateId
- ClientCommand unified to resolveChoice
- PendingAction union deleted
- session-core + 4 mixins (Setup/Round/Harvest/Draft)
- composite emit wraps in real InteractionNode (lastEmittedChoice cache deleted)
- S1 carry-overs cleaned (3 confirm shims, ws.ts variants, EMPTY_ENGINE_STACK_CURSOR)

## Skip increment
- Active skips delta: see docs/skip-tracker.md
- Cumulative: <N>

## Test plan
- [x] pnpm test:fast — 0 fail
- [x] pnpm test:slow — 0 fail
- [x] cursor round-trip 8 kinds — pass
- [x] forced-green subset green
- [x] tsc -b — 0 errors
- [x] lint 0 errors / build success
EOF
)"
```

---

## Self-Review

After all tasks complete, walk back through:

1. **Spec coverage** — every item in `docs/sprint-S2-spec.md` §2.1 maps to a Task:
   - K1 InteractionRequest 4 new kinds → Task 2
   - K2 farm-select single kind + farmType closed → Task 2 (type) + Task 5/6 (emit)
   - K3 selection single kind + selectionType closed → Task 2 (type) + Task 7 (emit)
   - K4 feed queue-embedded → unchanged (S1 already)
   - K5 card-draft wraps draft-manager → Task 12
   - L1 leaf action emit (delete buildXxxInteraction) → Task 5/6/7
   - L2 isFarmPromptKey/isSelectionPromptKey deletion → covered by Task 4 (buildInteraction rewrite drops the helpers)
   - L3 selection.ts no split-comma → Task 7
   - P1 InteractionState 8→3 stateId → Task 4
   - P2 ClientCommand collapse → Task 13 (legacy variants); Task 12 (draftSubmit)
   - P3 PromptKey + PromptParams → Task 1, Task 3
   - P4 PendingAction deletion → Task 13
   - S1 game-core.ts split → Task 9-12
   - S2 6 method-boundary decisions → Task 9-11
   - S3 carry-over: 3 confirm shims + transport rename → Task 13
   - S4 composite emit wrap → Task 8
   - S5 EMPTY_ENGINE_STACK_CURSOR → Task 13
   - S6 HistoryEntry.pending kept → no task (kept; just verified)
   - T1 35 skips processed → Task 13.7 + 13.11

2. **No placeholders** — search for `TBD` / `TODO` / `implement later` / `fill in details` / `Add appropriate` / `Similar to Task N` patterns. Fix any found.

3. **Type consistency** — verify `PromptKey` / `PromptParams` / `FarmSelectType` / `SelectionKind` / `SubFlowKind` / `InteractionNode` / `EngineStack` named the same across tasks.

---

## Risks (from spec §8)

- **R1 (farm-select union字段冗余)**: low prob; mitigation = audit at Task 2 start; rollback = split to 5 kinds (re-open contract)
- **R2 (cardDraft UI rehydrate)**: medium prob low impact; mitigation = comparison snapshots (Task 12); rollback signal = existing draft room rehydrate fails
- **R3 (~68 test codemod after confirm shim deletion)**: high prob medium impact; mitigation = ts-morph codemod; threshold = skip count > 30
- **R4 (mixin boundary drift)**: medium prob; mitigation = §3.6 boundaries locked; threshold = any mixin > 800 lines
- **R5 (composite emit InteractionNode breaks engine tests)**: medium prob medium impact; mitigation = Task 8 audits all `lastEmittedChoice` reads first
- **R6 (PromptKey closed union limits card hooks)**: medium prob low impact; mitigation = `ui.cards.${string}` template literal escape hatch
- **R7 (cursor round-trip 8 kinds breaks)**: low prob high impact; mitigation = Task 13.10 explicit 3-kind tests; per-task forced-green re-run

---

## Deferred to S3+ (out-of-scope)

Per spec §10:
- Payment 收口 (S3 — running in `.worktree/sprint-S3-payment-solver`)
- improvement.ts 瘦身 (S3)
- shared/domain/ + 节点充血 (S4)
- shared/logic/farm/* 迁移 (S4)
- 物理目录搬迁 (contract / cards-display / client/sandbox / ESLint) (S6)
- card-draft per-connection view (issue #7)
- nextActionToken cursor 序列化 (S5+)
- HistoryEntry.pending 字段删除 (kept; undoStep depends)
- BGA pass-around draft (locked: not done)
- Card test regression (S7)
