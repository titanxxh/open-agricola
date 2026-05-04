# Sprint S1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate `PendingAction` field + introduce `InteractionNode` skeleton (5 kinds: choice/animal-reorg/confirm-next-player/confirm-player-switch/feed) + EngineStack replacing ad-hoc `pausedEngine` + D-a engine cursor in `SerializedGameState`. Promote `confirmNextPlayer / confirmPlayerSwitch / harvestFeed` to InteractionNode + GameCore private handlers. Clean R1–R4 residue from reorganize prototype.

**Architecture:** EngineStack class owns sub-flow frames; each frame contains an Engine + EngineSource + ownerPlayerIndex + spaceId + stageResume. InteractionNode is the only "wait for player input" leaf; its `request: InteractionRequest` sum type carries kind-specific data. `GameState.pending` field deleted; `GameCore.buildInteraction()` derives current InteractionState from `engineStack.peekInteraction()`. Cursor (engine snapshot per frame) goes into `SerializedGameState.engineStack` so cold restart skips command replay.

**Tech Stack:** TypeScript strict mode; vitest (fast project); WebSocket + HTTP transport; better-sqlite3 persistence (untouched); pnpm workspace.

**Spec reference:** `docs/sprint-S1-spec.md` (sections cross-referenced as `[spec §X]`).

**Branch:** `sprint-S1-pending-elimination` (worktree `.worktree/sprint-S1-pending-elimination`).

---

## File Structure Overview

### New files

| Path | Responsibility |
|---|---|
| `shared/engine/engine-stack.ts` | `EngineStack` class + `EngineFrame` + `EngineFrameCursor` + `EngineStackCursor` types + `toCursor` / `fromCursor` |
| `shared/engine/__tests__/engine-stack.test.ts` | EngineStack unit tests (push/pop/current/depth/cursor round-trip) |
| `shared/game/__tests__/serialization-cursor.test.ts` | Round-trip tests: serialize → rehydrate → assert engineStack reconstructed for 5 sub-flow kinds |
| `docs/skip-tracker.md` | Markdown table tracking skipped card tests during sprints |

### Modified files

| Path | Reason |
|---|---|
| `shared/game/types.ts` | Add `SubFlowKind`, `InteractionRequest`; modify `ActionExecutionResult` (delete `'choice'` and `'animalReorg'` variants, add `'request'`); delete `pending: PendingAction` from `GameState`; `PendingAction` union type body unchanged (still consumed by protocol layer InteractionState) |
| `shared/game/serialization.ts` | `serializeState` accepts `engineStack`; `rehydrateState` returns `{ state, engineStackCursor }`; remove `pending` field handling |
| `shared/engine/engine.ts` | Rename internal `pendingChoiceXxx` → `pendingInteractionXxx`; expose `peekInteraction()`; `snapshot()` produces cursor compatible with `EngineFrameCursor.engineSnapshot` |
| `shared/engine/nodes.ts` | Rename `ChoiceNode` → `InteractionNode` (one-shot, including `instanceof`) ; add `request: InteractionRequest` field |
| `shared/engine/index.ts` | Export `EngineStack`, `EngineFrame`, `InteractionNode`, types |
| `shared/protocol/ws.ts` | Delete `confirmNextPlayer / confirmPlayerSwitch / feed` `ClientCommand` variants; extend `resolveChoice` with `selection?: string; payload?: unknown` |
| `shared/session/game-core.ts` | Major: delete `pausedEngine` and 6 frame fields and `pending` field; introduce `engineStack`; rewrite `buildInteraction()`; add `startConfirmNextPlayer / startConfirmPlayerSwitch / startFeedSubFlow` triggers; add `handleConfirmNextPlayerResolved / handleConfirmPlayerSwitchResolved / handleFeedResolved` private handlers; replace `__reorganize__` with `__subflow:reorganize`; replace `promptKey === 'ui.interactionAnimalReorg'` literals with `request.kind === 'animal-reorg'` |
| `shared/actions/effects/reorganize.ts` | Change `execute()` to return `{ type: 'request', request: { kind: 'animal-reorg', zones } }` |
| `shared/actions/effects/*.ts` (~15 files) | Migrate `{ type: 'choice', options }` → `{ type: 'request', request: { kind: 'choice', options } }` |
| `server/game-router.ts` | Delete `confirmNextPlayer / confirmPlayerSwitch / confirmHarvestFeed` HTTP routes |
| `server/game/room-manager.ts` | Delete `confirmNextPlayer / confirmPlayerSwitch / feed` WS command routes |
| `server/__tests__/harvest-session.test.ts`, `harvest-feed-session.test.ts`, `on-end-turn-session.test.ts`, `stage-hook-flow.test.ts`, `reorganize-engine-session.test.ts`, `tests/pending-undo-regression.test.ts`, `tests/protocol-types.test.ts`, `tests/game-sync-pipeline.test.ts` | Codemod `confirmXxx` calls → `dispatch({ kind: 'resolveChoice', payload })` |

### Card test files (~254)

Allowed to skip during S1 — register entries in `docs/skip-tracker.md`. Resolution in S7.

---

## Task 1: Add type definitions (SubFlowKind, InteractionRequest, EngineStackCursor)

**Files:**
- Modify: `shared/game/types.ts`
- Modify: `shared/engine/index.ts` (will re-export EngineStack types added in Task 2)

- [ ] **Step 1.1: Add `SubFlowKind` and `InteractionRequest` types**

In `shared/game/types.ts`, after the existing `PendingAction` union:

```ts
export type SubFlowKind =
  | 'choice'
  | 'animal-reorg'
  | 'confirm-next-player'
  | 'confirm-player-switch'
  | 'feed'

export type InteractionRequest =
  | { kind: 'choice'; options: ActionChoiceOption[] }
  | { kind: 'animal-reorg'; zones: InteractionAnimalReorgZone[] }
  | { kind: 'confirm-next-player'; nextPlayerIndex: number }
  | { kind: 'confirm-player-switch'; fromPlayerIndex: number; toPlayerIndex: number }
  | {
      kind: 'feed'
      remaining: number
      foodUsed: number
      feedQueue?: { index: number; remaining: number; foodUsed: number }[]
    }
```

- [ ] **Step 1.2: Extend `ActionExecutionResult` with `'request'` variant (do NOT delete `'choice'` / `'animalReorg'` yet)**

In `shared/game/types.ts`, update the `ActionExecutionResult` union — add `'request'`:

```ts
export type ActionExecutionResult =
  | { type: 'ok'; logKey?: string; resourcesGained?: Partial<Resource>; resourcesPaid?: Partial<Resource>; logParams?: Record<string, unknown>; immediateLogs?: ImmediateLogEntry[]; extraData?: Record<string, unknown> }
  | { type: 'choice'; promptKey?: string; promptParams?: Record<string, unknown>; options: ActionChoiceOption[]; extraData?: Record<string, unknown> }
  | { type: 'animalReorg'; sourceId: string }
  | { type: 'request'; request: InteractionRequest; promptKey?: string; promptParams?: Record<string, unknown>; sourceCard?: string; extraData?: Record<string, unknown> }
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow; logKey?: string; logParams?: Record<string, unknown>; immediateLogs?: ImmediateLogEntry[]; extraData?: Record<string, unknown> }
```

(Keeping `'choice'` and `'animalReorg'` co-existing during migration; they will be removed in Task 5 once all callers move to `'request'`.)

- [ ] **Step 1.3: Run typecheck to verify additions compile**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: 0 errors (we only added types, didn't touch consumers).

- [ ] **Step 1.4: Commit**

```bash
git add shared/game/types.ts
git commit -m "feat(types): add SubFlowKind, InteractionRequest, ActionExecutionResult.request"
```

---

## Task 2: EngineStack class + cursor round-trip (TDD)

**Files:**
- Create: `shared/engine/engine-stack.ts`
- Create: `shared/engine/__tests__/engine-stack.test.ts`
- Modify: `shared/engine/index.ts`

- [ ] **Step 2.1: Write failing test — push then current returns frame**

Create `shared/engine/__tests__/engine-stack.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EngineStack, type EngineFrame } from '../engine-stack'
import { Engine } from '../engine'

const makeFrame = (overrides: Partial<EngineFrame> = {}): EngineFrame => ({
  engine: new Engine({ tree: null as never, registry: null as never, hooks: null as never }),
  source: { kind: 'flow', flow: { type: 'leaf', actionId: 'noop' } },
  ownerPlayerIndex: 0,
  spaceId: '__subflow:test',
  stageResume: null,
  deferredPlayerSwitch: null,
  reason: 'reorganize',
  ...overrides,
})

describe('EngineStack', () => {
  it('push then current returns frame', () => {
    const stack = new EngineStack()
    const frame = makeFrame({ ownerPlayerIndex: 1 })
    stack.push(frame)
    expect(stack.current()).toBe(frame)
    expect(stack.depth()).toBe(1)
  })
})
```

- [ ] **Step 2.2: Run test, expect FAIL (file doesn't exist)**

Run: `pnpm exec vitest run shared/engine/__tests__/engine-stack.test.ts`
Expected: FAIL with module-not-found for `../engine-stack`.

- [ ] **Step 2.3: Create EngineStack minimal implementation**

Create `shared/engine/engine-stack.ts`:

```ts
import type { Engine } from './engine'
import type { ActionFlow } from '../game/types'

export type EngineSource =
  | { kind: 'action'; actionId: string }
  | { kind: 'flow'; flow: ActionFlow }

export type SubFlowReason = 'reorganize' | 'feed' | 'card-draft' | 'confirm-next-player' | 'confirm-player-switch'

export type StageResumeState = {
  hook: string
  playerIndex: number
  cardIndex: number
  extra?: Record<string, unknown>
}

export type EngineFrame = {
  engine: Engine
  source: EngineSource
  ownerPlayerIndex: number
  spaceId: string
  stageResume: StageResumeState | null
  deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  reason: SubFlowReason
}

export type EngineFrameCursor = {
  source: EngineSource
  engineSnapshot: ReturnType<Engine['snapshot']>
  ownerPlayerIndex: number
  spaceId: string
  stageResume: StageResumeState | null
  deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  reason: SubFlowReason
}

export type EngineStackCursor = {
  frames: EngineFrameCursor[]
}

export class EngineStack {
  private frames: EngineFrame[] = []

  push(frame: EngineFrame): void {
    this.frames.push(frame)
  }

  pop(): EngineFrame | undefined {
    return this.frames.pop()
  }

  current(): EngineFrame | undefined {
    return this.frames[this.frames.length - 1]
  }

  depth(): number {
    return this.frames.length
  }

  toCursor(): EngineStackCursor {
    return {
      frames: this.frames.map((f) => ({
        source: f.source,
        engineSnapshot: f.engine.snapshot(),
        ownerPlayerIndex: f.ownerPlayerIndex,
        spaceId: f.spaceId,
        stageResume: f.stageResume,
        deferredPlayerSwitch: f.deferredPlayerSwitch,
        reason: f.reason,
      })),
    }
  }

  static fromCursor(
    cursor: EngineStackCursor,
    rebuild: (source: EngineSource, snapshot: ReturnType<Engine['snapshot']>) => Engine,
  ): EngineStack {
    const stack = new EngineStack()
    for (const fc of cursor.frames) {
      const engine = rebuild(fc.source, fc.engineSnapshot)
      stack.push({
        engine,
        source: fc.source,
        ownerPlayerIndex: fc.ownerPlayerIndex,
        spaceId: fc.spaceId,
        stageResume: fc.stageResume,
        deferredPlayerSwitch: fc.deferredPlayerSwitch,
        reason: fc.reason,
      })
    }
    return stack
  }
}
```

- [ ] **Step 2.4: Run test, expect PASS**

Run: `pnpm exec vitest run shared/engine/__tests__/engine-stack.test.ts`
Expected: PASS for "push then current returns frame".

- [ ] **Step 2.5: Add pop test**

Append to `shared/engine/__tests__/engine-stack.test.ts`:

```ts
  it('push two then pop returns top, current returns bottom', () => {
    const stack = new EngineStack()
    const bottom = makeFrame({ ownerPlayerIndex: 0 })
    const top = makeFrame({ ownerPlayerIndex: 1 })
    stack.push(bottom)
    stack.push(top)
    expect(stack.pop()).toBe(top)
    expect(stack.current()).toBe(bottom)
    expect(stack.depth()).toBe(1)
  })

  it('empty stack returns undefined', () => {
    const stack = new EngineStack()
    expect(stack.current()).toBeUndefined()
    expect(stack.pop()).toBeUndefined()
    expect(stack.depth()).toBe(0)
  })
```

- [ ] **Step 2.6: Run tests, expect 3 PASS**

Run: `pnpm exec vitest run shared/engine/__tests__/engine-stack.test.ts`
Expected: 3 PASS.

- [ ] **Step 2.7: Add cursor round-trip test (skip if Engine ctor too complex; revisit Step 2.8)**

Append:

```ts
  it('toCursor then fromCursor preserves frame metadata', () => {
    const stack = new EngineStack()
    const frame = makeFrame({
      ownerPlayerIndex: 1,
      spaceId: '__subflow:reorganize',
      reason: 'reorganize',
      stageResume: { hook: 'onReorganizeComplete', playerIndex: 1, cardIndex: 0, extra: { trigger: 'anytime' } },
    })
    stack.push(frame)

    const cursor = stack.toCursor()
    expect(cursor.frames).toHaveLength(1)
    expect(cursor.frames[0]!.ownerPlayerIndex).toBe(1)
    expect(cursor.frames[0]!.spaceId).toBe('__subflow:reorganize')
    expect(cursor.frames[0]!.reason).toBe('reorganize')
    expect(cursor.frames[0]!.stageResume).toEqual({
      hook: 'onReorganizeComplete', playerIndex: 1, cardIndex: 0, extra: { trigger: 'anytime' },
    })

    const rebuilt = EngineStack.fromCursor(cursor, (src, snap) => frame.engine)
    expect(rebuilt.depth()).toBe(1)
    expect(rebuilt.current()!.ownerPlayerIndex).toBe(1)
    expect(rebuilt.current()!.reason).toBe('reorganize')
  })
```

- [ ] **Step 2.8: Run tests, expect 4 PASS**

Run: `pnpm exec vitest run shared/engine/__tests__/engine-stack.test.ts`
Expected: 4 PASS.

If `new Engine({ tree: null as never, ... })` constructor blows up, replace `makeFrame` to use a real Engine fixture (simplest: `new Engine({ tree: new EngineTree(new LeafNode('noop')), registry: makeEmptyRegistry(), hooks: makeNoopHooks(), log: new LogStore() })` — copy from existing engine tests).

- [ ] **Step 2.9: Re-export from `shared/engine/index.ts`**

Modify `shared/engine/index.ts`, append:

```ts
export {
  EngineStack,
  type EngineFrame,
  type EngineFrameCursor,
  type EngineStackCursor,
  type EngineSource,
  type SubFlowReason,
  type StageResumeState,
} from './engine-stack'
```

(Note: `EngineSource` and `StageResumeState` were previously defined inline in `game-core.ts`; we move them to `engine-stack.ts` because they are now part of the EngineFrame contract. Task 6 will delete the duplicates from `game-core.ts`.)

- [ ] **Step 2.10: Commit**

```bash
git add shared/engine/engine-stack.ts shared/engine/__tests__/engine-stack.test.ts shared/engine/index.ts
git commit -m "feat(engine): add EngineStack with cursor round-trip"
```

---

## Task 3: InteractionNode + Engine.peekInteraction()

**Files:**
- Modify: `shared/engine/nodes.ts`
- Modify: `shared/engine/engine.ts`
- Modify: `shared/engine/index.ts`

- [ ] **Step 3.1: Locate ChoiceNode in `shared/engine/nodes.ts`**

Run: `grep -nE "class ChoiceNode|ChoiceNode " shared/engine/nodes.ts shared/engine/engine.ts shared/engine/tree.ts`
Note all hits — they need updating in Step 3.2.

- [ ] **Step 3.2: Rename `ChoiceNode` → `InteractionNode` everywhere (one-shot)**

Run:
```bash
git grep -l "ChoiceNode" shared/ server/ tests/ | xargs sed -i 's/ChoiceNode/InteractionNode/g'
```

Verify:
```bash
git grep "ChoiceNode" shared/ server/ tests/ || echo "all renamed"
```
Expected: "all renamed".

- [ ] **Step 3.3: Add `request: InteractionRequest` field to InteractionNode**

In `shared/engine/nodes.ts`, modify `InteractionNode` class:

```ts
import type { ActionChoiceOption, InteractionRequest } from '../game/types'

export class InteractionNode extends LeafNode {
  readonly type = 'interaction' as const
  promptKey?: string
  choices: ActionChoiceOption[]              // existing — kept for compat through Task 5
  request?: InteractionRequest               // NEW — populated when emitter uses ActionExecutionResult.type === 'request'

  constructor(args: {
    id: string
    promptKey?: string
    choices?: ActionChoiceOption[]
    request?: InteractionRequest
  }) {
    super(args.id)
    this.promptKey = args.promptKey
    this.choices = args.choices ?? request?.kind === 'choice' ? request.options : []
    this.request = args.request
  }
}
```

(Backward-compat: existing constructor sites pass `choices`; Task 5 migrates them to pass `request`.)

- [ ] **Step 3.4: Add `Engine.peekInteraction(): InteractionNode | null` method**

In `shared/engine/engine.ts`, add public method (next to existing `getNextChoice`):

```ts
peekInteraction(): InteractionNode | null {
  if (this.pendingInteractionNodeId === null) return null
  const node = this.tree.findNodeById(this.pendingInteractionNodeId)
  return node instanceof InteractionNode ? node : null
}
```

(`pendingInteractionNodeId` is the renamed `pendingChoiceNodeId` from Step 3.2.)

- [ ] **Step 3.5: Add `EngineStack.peekInteraction()` forward**

In `shared/engine/engine-stack.ts`, add to EngineStack class:

```ts
peekInteraction(): import('./engine').InteractionNode | null {
  return this.current()?.engine.peekInteraction() ?? null
}
```

- [ ] **Step 3.6: Run typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: 0 errors. If errors arise from `instanceof InteractionNode`, ensure imports updated.

- [ ] **Step 3.7: Run engine-stack tests, expect 4 PASS**

Run: `pnpm exec vitest run shared/engine/__tests__/engine-stack.test.ts`
Expected: 4 PASS.

- [ ] **Step 3.8: Run all engine tests**

Run: `pnpm exec vitest run shared/engine/__tests__/`
Expected: existing tests pass (rename was mechanical).

- [ ] **Step 3.9: Commit**

```bash
git add shared/engine/nodes.ts shared/engine/engine.ts shared/engine/engine-stack.ts shared/engine/__tests__/
# include all rename hits across shared/server/tests
git add shared/ server/ tests/
git commit -m "refactor(engine): rename ChoiceNode→InteractionNode + add peekInteraction + InteractionRequest field"
```

---

## Task 4: ActionExecutionResult `'request'` migration — reorganize.ts first

**Files:**
- Modify: `shared/actions/effects/reorganize.ts`
- Modify: `shared/session/game-core.ts` (handler that consumes `result.type === 'choice'` for reorganize must accept `result.type === 'request'`)

- [ ] **Step 4.1: Update `reorganizeAction.execute()` to emit `request`**

In `shared/actions/effects/reorganize.ts`, replace:

```ts
execute: (ctx): ActionExecutionResult => {
  const trigger = (ctx.actionContext?.trigger as ReorganizeTrigger) ?? 'anytime'
  return {
    type: 'choice',
    promptKey: 'ui.interactionAnimalReorg',
    promptParams: { trigger },
    options: buildOptions(trigger),
  }
},
```

with:

```ts
execute: (ctx): ActionExecutionResult => {
  const trigger = (ctx.actionContext?.trigger as ReorganizeTrigger) ?? 'anytime'
  const player = ctx.player
  const zones = computeAnimalZones(player).map((zone) => ({
    id: zone.id,
    zoneType: zone.zoneType as 'pasture' | 'house' | 'stable',
    animalType: (zone.animalType as 'sheep' | 'boar' | 'cattle' | null) ?? null,
    animalCount: zone.animalCount ?? 0,
    capacity: zone.capacity,
  }))
  return {
    type: 'request',
    request: { kind: 'animal-reorg', zones },
    promptKey: 'ui.interactionAnimalReorg',
    promptParams: { trigger },
  }
},
```

(Note: zones now travel inside `request` rather than being computed by `GameCore.buildAnimalReorgZones` later. This preserves single-source-of-truth.)

Add import to top of file:

```ts
import { computeAnimalZones } from '../helpers/animal-zones'
```

- [ ] **Step 4.2: Add engine handling for `result.type === 'request'`**

In `shared/engine/engine.ts`, locate the dispatch switch on `result.type` (search for `result.type === 'choice'`). Add a new case before `'choice'`:

```ts
if (result.type === 'request') {
  // Construct InteractionNode from request
  const node = new InteractionNode({
    id: makeNodeId('interaction'),
    promptKey: result.promptKey,
    request: result.request,
    choices: result.request.kind === 'choice' ? result.request.options : [],
  })
  this.tree.replace(currentNodeId, node)
  this.pendingInteractionNodeId = node.id
  this.pendingInteractionActionId = currentActionId
  this.pendingInteractionContext = {
    params: ctx.params, costs: ctx.costs, sourceCard: result.sourceCard, actionContext: ctx.actionContext,
  }
  return { type: 'blocked', nodeId: node.id }
}
```

(Exact integration depends on engine internals — adapt to existing `'choice'` branch shape; the key is: same control flow, but populate `node.request`.)

- [ ] **Step 4.3: GameCore: detect `request.kind === 'animal-reorg'` instead of `promptKey === 'ui.interactionAnimalReorg'`**

In `shared/session/game-core.ts`, find:

```ts
if (this.pending.type === 'choice' && this.pending.promptKey === 'ui.interactionAnimalReorg')
```

(Two occurrences: `buildAnytimeEntries` line ~759, `buildInteraction` line ~1781.)

Replace with:

```ts
const interactionNode = this.engineStack?.peekInteraction()
if (interactionNode?.request?.kind === 'animal-reorg')
```

(Note: `this.engineStack` is introduced in Task 6. For Task 4 keep using `pending.promptKey === 'ui.interactionAnimalReorg'` as fallback — only the leaf emit changes. The detection refactor migrates fully in Task 6.)

For Task 4, ONLY modify `reorganize.ts` (Step 4.1) and engine result handling (Step 4.2). GameCore detection stays unchanged.

- [ ] **Step 4.4: Run reorganize-engine tests**

Run: `pnpm exec vitest run server/__tests__/reorganize-engine-session.test.ts`
Expected: PASS (zones flow through `request` field same as before through `pending`).

- [ ] **Step 4.5: Run forced-green subset**

Run: `pnpm exec vitest run server/__tests__/harvest-session.test.ts server/__tests__/on-end-turn-session.test.ts server/__tests__/stage-hook-flow.test.ts tests/pending-undo-regression.test.ts`
Expected: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add shared/actions/effects/reorganize.ts shared/engine/engine.ts
git commit -m "feat(engine): handle ActionExecutionResult.request; reorganize emits request kind"
```

---

## Task 5: Migrate ~15 effect leaves from `'choice'` to `'request'`

**Files** (~15 candidates; verify with `grep -rnE "type: 'choice'" shared/actions/effects/`):
- `shared/actions/effects/internal/move-farmer-to-space.ts`
- `shared/actions/effects/internal/selection.ts`
- `shared/actions/effects/internal/emit-choice.ts`
- `shared/actions/effects/improvement.ts` (multiple sites)
- `shared/actions/effects/exchange.ts`
- `shared/actions/effects/fencing.ts`
- `shared/actions/effects/sow.ts`
- `shared/actions/effects/plow.ts`
- `shared/actions/effects/stables.ts`
- `shared/actions/effects/construct.ts`
- `shared/actions/effects/renovation.ts`
- `shared/actions/effects/bake-bread.ts`
- (Run grep for full list)

- [ ] **Step 5.1: List all `{ type: 'choice'` emitters**

Run: `grep -rnE "type: 'choice'" shared/actions/effects/ | grep -v test`
Save the list — every line needs migration.

- [ ] **Step 5.2: Mechanical codemod via grep + manual edit**

For each emitter, replace:

```ts
return { type: 'choice', promptKey: '...', options: [...], extraData: {...} }
```

with:

```ts
return {
  type: 'request',
  request: { kind: 'choice', options: [...] },
  promptKey: '...',
  extraData: {...},
}
```

Recommended: do per-file commits (~15 small commits) to bisect later if regression appears.

For each file:
- Read file
- Update each `'choice'` emit
- Run that file's session test if it exists (e.g. `server/__tests__/<feature>-session.test.ts`)
- If test green, commit; if test red, fix

- [ ] **Step 5.3: After all files migrated, delete `'choice'` and `'animalReorg'` from `ActionExecutionResult`**

In `shared/game/types.ts`, remove the two variants:

```ts
// DELETE:
//   | { type: 'choice'; ... }
//   | { type: 'animalReorg'; sourceId: string }
```

Also remove the `'animalReorg'` handling block in `shared/session/game-core.ts` (lines ~1862, search `step.result.type === 'animalReorg'`):

The current block (line 1862+) constructs sub-flow when breed action emits `animalReorg`. Replace with: emit `{ type: 'request', request: { kind: 'animal-reorg', zones } }` from the breed effect directly. Find caller in `shared/actions/effects/breed.ts` if exists, or change in `place-farmer.ts` after-hook chain.

> **Implementation note (Task 5 → Task 7 retro):** The actual breed
> migration split into two paths instead of one unconditional `'request'`
> emit:
>
> 1. **Animals-actually-bred path** (default `breed.ts`): emit `'ok'` so
>    that engine after-hooks (D60 LargePottery, B104 SheepWalker, ...)
>    fire on the post-breed state. GameCore detects "animal count went
>    up" via the existing `getAnimalCount(player) > getAnimalCount(before)`
>    heuristic in `runEngineSteps` and starts the reorganize sub-flow on
>    its own.
> 2. **Round-14 enforcement path** (B104 SheepWalker last-harvest): emit
>    `{ type: 'request', request: { kind: 'animal-reorg', zones } }` so
>    the player is forced through the reorg interaction even when the
>    animal count did not change. GameCore detects this via
>    `engineStack.peekInteraction()?.request.kind === 'animal-reorg'` in
>    the choice branch (Task 7 R2).
>
> The dual path was chosen so card after-hooks (which need the
> mutated breed state) keep working without an extra protocol round-trip
> for the common case.

- [ ] **Step 5.4: Run typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: 0 errors. Compiler will catch any missed migration sites (since `'choice'` and `'animalReorg'` no longer exist as union members, callers using `result.type === 'choice'` will fail).

Fix all reported errors by either:
- Migrating the call site to `result.type === 'request' && result.request.kind === 'choice'`
- Or migrating the emitter (if it's still emitting old shape)

- [ ] **Step 5.5: Run forced-green subset**

Run: `pnpm test:fast -- --run`
Expected: forced-green subset passes; card tests may fail (acceptable, register skips in Task 11).

- [ ] **Step 5.6: Commit (or batch commits per Step 5.2 if not yet done)**

```bash
git add shared/actions/effects/ shared/game/types.ts shared/session/game-core.ts
git commit -m "refactor(actions): migrate all effect leaves to ActionExecutionResult.request; delete choice and animalReorg variants"
```

---

## Task 6: GameCore — replace `pausedEngine` and 6 fields with `engineStack`

**Files:**
- Modify: `shared/session/game-core.ts` (large refactor)

This is the biggest single task. Touches ~500 lines. Proceed in checkpoints, run forced-green subset between each.

### Field migration map

| Old field (`game-core.ts`) | New access |
|---|---|
| `private engine: Engine \| null` | `this.engineStack.current()?.engine ?? null` |
| `private engineSource: EngineSource \| null` | `this.engineStack.current()?.source ?? null` |
| `private activeSpaceId: string \| null` | `this.engineStack.current()?.spaceId ?? null` |
| `private activePlayerIndex: number \| null` | `this.engineStack.current()?.ownerPlayerIndex ?? null` |
| `private stageResume: StageResumeState \| null` | `this.engineStack.current()?.stageResume ?? null` |
| `private deferredPlayerSwitch: ...` | `this.engineStack.current()?.deferredPlayerSwitch ?? null` |
| `private pausedEngine: { 6 fields }` | DELETED (was the manual save/restore for engine-in-engine; now EngineStack push/pop) |

- [ ] **Step 6.1: Remove inline `EngineSource` and `StageResumeState` type defs from game-core.ts**

These types were re-exported from `shared/engine/engine-stack.ts` in Task 2. In `game-core.ts`:

```ts
// DELETE inline definitions of EngineSource and StageResumeState
// REPLACE with imports
import type { EngineSource, StageResumeState, EngineFrame } from '../engine'
import { EngineStack } from '../engine'
```

- [ ] **Step 6.2: Add `engineStack` field; mark old fields deprecated (compile-only stub)**

Add to GameCore class:

```ts
private engineStack = new EngineStack()
```

Keep the 6 old fields temporarily — Step 6.3 onwards migrates each call site.

- [ ] **Step 6.3: Add helper getters**

Add to GameCore (private):

```ts
private get currentFrame(): EngineFrame | undefined { return this.engineStack.current() }
private get engine(): Engine | null { return this.currentFrame?.engine ?? null }
private get engineSource(): EngineSource | null { return this.currentFrame?.source ?? null }
private get activeSpaceId(): string | null { return this.currentFrame?.spaceId ?? null }
private get activePlayerIndex(): number | null { return this.currentFrame?.ownerPlayerIndex ?? null }
private get stageResume(): StageResumeState | null { return this.currentFrame?.stageResume ?? null }
private get deferredPlayerSwitch(): { fromPlayerIndex: number; toPlayerIndex: number } | null {
  return this.currentFrame?.deferredPlayerSwitch ?? null
}
```

These getters shadow the old direct fields (you must DELETE the field declarations of the same names; TypeScript will error otherwise — "duplicate member"). Step 6.4 deletes the field declarations.

- [ ] **Step 6.4: Delete the 6 field declarations + `pausedEngine`**

In `game-core.ts` find and delete:

```ts
// DELETE:
private engine: Engine | null = null
private engineSource: EngineSource | null = null
private activeSpaceId: string | null = null
private activePlayerIndex: number | null = null
private stageResume: StageResumeState | null = null
private deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null = null
private pausedEngine: { engine: Engine; engineSource: EngineSource; activeSpaceId: string; activePlayerIndex: number; stageResume: StageResumeState | null; deferredPlayerSwitch: ... } | null = null
```

Compile error expected from any code that **writes** to these fields (`this.engine = X`, `this.activeSpaceId = X` etc) because getters are read-only. Step 6.5 fixes writers.

- [ ] **Step 6.5: Convert all `this.engine = ...` / `this.activeSpaceId = ...` writers to `engineStack.push/pop`**

Find writers via:

```bash
grep -nE "this\.(engine|engineSource|activeSpaceId|activePlayerIndex|stageResume|deferredPlayerSwitch) = " shared/session/game-core.ts
```

Each writer falls into one of three patterns:

**(a) Setting up a new top-level engine for an action** — happens in `takeAction()` and similar. Convert:

```ts
// OLD:
this.engine = this.createEngine(actionId)
this.engineSource = { kind: 'action', actionId }
this.activeSpaceId = spaceId
this.activePlayerIndex = playerIndex
this.stageResume = null

// NEW:
this.engineStack.push({
  engine: this.createEngine(actionId),
  source: { kind: 'action', actionId },
  spaceId,
  ownerPlayerIndex: playerIndex,
  stageResume: null,
  deferredPlayerSwitch: null,
  reason: 'choice',     // top-level user action
})
```

**(b) Clearing all fields** (action complete, transitioning to next player). Convert:

```ts
// OLD:
this.engine = null
this.engineSource = null
this.activeSpaceId = null
this.activePlayerIndex = null
this.stageResume = null

// NEW:
this.engineStack.pop()
// (assumes the top frame is the action being torn down; if multiple frames, may need pop loop)
```

**(c) Sub-flow trigger (reorganize today, will add confirm/feed in Task 9)**. Convert `startReorganizeSubFlow` to use `push`:

```ts
private startReorganizeSubFlow(playerIndex: number, trigger: ReorganizeTrigger, extra: { originPlayerIndex?: number | null } = {}): void {
  const flow: ActionFlow = { type: 'leaf', actionId: 'reorganize', actionContext: { trigger } }
  this.engineStack.push({
    engine: this.createFlowEngine(flow),
    source: { kind: 'flow', flow },
    spaceId: '__subflow:reorganize',     // Task 7 will introduce constant
    ownerPlayerIndex: playerIndex,
    stageResume: { hook: 'onReorganizeComplete', playerIndex, cardIndex: 0, extra: { trigger, originPlayerIndex: extra.originPlayerIndex ?? null } },
    deferredPlayerSwitch: null,
    reason: 'reorganize',
  })
  this.runEngineSteps()
}
```

Delete the old `pausedEngine` save/restore block in `runEngineSteps` (search `this.pausedEngine = {`) — replace with:

```ts
// OLD: this.pausedEngine = { engine: this.engine!, ... }; this.engine = null; ...
//      then later: this.engine = paused.engine; ...
// NEW: just push the new frame; pop returns to previous frame automatically.
```

The "resume from paused" branch in `resumeStageFlow` (search `this.pausedEngine`) becomes:

```ts
// OLD: if (this.pausedEngine) { const paused = this.pausedEngine; this.pausedEngine = null; this.engine = paused.engine; ... }
// NEW: this.engineStack.pop(); this.runEngineSteps()
```

- [ ] **Step 6.6: Run typecheck after each major writer batch**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | head -30`
Fix errors in batches; do not move forward until clean.

- [ ] **Step 6.7: Run forced-green subset**

Run: `pnpm exec vitest run server/__tests__/reorganize-engine-session.test.ts server/__tests__/harvest-session.test.ts server/__tests__/on-end-turn-session.test.ts server/__tests__/stage-hook-flow.test.ts tests/pending-undo-regression.test.ts`
Expected: PASS. If fail, the most likely cause is a missed writer or pop ordering — bisect.

- [ ] **Step 6.8: Commit**

```bash
git add shared/session/game-core.ts
git commit -m "refactor(session): replace pausedEngine + 6 fields with EngineStack"
```

---

## Task 7: R2/R3/R4 cleanup — subFlowKind discriminator + stageResume.extra + `__subflow:NAME`

**Files:**
- Modify: `shared/session/game-core.ts`
- Modify: `shared/cards/B/B104_SheepWalker.ts` (comment update only)
- Modify: `shared/actions/effects/reorganize.ts` (no functional change; verify request kind matches)

### R2: subFlowKind strong-typing replaces `promptKey === 'ui.interactionAnimalReorg'`

- [ ] **Step 7.1: Find all `promptKey === 'ui.interactionAnimalReorg'` literals**

Run: `grep -rn "ui.interactionAnimalReorg" shared/ server/ | grep -v __tests__ | grep -v test.ts`
Expect 2-4 hits in `game-core.ts` + 1 comment in `B104_SheepWalker.ts`.

- [ ] **Step 7.2: Replace `game-core.ts` literals with `request.kind === 'animal-reorg'`**

For each hit:

```ts
// OLD:
if (this.pending.type === 'choice' && this.pending.promptKey === 'ui.interactionAnimalReorg') {

// NEW:
const interactionNode = this.engineStack.peekInteraction()
if (interactionNode?.request?.kind === 'animal-reorg') {
```

The body that follows (e.g. `return []` for anytime suppression) stays identical.

- [ ] **Step 7.3: Update `B104_SheepWalker.ts` comment to drop literal reference**

In `shared/cards/B/B104_SheepWalker.ts:5-9`, replace:

```ts
// Reorg-pending exchange suppression note:
//   BGA `getExchanges` returns [] while animals sit in the "reserve" (pending
//   reorg). Our `buildAnytimeEntries` already returns [] when the engine emits
//   a choice with promptKey 'ui.interactionAnimalReorg', so anytime exchanges
//   are naturally suppressed during reorg — no extra filter needed.
```

with:

```ts
// Reorg-pending exchange suppression note:
//   BGA `getExchanges` returns [] while animals sit in the "reserve" (pending
//   reorg). Our `buildAnytimeEntries` already returns [] when the engine has a
//   pending InteractionNode with request.kind === 'animal-reorg', so anytime
//   exchanges are naturally suppressed during reorg — no extra filter needed.
```

- [ ] **Step 7.4: Verify no `promptKey === 'ui.interactionAnimalReorg'` literals remain**

Run: `grep -rn "ui.interactionAnimalReorg" shared/ server/ | grep -v __tests__ | grep -v test.ts | grep -v "//"`
Expected: empty (only comments remaining if any).

### R3: 3 `continueAfterReorganize_*` functions stay, but `resumeStageFlow` dispatches via `stageResume.extra`

- [ ] **Step 7.5: Inspect existing `resumeStageFlow` for `case 'onReorganizeComplete'`**

Run: `grep -nE "onReorganizeComplete|continueAfterReorganize_" shared/session/game-core.ts`
Locate the existing 3 helpers + the `case` block (~lines 1571-1700).

- [ ] **Step 7.6: Verify `stageResume.extra` shape used (no change needed if already typed `Record<string, unknown>`)**

Confirm `StageResumeState.extra` type is `Record<string, unknown> | undefined` (we set this in Task 2 when moving to engine-stack.ts). The 3 helpers already read `stageResume.extra.trigger` and `stageResume.extra.originPlayerIndex` — pass through.

- [ ] **Step 7.7: Rename `continueAfterReorganize_*` to `continueAfterSubFlow` umbrella + retain helpers as private**

In `shared/session/game-core.ts`, add:

```ts
private continueAfterSubFlow(frame: EngineFrame): void {
  const stage = frame.stageResume
  if (!stage) return this.runEngineSteps()

  switch (stage.hook) {
    case 'onReorganizeComplete': {
      const trigger = (stage.extra?.trigger as ReorganizeTrigger | undefined) ?? 'anytime'
      const originPlayerIndex = (stage.extra?.originPlayerIndex as number | null | undefined) ?? null
      if (trigger === 'returning-home') return this.continueAfterReorganize_returningHome(stage.playerIndex)
      if (trigger === 'harvest-breed') return this.continueAfterReorganize_harvestBreed(stage.playerIndex)
      if (trigger === 'round-end') return this.continueAfterReorganize_roundEnd(stage.playerIndex, originPlayerIndex)
      // 'anytime' fallthrough: just resume engine after pop
      return this.runEngineSteps()
    }
    default:
      // existing 23 hooks (onBeforeHarvest etc.) — delegate to original resumeStageFlow path
      return this.resumeStageFlow(stage)
  }
}
```

The 3 helpers stay where they are (private methods in GameCore), but they're no longer dispatched directly from `resumeStageFlow`'s `case 'onReorganizeComplete'`. Update that case to call `this.continueAfterSubFlow(this.engineStack.current()!)` instead of inlining the dispatch.

- [ ] **Step 7.8: Verify**

Run: `pnpm exec vitest run server/__tests__/reorganize-engine-session.test.ts`
Expected: PASS (control flow identical, just refactored dispatch).

### R4: `__reorganize__` → `__subflow:reorganize`

- [ ] **Step 7.9: Add constant + helper**

In `shared/session/game-core.ts` at top:

```ts
const SUBFLOW_SPACE_PREFIX = '__subflow:' as const

const subflowSpaceId = (reason: SubFlowReason): string =>
  `${SUBFLOW_SPACE_PREFIX}${reason}`
```

- [ ] **Step 7.10: Replace `'__reorganize__'` literal**

Run: `grep -n "__reorganize__" shared/session/game-core.ts`
Replace each occurrence (likely 1-2 sites in `startReorganizeSubFlow`):

```ts
// OLD: spaceId: '__reorganize__'
// NEW: spaceId: subflowSpaceId('reorganize')
```

- [ ] **Step 7.11: Update `getSpaceById` to recognize the new prefix**

Find:

```ts
private getSpaceById(spaceId: string | null): ActionSpace | null {
  if (!spaceId) return null
  return this.state.actionSpaces.find((item) => item.id === spaceId)
    ?? (spaceId.startsWith('__') ? this.createSyntheticSpace(spaceId) : null)
}
```

Tighten the prefix:

```ts
private getSpaceById(spaceId: string | null): ActionSpace | null {
  if (!spaceId) return null
  return this.state.actionSpaces.find((item) => item.id === spaceId)
    ?? (spaceId.startsWith(SUBFLOW_SPACE_PREFIX) || spaceId.startsWith('__stage:')
      ? this.createSyntheticSpace(spaceId)
      : null)
}
```

(`__stage:` is the existing synthetic prefix for stage hooks; we keep it.)

- [ ] **Step 7.12: Run forced-green subset**

Run: `pnpm exec vitest run server/__tests__/reorganize-engine-session.test.ts server/__tests__/harvest-session.test.ts server/__tests__/on-end-turn-session.test.ts server/__tests__/stage-hook-flow.test.ts`
Expected: PASS.

- [ ] **Step 7.13: Commit**

```bash
git add shared/session/game-core.ts shared/cards/B/B104_SheepWalker.ts
git commit -m "refactor(session): subFlowKind discriminator + __subflow:NAME naming + continueAfterSubFlow umbrella"
```

---

## Task 8: D-a — `engineStack` cursor in `SerializedGameState`

**Files:**
- Modify: `shared/game/types.ts`
- Modify: `shared/game/serialization.ts`
- Modify: `shared/session/game-core.ts` (constructor accepts cursor; rebuild path)
- Modify: `server/game-session.ts` or whoever constructs GameCore from serialized state
- Create: `shared/game/__tests__/serialization-cursor.test.ts`

- [ ] **Step 8.1: Add `engineStack` field to `SerializedGameState`**

In `shared/game/types.ts`:

```ts
import type { EngineStackCursor } from '../engine'

export type SerializedGameState = ... & {
  engineStack: EngineStackCursor   // required
}
```

- [ ] **Step 8.2: Update `serializeState` to include cursor**

In `shared/game/serialization.ts`, change signature:

```ts
export const serializeState = (
  state: GameState,
  ctx: { engineStack: EngineStack },
): SerializedGameState => {
  const { actionSpaces, ...rest } = state
  return {
    ...rest,
    roundStartSnapshot: null,
    actionSpaces: actionSpaces.map(({ canBeExecutedByPlayer, execute, resolveChoice, flow, ...s }) => s),
    engineStack: ctx.engineStack.toCursor(),
  }
}
```

Update `serializeStateForPlayer` similarly (carry ctx through).

- [ ] **Step 8.3: Update `rehydrateState` to expose cursor**

```ts
export const rehydrateState = (raw: SerializedGameState): {
  state: GameState
  engineStackCursor: EngineStackCursor
} => {
  const { engineStack, ...rest } = raw
  // existing rehydrate body, building actionSpaces with .execute back from registry
  const state: GameState = { ...rest, actionSpaces: rebuiltActionSpaces, roundStartSnapshot: null }
  return { state, engineStackCursor: engineStack }
}
```

- [ ] **Step 8.4: Update GameCore constructor / loadFromSnapshot to accept and apply cursor**

In `shared/session/game-core.ts`, constructor (or `loadFromSnapshot` method) accepts cursor:

```ts
constructor(options: GameCoreOptions = {}) {
  // existing init...
  if (options.stateOrSeed && typeof options.stateOrSeed === 'object') {
    this.state = options.stateOrSeed.state
    this.engineStack = EngineStack.fromCursor(
      options.stateOrSeed.engineStackCursor,
      (source, snapshot) => this.rebuildEngineFromSourceAndSnapshot(source, snapshot),
    )
  }
}

private rebuildEngineFromSourceAndSnapshot(
  source: EngineSource,
  snapshot: ReturnType<Engine['snapshot']>,
): Engine {
  const engine = this.createEngineFromSource(source)
  engine.restore(snapshot)
  return engine
}
```

Update `GameCoreOptions.stateOrSeed` type to accept `{ state: GameState; engineStackCursor: EngineStackCursor }`.

- [ ] **Step 8.5: Update all callers of `serializeState(state)` to pass `engineStack`**

Search:

```bash
grep -rn "serializeState(" server/ shared/ | grep -v test
```

Each call site becomes:

```ts
// OLD: serializeState(state)
// NEW: serializeState(state, { engineStack: gameCore.getEngineStack() })
```

(Add `getEngineStack(): EngineStack` accessor to GameCore.)

Likely sites: `server/game-session.ts`, `server/game/room-manager.ts` snapshot broadcast.

- [ ] **Step 8.6: Update all callers of `rehydrateState(...)` to use new return shape**

Search:

```bash
grep -rn "rehydrateState(" server/ shared/ | grep -v test
```

Each:

```ts
// OLD: const state = rehydrateState(serialized)
//       const session = new GameSession({ state })
// NEW: const { state, engineStackCursor } = rehydrateState(serialized)
//       const session = new GameSession({ state, engineStackCursor })
```

- [ ] **Step 8.7: Write failing serialization-cursor test (reorganize)**

Create `shared/game/__tests__/serialization-cursor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game-session'
import { serializeState, rehydrateState } from '../serialization'

describe('serialization cursor round-trip', () => {
  it('reorganize sub-flow survives serialize/rehydrate', () => {
    const session = new GameSession()
    // Drive game state to a point where reorganize sub-flow is pending.
    // Easiest: call session helper that triggers reorg (e.g. take Day Laborer + 1 sheep + return-home).
    // Use existing test helpers or directly construct state:
    // ... (use existing reorganize-engine-session.test.ts setup verbatim)

    // Verify pending interaction exists
    const before = session.getInteraction()
    expect(before.stateId).toBe('animalReorg')

    // Serialize
    const serialized = serializeState(session.getState(), { engineStack: session.getEngineStack() })
    expect(serialized.engineStack.frames).toHaveLength(1)
    expect(serialized.engineStack.frames[0]!.reason).toBe('reorganize')

    // Rehydrate into new session
    const { state, engineStackCursor } = rehydrateState(serialized)
    const restored = new GameSession({ stateOrSeed: { state, engineStackCursor } })

    const after = restored.getInteraction()
    expect(after.stateId).toBe('animalReorg')
    // Resolve and verify game progresses
    const resp = restored.dispatch({ kind: 'resolveChoice', payload: after.zones })
    expect(resp.ok).toBe(true)
  })
})
```

- [ ] **Step 8.8: Run test, expect FAIL (rebuilt engine cursor not yet wired)**

Run: `pnpm exec vitest run shared/game/__tests__/serialization-cursor.test.ts`
Expected: FAIL on either deserialize or interaction state mismatch.

- [ ] **Step 8.9: Fix Engine.restore to populate `pendingInteractionNodeId` from snapshot**

Inspect `shared/engine/engine.ts:869` `restore()` body. It already restores `pendingChoiceNodeId` (now renamed `pendingInteractionNodeId`) and `pendingChoiceContext`. Verify it also rehydrates `request` field on the node — if `restore()` doesn't write `node.request`, add:

```ts
restore(snapshot) {
  // existing restore...
  if (snapshot.choiceData) {
    const node = this.tree.findNodeById(snapshot.choiceData.id)
    if (node instanceof InteractionNode) {
      node.promptKey = snapshot.choiceData.promptKey
      node.choices = snapshot.choiceData.choices
      // NEW: restore request from snapshot if present
      if ((snapshot.choiceData as any).request) {
        node.request = (snapshot.choiceData as any).request
      }
    }
  }
}
```

Also update `snapshot()` to include `request`:

```ts
snapshot() {
  // existing...
  const choiceData = choiceNode instanceof InteractionNode
    ? {
        id: choiceNode.id,
        promptKey: choiceNode.promptKey,
        choices: choiceNode.choices,
        request: choiceNode.request,    // NEW
      }
    : null
  return { ..., choiceData }
}
```

- [ ] **Step 8.10: Re-run test, expect PASS**

Run: `pnpm exec vitest run shared/game/__tests__/serialization-cursor.test.ts`
Expected: PASS for reorganize round-trip.

- [ ] **Step 8.11: Add round-trip tests for confirm-next-player + confirm-player-switch + feed + plain choice**

Append to `serialization-cursor.test.ts` 4 more tests, each:
1. Drive session to that interaction kind
2. Serialize / rehydrate
3. Assert interaction kind preserved
4. Resolve and verify progression

Use `it.todo` for kinds not yet implemented (confirm-next-player, confirm-player-switch, feed are added in Task 9 — these tests will be enabled then).

- [ ] **Step 8.12: Commit**

```bash
git add shared/game/types.ts shared/game/serialization.ts shared/session/game-core.ts shared/engine/engine.ts server/ shared/game/__tests__/serialization-cursor.test.ts
git commit -m "feat(serialization): wire engineStack cursor into SerializedGameState (D-a)"
```

---

## Task 9: Promote confirmNextPlayer + confirmPlayerSwitch + harvestFeed to InteractionNode

**Files:**
- Modify: `shared/session/game-core.ts`
- Modify: `shared/protocol/ws.ts`
- Modify: `shared/game/types.ts` (delete `confirmNextPlayer / confirmPlayerSwitch / harvestFeed` from `PendingAction` union eventually — but keep for now since `InteractionState` still uses these stateIds)
- Modify: `server/game-router.ts`
- Modify: `server/game/room-manager.ts`
- Modify: `client/services/*Transport.ts` (whichever services file calls confirmXxx)

### Subtask 9a: confirmNextPlayer

- [ ] **Step 9.1: Add `startConfirmNextPlayer` trigger**

In `shared/session/game-core.ts`:

```ts
private startConfirmNextPlayer(nextPlayerIndex: number): void {
  const node = new InteractionNode({
    id: this.makeNodeId('interaction:confirm-next-player'),
    promptKey: 'ui.confirmNextPlayer',
    request: { kind: 'confirm-next-player', nextPlayerIndex },
  })
  // Inject into current top frame's engine (or push a new frame if none exists)
  const top = this.engineStack.current()
  if (top) {
    top.engine.injectInteraction(node)
  } else {
    // no active engine — create a synthetic frame
    this.engineStack.push({
      engine: this.createFlowEngine({ type: 'leaf', actionId: '__interaction_only__' }),
      source: { kind: 'flow', flow: { type: 'leaf', actionId: '__interaction_only__' } },
      ownerPlayerIndex: nextPlayerIndex,
      spaceId: subflowSpaceId('confirm-next-player'),
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'confirm-next-player',
    })
    this.engineStack.current()!.engine.injectInteraction(node)
  }
}
```

You'll need to add `Engine.injectInteraction(node: InteractionNode): void` — a new method that replaces the engine's current node with the given InteractionNode and sets `pendingInteractionNodeId`. See engine internals for the right insertion point.

- [ ] **Step 9.2: Replace 3 occurrences of `this.pending = { type: 'confirmNextPlayer', ... }` with `startConfirmNextPlayer`**

Sites in `game-core.ts` (lines 1362, 1365, 1608 from spec §2.2):

```ts
// OLD:
this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: next }
return this.respond()
// NEW:
this.startConfirmNextPlayer(next)
return this.respond()
```

- [ ] **Step 9.3: Add `handleConfirmNextPlayerResolved` private handler**

In `shared/session/game-core.ts`, port the existing `confirmNextPlayer()` body (line 2446+):

```ts
private handleConfirmNextPlayerResolved(nextPlayerIndex: number): SessionResponse {
  this.pushHistory()
  this.state.currentPlayerIndex = nextPlayerIndex
  // Pop the synthetic frame (or clear engine state if action frame remains)
  while (this.engineStack.depth() > 0) this.engineStack.pop()
  this.actionStartIndex = null
  this.history = []
  // (do not clear turnOwnerPlayerIndex here — was field in old impl, now derived from frame)
  // BGA stLabor() skip-next loop (port from line 2466 of pre-S1 game-core.ts):
  let safety = this.state.players.length
  while (safety-- > 0) {
    const allWorkersUsedNow = this.state.players.every((p) => workersAvailable(this.state, p) <= 0)
    if (allWorkersUsedNow) break
    const current = this.state.players[this.state.currentPlayerIndex]
    if (!current) break
    if (workersAvailable(this.state, current) <= 0) {
      const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
      if (next === this.state.currentPlayerIndex) break
      this.state.currentPlayerIndex = next
      continue
    }
    if (!shouldSkipPlayerTurn(this.state, current)) break
    this.state.log.unshift({ key: 'log.playerSkipped', params: { playerName: current.name } })
    // ... rest of skip-next body from pre-S1 confirmNextPlayer()
  }
  return this.respond()
}
```

- [ ] **Step 9.4: Wire `dispatch({ kind: 'resolveChoice' })` switch**

In `shared/session/game-core.ts`, the existing `dispatch` (or wherever HTTP/WS commands enter — likely a method called `takeAction`/`resolveChoice`) needs the switch:

```ts
public resolveChoice(input: { selection?: string; payload?: unknown }): SessionResponse {
  const node = this.engineStack.peekInteraction()
  if (!node?.request) return this.respond(false, 'no pending interaction')

  switch (node.request.kind) {
    case 'confirm-next-player':
      return this.handleConfirmNextPlayerResolved(node.request.nextPlayerIndex)
    case 'confirm-player-switch':
      return this.handleConfirmPlayerSwitchResolved(node.request.toPlayerIndex)
    case 'feed':
      return this.handleFeedResolved(input.payload as FeedSelections)
    case 'animal-reorg':
    case 'choice':
      return this.forwardToEngine(input)   // engine.resolveChoice → action.resolveChoice
    default: {
      const _exhaustive: never = node.request
      return this.respond(false, `unknown interaction kind: ${(node.request as { kind: string }).kind}`)
    }
  }
}
```

- [ ] **Step 9.5: Delete `GameCore.confirmNextPlayer()` method**

Search for the public `confirmNextPlayer(): SessionResponse` method (line 2446) and delete it. All call sites must go through `resolveChoice` now.

### Subtask 9b: confirmPlayerSwitch (mirrors 9a)

- [ ] **Step 9.6: Add `startConfirmPlayerSwitch` + replace trigger + handler + dispatch case**

Same pattern as Steps 9.1-9.5, replace `confirm-next-player` with `confirm-player-switch`. Trigger is at `game-core.ts` line 1780. Handler ports body from line 2436.

### Subtask 9c: harvestFeed

- [ ] **Step 9.7: Add `startFeedSubFlow`**

In `shared/session/game-core.ts`:

```ts
private startFeedSubFlow(playerIndex: number, remaining: number, foodUsed: number, feedQueue?: FeedQueueEntry[]): void {
  const node = new InteractionNode({
    id: this.makeNodeId('interaction:feed'),
    promptKey: 'ui.harvestFeed',
    request: { kind: 'feed', remaining, foodUsed, feedQueue },
  })
  const top = this.engineStack.current()
  if (top) {
    top.engine.injectInteraction(node)
    // Update ownerPlayerIndex for this prompt (mid-harvest each player feeds in turn)
    top.ownerPlayerIndex = playerIndex
  } else {
    this.engineStack.push({
      engine: this.createFlowEngine({ type: 'leaf', actionId: '__interaction_only__' }),
      source: { kind: 'flow', flow: { type: 'leaf', actionId: '__interaction_only__' } },
      ownerPlayerIndex: playerIndex,
      spaceId: subflowSpaceId('feed'),
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'feed',
    })
    this.engineStack.current()!.engine.injectInteraction(node)
  }
}
```

- [ ] **Step 9.8: Replace 2 occurrences of `this.pending = { type: 'harvestFeed', ... }` with `startFeedSubFlow`**

Sites in `game-core.ts` (lines 1518, 2424 from spec §2.2):

```ts
// OLD:
if (feedQueue.length > 0) {
  const first = feedQueue[0]!
  this.pending = {
    type: 'harvestFeed',
    playerIndex: first.index,
    remaining: first.remaining,
    foodUsed: first.foodUsed,
    feedQueue: feedQueue.slice(1),
  }
  return this.respond()
}
// NEW:
if (feedQueue.length > 0) {
  const first = feedQueue[0]!
  this.startFeedSubFlow(first.index, first.remaining, first.foodUsed, feedQueue.slice(1))
  return this.respond()
}
```

- [ ] **Step 9.9: Add `handleFeedResolved` (port body from `confirmHarvestFeed`)**

```ts
private handleFeedResolved(selections: FeedSelections): SessionResponse {
  const node = this.engineStack.peekInteraction()
  if (!node || node.request.kind !== 'feed') return this.respond(false, 'no pending feed')
  const playerIndex = this.engineStack.current()!.ownerPlayerIndex
  // ... copy ~150 lines from existing confirmHarvestFeed (line 2290+ pre-S1)
  // Specifically:
  //   - lookupExchange
  //   - cappedSelections (per-card max enforcement)
  //   - apply exchanges to player resources
  //   - handle remaining food deficit (begging)
  //   - advance feedQueue: if more entries, call startFeedSubFlow with next; else proceed to startBreedPhase()
  // Read source of confirmHarvestFeed verbatim and port — DO NOT skip the BASIC_CONVERSION_SOURCE_ID handling.
  return this.respond()
}
```

- [ ] **Step 9.10: Delete `GameCore.confirmHarvestFeed()` method**

- [ ] **Step 9.11: Update `shared/protocol/ws.ts` — delete `confirmNextPlayer / confirmPlayerSwitch / feed` ClientCommand variants**

```ts
// DELETE from ClientCommandBody union:
//   | { type: 'confirmNextPlayer' }
//   | { type: 'confirmPlayerSwitch' }
//   | { type: 'feed'; selections: ... }
```

Add or extend `resolveChoice` variant:

```ts
| { type: 'resolveChoice'; selection?: string; payload?: unknown }
```

- [ ] **Step 9.12: Delete corresponding HTTP routes in `server/game-router.ts`**

Lines 230, 242, 259, 265 from spec §2.2 — delete each:

```ts
// DELETE blocks for:
//   confirmHarvestFeed
//   confirmAnimalReorg (already deleted in main, but verify)
//   confirmNextPlayer
//   confirmPlayerSwitch
```

Add a single route for `resolveChoice` if HTTP path exists (mostly used for debug — confirm protocol still supports HTTP fallback):

```ts
case 'resolveChoice': {
  const { resp, result } = callAndRespond(req, s => s.resolveChoice(body as { selection?: string; payload?: unknown }))
  ...
}
```

- [ ] **Step 9.13: Delete WS routes in `server/game/room-manager.ts`**

Lines 998, 1004, 1010 — delete cases for `'feed'`, `'confirmNextPlayer'`, `'confirmPlayerSwitch'`. Ensure `'resolveChoice'` case routes to `s.resolveChoice(msg)`.

- [ ] **Step 9.14: Update client transport — find calls of confirmXxx**

Run: `grep -rn "confirmNextPlayer\|confirmPlayerSwitch\|confirmHarvestFeed\|commitChoice" client/services/`
For each, replace with the unified `resolveChoice` call.

- [ ] **Step 9.15: Run forced-green subset**

Run:
```bash
pnpm exec vitest run server/__tests__/harvest-feed-session.test.ts \
  server/__tests__/harvest-session.test.ts \
  server/__tests__/on-end-turn-session.test.ts \
  server/__tests__/reorganize-engine-session.test.ts \
  server/__tests__/stage-hook-flow.test.ts \
  tests/pending-undo-regression.test.ts
```
Expected: PASS (these tests will need codemod in Task 11; for now expect 1-2 failures from `confirmHarvestFeed(...)` calls — fix the obvious ones inline now if simple).

- [ ] **Step 9.16: Re-enable `it.todo` round-trip tests in serialization-cursor.test.ts (Step 8.11)**

Replace `it.todo` with real tests for confirm-next-player / confirm-player-switch / feed kinds. Run: `pnpm exec vitest run shared/game/__tests__/serialization-cursor.test.ts`
Expected: 4-5 PASS.

- [ ] **Step 9.17: Commit**

```bash
git add shared/session/game-core.ts shared/protocol/ws.ts server/game-router.ts server/game/room-manager.ts client/services/ shared/game/__tests__/serialization-cursor.test.ts
git commit -m "feat(session): promote confirmNextPlayer + confirmPlayerSwitch + harvestFeed to InteractionNode"
```

---

## Task 10: Delete `GameState.pending` field + rewrite `buildInteraction()`

**Files:**
- Modify: `shared/game/types.ts`
- Modify: `shared/game/serialization.ts`
- Modify: `shared/session/game-core.ts`

- [ ] **Step 10.1: Remove `pending: PendingAction` from `GameState`**

In `shared/game/types.ts`, find:

```ts
export type GameState = {
  // ...
  pending: PendingAction
  // ...
}
```

Delete the `pending` line. Compiler will surface every reader.

(`PendingAction` union type itself is NOT deleted — `InteractionState` in `shared/game/types.ts` still uses constituent shapes for protocol compatibility. S2 deletes the union type wholesale.)

- [ ] **Step 10.2: Remove from `SerializedGameState`**

In `shared/game/serialization.ts`, ensure the `Omit<GameState, ...>` correctly excludes `pending` (since field is gone, no Omit needed). Verify:

```ts
export type SerializedGameState = Omit<GameState, 'actionSpaces' | 'roundStartSnapshot'> & {
  actionSpaces: SerializedActionSpace[]
  roundStartSnapshot: null
  engineStack: EngineStackCursor
}
```

If old code wrote `serialized.pending = ...`, delete those writes.

- [ ] **Step 10.3: Delete `private pending: PendingAction` field from GameCore**

In `shared/session/game-core.ts`, find:

```ts
private pending: PendingAction = { type: 'none' }
```

Delete the line. Compiler will surface every read site.

- [ ] **Step 10.4: Compile and triage error list**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | head -50`
You'll see ~50 errors of form: `Property 'pending' does not exist on type 'GameState'` or `Property 'pending' does not exist on type 'GameCore'`.

For each:

| Old read | New read |
|---|---|
| `this.pending.type === 'none'` | `!this.engineStack.peekInteraction()` |
| `this.pending.type === 'choice'` | `this.engineStack.peekInteraction()?.request?.kind === 'choice'` |
| `this.pending.type === 'animalReorg'` | `this.engineStack.peekInteraction()?.request?.kind === 'animal-reorg'` |
| `this.pending.type === 'harvestFeed'` | `this.engineStack.peekInteraction()?.request?.kind === 'feed'` |
| `this.pending.type === 'confirmNextPlayer'` | `this.engineStack.peekInteraction()?.request?.kind === 'confirm-next-player'` |
| `this.pending.type === 'confirmPlayerSwitch'` | `this.engineStack.peekInteraction()?.request?.kind === 'confirm-player-switch'` |
| `this.pending.playerIndex` | `this.engineStack.current()?.ownerPlayerIndex` |
| `this.pending.spaceId` | `this.engineStack.current()?.spaceId` |
| `this.pending.promptKey` | `this.engineStack.peekInteraction()?.promptKey` |
| `this.pending.options` | `this.engineStack.peekInteraction()?.choices` (until Task 5 migration consolidates `choices` → `request.options`) |
| `this.pending.zones` | `(this.engineStack.peekInteraction()?.request as ...).zones` (with kind narrow) |
| `this.pending = { ... }` (writer) | Already converted in Tasks 6 + 9; if any remain, convert per pattern in §3.5 of spec |

Do these edits in batches, recompiling between batches.

- [ ] **Step 10.5: Rewrite `GameCore.buildInteraction()` to derive from engineStack**

In `shared/session/game-core.ts`, replace the entire `buildInteraction(): InteractionState` body:

```ts
private buildInteraction(): InteractionState {
  const node = this.engineStack.peekInteraction()
  const frame = this.engineStack.current()

  if (!node || !frame) {
    return { stateId: 'idle', allowedCommands: [], anytimeActions: [] }
  }

  const playerIndex = frame.ownerPlayerIndex
  const spaceId = frame.spaceId
  const request = node.request
  const promptKey = node.promptKey
  const promptParams: Record<string, unknown> | undefined = undefined  // populate if needed
  const sourceCard = (node as { sourceCard?: string }).sourceCard

  switch (request?.kind) {
    case 'animal-reorg':
      return {
        stateId: 'animalReorg',
        playerIndex,
        spaceId,
        zones: request.zones,
        allowedCommands: ['resolveChoice', 'undoStep', 'undoAction'],
        anytimeActions: [],
      }
    case 'confirm-next-player':
      return {
        stateId: 'confirmNextPlayer',
        nextPlayerIndex: request.nextPlayerIndex,
        allowedCommands: ['resolveChoice'],
        anytimeActions: [],
      }
    case 'confirm-player-switch':
      return {
        stateId: 'confirmPlayerSwitch',
        fromPlayerIndex: request.fromPlayerIndex,
        toPlayerIndex: request.toPlayerIndex,
        allowedCommands: ['resolveChoice'],
        anytimeActions: [],
      }
    case 'feed':
      return {
        stateId: 'harvestFeed',
        playerIndex,
        remaining: request.remaining,
        foodUsed: request.foodUsed,
        feedQueue: request.feedQueue,
        allowedCommands: ['resolveChoice'],
        anytimeActions: this.buildAnytimeEntries().map((e) => e.descriptor),
      }
    case 'choice':
    default: {
      // promptKey-based dispatch (S1 keeps this; S2 will replace with request.kind for farm-select/selection)
      const farmType = promptKey ? this.isFarmPromptKey(promptKey) : null
      const isSelection = promptKey ? this.isSelectionPromptKey(promptKey) : false
      const player = this.state.players[playerIndex]

      if (farmType && player) {
        return {
          stateId: 'farmSelect',
          playerIndex, spaceId, promptKey, promptParams, sourceCard,
          options: request?.kind === 'choice' ? request.options : node.choices,
          farm: this.buildFarmInteractionFromNode(node, player),
          allowedCommands: ['commitFarm', 'resolveChoice', 'undoStep', 'undoAction'],
          anytimeActions: this.buildAnytimeEntries().map((e) => e.descriptor),
        }
      }

      if (isSelection && player) {
        return {
          stateId: 'selection',
          playerIndex, spaceId, promptKey, promptParams, sourceCard,
          options: request?.kind === 'choice' ? request.options : node.choices,
          selection: this.buildSelectionInteractionFromNode(node, player),
          allowedCommands: ['commitSelection', 'resolveChoice', 'undoStep', 'undoAction'],
          anytimeActions: this.buildAnytimeEntries().map((e) => e.descriptor),
        }
      }

      return {
        stateId: 'choice',
        playerIndex, spaceId, promptKey, promptParams, sourceCard,
        options: request?.kind === 'choice' ? request.options : node.choices,
        allowedCommands: ['resolveChoice', 'undoStep', 'undoAction'],
        anytimeActions: this.buildAnytimeEntries().map((e) => e.descriptor),
      }
    }
  }
}
```

(`buildFarmInteractionFromNode` and `buildSelectionInteractionFromNode` are existing helpers — they previously took `pending: Extract<PendingAction, ...>`; refactor to take `node: InteractionNode, player: PlayerState` since `pending` no longer exists.)

- [ ] **Step 10.6: Refactor `buildFarmInteractionFromNode` / `buildSelectionInteractionFromNode`**

Existing names (in pre-S1 game-core.ts ~line 723, 736):

```ts
private buildFenceInteraction(pending: Extract<PendingAction, { type: 'choice' }>): InteractionFarmSelection
private buildSelectionInteraction(player: PlayerState): InteractionSelection
private buildFarmInteraction(pending: Extract<PendingAction, { type: 'choice' }>): InteractionFarmSelection | null
```

Refactor signatures to:

```ts
private buildFenceInteractionFromNode(node: InteractionNode, player: PlayerState): InteractionFarmSelection {
  const actionContext = this.getActionContextFromNode(node)
  return buildFenceFarmInteraction(player, { actionContext, costOverride: ..., promptKey: node.promptKey })
}
```

Add helper:

```ts
private getActionContextFromNode(node: InteractionNode): Record<string, unknown> | undefined {
  // The InteractionNode exposes context via the engine's pendingInteractionContext
  return this.engineStack.current()?.engine.getPendingInteractionContext()?.actionContext
}
```

- [ ] **Step 10.7: Run forced-green subset**

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
  shared/game/__tests__/serialization-cursor.test.ts
```
Expected: PASS.

- [ ] **Step 10.8: Verify pending field truly gone**

Run:
```bash
grep -nE "this\.pending|state\.pending|GameState\['pending'\]|: PendingAction" shared/ server/ | grep -v "test\." | grep -v __tests__
```
Expected: only `PendingAction` type definition references (in `types.ts` for InteractionState shapes); no `.pending` field accesses.

- [ ] **Step 10.9: Commit**

```bash
git add shared/game/types.ts shared/game/serialization.ts shared/session/game-core.ts
git commit -m "feat(session): delete GameState.pending field; buildInteraction derives from engineStack"
```

---

## Task 11: Codemod forced-green tests + create skip-tracker.md

**Files:**
- Create: `docs/skip-tracker.md`
- Modify: `server/__tests__/harvest-session.test.ts`
- Modify: `server/__tests__/harvest-feed-session.test.ts`
- Modify: `server/__tests__/on-end-turn-session.test.ts`
- Modify: `server/__tests__/stage-hook-flow.test.ts`
- Modify: `server/__tests__/reorganize-engine-session.test.ts`
- Modify: `tests/pending-undo-regression.test.ts`
- Modify: `tests/protocol-types.test.ts`
- Modify: `tests/game-sync-pipeline.test.ts`
- Modify: `tests/llm-card-gen/session-helpers.ts`

- [ ] **Step 11.1: Create `docs/skip-tracker.md` initial scaffold**

Create `docs/skip-tracker.md`:

```markdown
# Test Skip Tracker

Tracks tests skipped during architecture refactor sprints. Each skip must list:
- Test file + describe/it name
- Sprint that introduced the skip (S1, S2, ...)
- Reason (one line)
- Expected resolution sprint (default: S7 = card test regression)

## Active skips

| Test | Skipped in | Reason | Resolve in |
|---|---|---|---|
| _populated by sprint commits_ | | | |

## Resolved skips

| Test | Originally skipped in | Resolved in | Notes |
|---|---|---|---|
| _populated when skip lifted_ | | | |
```

- [ ] **Step 11.2: Codemod `confirmAnimalReorg(player, zones)` → `dispatch({ kind: 'resolveChoice', payload: zones })`**

For each forced-green test file, find calls of pre-S1 confirm methods and rewrite. Example for `server/__tests__/reorganize-engine-session.test.ts`:

```ts
// OLD:
resp = session.confirmAnimalReorg(0, [{ id: 'pasture-...', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }])

// NEW:
resp = session.dispatch({ kind: 'resolveChoice', selection: 'confirm', payload: [{ id: 'pasture-...', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }] })
```

Note: `confirmAnimalReorg` was already deleted in main (sprint-7b1d). The pre-S1 codemod renamed it to a different signature. Verify what the current main HEAD calls — likely `dispatch({ type: 'resolveChoice', payload: zones })` already.

- [ ] **Step 11.3: Codemod `confirmHarvestFeed` calls**

```ts
// OLD:
resp = session.confirmHarvestFeed(0, [{ count: 2, sourceId: 'someCard', exchangeIndex: 0 }])

// NEW:
resp = session.dispatch({ kind: 'resolveChoice', payload: [{ count: 2, sourceId: 'someCard', exchangeIndex: 0 }] })
```

- [ ] **Step 11.4: Codemod `confirmNextPlayer` / `confirmPlayerSwitch` calls**

```ts
// OLD: session.confirmNextPlayer()
// NEW: session.dispatch({ kind: 'resolveChoice' })

// OLD: session.confirmPlayerSwitch()
// NEW: session.dispatch({ kind: 'resolveChoice' })
```

- [ ] **Step 11.5: Run forced-green subset**

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
  shared/game/__tests__/serialization-cursor.test.ts \
  shared/engine/__tests__/engine-stack.test.ts \
  shared/engine/__tests__/
```
Expected: ALL PASS.

- [ ] **Step 11.6: Run full fast project; identify card test failures and skip them**

Run: `pnpm test:fast 2>&1 | tee /tmp/fast.log`
Expected: forced-green subset PASS; some card tests FAIL because they call old `confirmXxx` API.

For each failing card test:
1. Open the file (e.g. `server/__tests__/A92_AdoptiveParents-session.test.ts`)
2. Find each `it(...)` that fails
3. Replace `it(` with `it.skip(` and add comment: `// SKIP[S1]: confirmXxx → resolveChoice codemod pending, see docs/skip-tracker.md`
4. Add row to `docs/skip-tracker.md`:

```markdown
| server/__tests__/A92_AdoptiveParents-session.test.ts > "scenario name" | S1 | confirmHarvestFeed call signature changed | S7 |
```

- [ ] **Step 11.7: Re-run fast project; verify all pass (with skips)**

Run: `pnpm test:fast`
Expected: 0 failures, N skipped (N = card test cases skipped in Step 11.6).

Capture output: `pnpm test:fast 2>&1 | grep -E "Tests|skipped"` — record numbers for PR description.

- [ ] **Step 11.8: Run lint**

Run: `pnpm run lint`
Expected: 0 errors. Warnings unchanged (project has ~1170 pre-existing warnings).

- [ ] **Step 11.9: Run build**

Run: `pnpm run build`
Expected: build success.

- [ ] **Step 11.10: Verify spec DoD (`docs/sprint-S1-spec.md` §7)**

Walk through every checkbox in spec §7 manually:
- [ ] `pausedEngine` field deleted (`grep "pausedEngine" shared/session/game-core.ts` empty)
- [ ] 6 frame fields deleted (grep each: `engine`, `engineSource`, `activeSpaceId`, `activePlayerIndex`, `stageResume`, `deferredPlayerSwitch` — only as getters, not declarations)
- [ ] `engine-stack.ts` exists and used
- [ ] `SubFlowKind` 5 kinds exported
- [ ] `InteractionRequest` 5 kinds, all triggered
- [ ] `ActionExecutionResult.choice` and `.animalReorg` deleted
- [ ] `ChoiceNode` not in code
- [ ] `GameState.pending` not in code
- [ ] `SerializedGameState.pending` not in code
- [ ] `PendingAction.confirmNextPlayer / .confirmPlayerSwitch / .harvestFeed` not in code (in PendingAction union body or referenced)
- [ ] `ClientCommand.confirmNextPlayer / .confirmPlayerSwitch / .feed` not in code
- [ ] `GameCore.confirmNextPlayer() / .confirmPlayerSwitch() / .confirmHarvestFeed()` methods deleted
- [ ] `'ui.interactionAnimalReorg'` literal not in code (outside comments / i18n keys)
- [ ] `'__reorganize__'` literal not in code; `__subflow:` prefix used
- [ ] `SerializedGameState.engineStack` required
- [ ] serialize/rehydrate handle engineStack
- [ ] `buildInteraction()` reads from engineStack
- [ ] All `'request'` emitters carry `request: InteractionRequest`

If any unchecked, address before commit.

- [ ] **Step 11.11: Commit final batch**

```bash
git add tests/ server/__tests__/ docs/skip-tracker.md
git commit -m "test(session): codemod forced-green tests to dispatch resolveChoice; add skip-tracker.md"
```

- [ ] **Step 11.12: Optional rebase + push**

```bash
git fetch origin main
git rebase origin/main      # should be fast-forward unless main moved
# DO NOT push yet — open PR via gh CLI when ready
```

PR draft:

```bash
gh pr create --draft --title "S1: Eliminate PendingAction + InteractionNode skeleton + D-a cursor" --body "$(cat <<'EOF'
## Summary
Implements `docs/sprint-S1-spec.md`:
- EngineStack replaces ad-hoc `pausedEngine` + 6 frame fields
- InteractionNode + InteractionRequest sum type (5 kinds: choice / animal-reorg / confirm-next-player / confirm-player-switch / feed)
- D-a: engine cursor in SerializedGameState
- GameState.pending field deleted; buildInteraction derives from engineStack
- confirmNextPlayer / confirmPlayerSwitch / harvestFeed promoted to InteractionNode + private handlers
- R1–R4 reorganize prototype residue cleaned

## Skip increment
- Newly skipped this sprint: <N>
- Cumulative skipped: <M>
- See `docs/skip-tracker.md` for breakdown.

## Test plan
- [x] `pnpm test:fast` — forced-green subset green; N skipped
- [x] `pnpm exec vitest run shared/game/__tests__/serialization-cursor.test.ts` — 5 round-trip tests pass
- [x] `pnpm run lint` — 0 errors
- [x] `pnpm run build` — success
EOF
)"
```

---

## Self-review

After all tasks complete, walk back through:

1. **Spec coverage** — every item in `docs/sprint-S1-spec.md` §1 range table mapped to a Task:
   - R1 EngineStack → Task 2 + Task 6
   - R2 subFlowKind → Task 7
   - R3 stageResume.extra → Task 7
   - R4 __subflow:NAME → Task 7
   - N1 InteractionNode → Task 1 + Task 3
   - N2 ActionExecutionResult.request → Task 1 + Task 4 + Task 5
   - D-a cursor → Task 8
   - P0 delete pending field → Task 10
   - P1 confirmNextPlayer/PlayerSwitch promote → Task 9
   - P2 harvestFeed promote → Task 9

2. **No placeholders** — all code blocks have real code, no TBD/TODO/"add appropriate".

3. **Type consistency** — `EngineStack`, `InteractionNode`, `InteractionRequest`, `EngineFrameCursor`, `SubFlowKind`, `EngineSource`, `StageResumeState` names used consistently across all tasks.

4. **Forced-green tests run between every commit step** — yes, every Task ends with run + commit.

---

## Risks

- **Task 5 (effect codemod)** — ~15 emitters; if compiler doesn't catch all (e.g. dynamic dispatch via `if (action.execute) ...`), some leaves may silently emit old shape. Mitigation: type-narrow `ActionExecutionResult` strictly, run all session tests.

- **Task 6 (GameCore refactor)** — biggest single delta. Mitigation: writer-pattern checklist (a/b/c) + run forced-green subset after each batch + small commits per writer cluster.

- **Task 8 (cursor restore)** — Engine.restore must rehydrate `node.request`; Step 8.9 addresses but verify with all 5 kinds in serialization-cursor.test.ts.

- **Task 9.7 (Engine.injectInteraction)** — new Engine method; behavior must match what `result.type === 'request'` does in Task 4 Step 4.2. Risk: subtle divergence if engine has pre-existing pending node when injection happens.

- **Task 11.6 card test triage** — could be ~50-150 cards skipped; manual triage takes hours. Acceptable per `docs/sprint-S1-spec.md` §6.

---

## Deferred to S2

- farm-select / selection / card-draft request kinds
- Delete `commitFarm` / `commitSelection` ClientCommand variants
- Delete `GameCore.buildFarmInteraction*` / `buildSelectionInteraction*` (fold into leaf actions)
- `selection.ts` `choice.split(',')` string-encoding cleanup
- Protocol layer InteractionState 8 → 3 stateId simplification
- Frontend ~100 codemod sites
- `isFarmPromptKey()` / `isSelectionPromptKey()` deletion
- `PendingAction` union type body deletion (S2 with InteractionState simplification)
- Session phase mixin split (`session-core.ts` + `phases/*.ts`)
