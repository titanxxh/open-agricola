# Substep Immediate Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove specialized delta-based business log reconciliation from `GameCore` and make `improvement`, `occupation`, and `bake-bread` emit logs at the substep that actually performs the action.

**Architecture:** Extend the engine/action result protocol with an `immediateLogs` channel that works for both `ok` and `flow` results, then migrate step-local business logs onto that channel while keeping legacy `logKey/logParams` compatibility. After the migrated paths are covered by tests, delete the specialized `GameCore` delta loggers and retain only aggregate action-detail logging there.

**Tech Stack:** TypeScript, custom action engine, Vitest, pnpm

---

## File Map

**Protocol and engine**

- `shared/game/types.ts`
  - Extend `ActionExecutionResult` with `immediateLogs` on `ok` and `flow`.
- `shared/actions/hooks.ts`
  - Extend `ActionHookResult` with `immediateLogs`.
- `shared/engine/engine.ts`
  - Normalize legacy `logKey/logParams` and new `immediateLogs`.
  - Append action immediate logs before hook phases, and hook immediate logs during hook consumption.

**Step-local business log emitters**

- `shared/actions/effects/improvement.ts`
  - Emit `log.playImprovement` / `log.playMinorImprovement` from the purchase step even when `onBuy` returns `flow`.
- `shared/actions/effects/occupation.ts`
  - Replace `extraData.occupationLog` with direct `immediateLogs`.
- `shared/actions/effects/bake-bread.ts`
  - Emit `log.bakeBread` from the actual bake step instead of relying on session delta reconciliation.

**Session cleanup**

- `shared/session/game-core.ts`
  - Remove `logImprovementDelta()`, `logOccupationDelta()`, `logBakeBreadDelta()`, and `emitActionResultExtraLogs()`.
  - Keep `logActionDetail` and leaf-flush aggregation.

**Tests**

- `shared/actions/effects/__tests__/improvement-log.test.ts`
  - Add direct coverage for `immediateLogs` on `ok` and `flow`.
- `server/__tests__/D95_SiteManager-session.test.ts`
  - Keep the occupation-followed-by-improvement regression green.
- `server/__tests__/A123_FrameBuilder-renovate-log-session.test.ts`
  - Ensure `actionDetail` aggregation still works after session cleanup.
- `server/__tests__/house-redevelopment-leaf-log.test.ts`
  - Ensure leaf flush ordering stays intact.
- `shared/cards/__tests__/cooking-exchange.test.ts`
  - Add direct `bakeBread()` log-shape coverage.
- `server/__tests__/C107_Baker-session.test.ts`
  - Add session-level bake-bread ordering coverage.

### Task 1: Add engine-level immediate log support

**Files:**
- Modify: `shared/game/types.ts`
- Modify: `shared/actions/hooks.ts`
- Modify: `shared/engine/engine.ts`
- Test: `shared/engine/__tests__/immediate-logs.test.ts`

- [ ] **Step 1: Write the failing engine test**

```ts
import { describe, expect, it } from 'vitest'
import { Engine } from '../engine'
import { ActionRegistry } from '../registry'
import { LogStore } from '../log-store'
import type { ActionDefinition, GameState, PlayerState } from '../../game/types'

const makePlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: { food: 0, wood: 0, clay: 0, stone: 0, reed: 0, grain: 0, vegetable: 0 },
  workers: [],
  fields: [],
  pastures: [],
  roomTiles: [],
  stableTiles: [],
  fences: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  activeModifiers: [],
  cardStates: {},
})

describe('immediateLogs', () => {
  it('writes immediate logs for flow results before inserting follow-up flow', () => {
    const registry = new ActionRegistry()
    const log = new LogStore()
    const action: ActionDefinition = {
      id: 'test-action',
      nameKey: 'actions.test.name',
      descriptionKey: 'actions.test.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'flow',
        immediateLogs: [{ key: 'log.testStep', params: { marker: 'before-flow' } }],
        flow: { type: 'leaf', actionId: 'follow-up' },
      }),
    }
    const followUp: ActionDefinition = {
      id: 'follow-up',
      nameKey: 'actions.followUp.name',
      descriptionKey: 'actions.followUp.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok', logKey: 'log.followUp' }),
    }
    registry.register(action)
    registry.register(followUp)

    // build engine, run one step, then assert log order
    expect(log.all().map((entry) => entry.key)).toEqual(['log.testStep', 'log.followUp'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run shared/engine/__tests__/immediate-logs.test.ts`

Expected: FAIL because `ActionExecutionResult` does not allow `immediateLogs`, and/or engine does not append the log before follow-up flow.

- [ ] **Step 3: Add the minimal protocol changes**

```ts
// shared/game/types.ts
export type ImmediateLogEntry = {
  key: string
  params?: Record<string, unknown>
}

export type ActionExecutionResult =
  | {
      type: 'ok'
      logKey?: string
      resourcesGained?: Partial<Resource>
      resourcesPaid?: Partial<Resource>
      logParams?: Record<string, unknown>
      immediateLogs?: ImmediateLogEntry[]
      extraData?: Record<string, unknown>
    }
  | { type: 'choice'; promptKey?: string; promptParams?: Record<string, unknown>; options: ActionChoiceOption[] }
  | { type: 'animalReorg'; sourceId: string }
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow; immediateLogs?: ImmediateLogEntry[]; extraData?: Record<string, unknown> }
```

```ts
// shared/actions/hooks.ts
export type ActionHookResult = {
  doable?: boolean
  actionId?: string
  extraData?: Record<string, unknown>
  extraOptions?: ActionChoiceOption[]
  followUpActions?: FollowUpAction[]
  flow?: ActionFlow
  costs?: Partial<Resource>
  trades?: import('../game/types').Trade[]
  bonuses?: import('../game/types').Bonus[]
  sourceCard?: string
  logKey?: string
  logParams?: Record<string, unknown>
  immediateLogs?: import('../game/types').ImmediateLogEntry[]
  labelKey?: string
  labelParams?: Record<string, unknown>
  decline?: boolean
  alternativeFlow?: ActionFlow
}
```

- [ ] **Step 4: Implement engine log normalization**

```ts
// shared/engine/engine.ts
const collectImmediateLogs = (
  playerName: string,
  result: { logKey?: string; logParams?: Record<string, unknown>; immediateLogs?: { key: string; params?: Record<string, unknown> }[] },
) => {
  const out = [...(result.immediateLogs ?? [])]
  if (result.logKey) {
    out.unshift({ key: result.logKey, params: result.logParams })
  }
  return out.map((entry) => ({
    key: entry.key,
    params: { player: playerName, ...(entry.params ?? {}) },
  }))
}

// when consuming action result
collectImmediateLogs(context.player.name, result).forEach((entry) => {
  this.log.append(entry)
})

// when consuming hook entries
allResults.flatMap((entry) => collectImmediateLogs(context.player.name, entry)).forEach((entry) => {
  this.log.append(entry)
})
```

- [ ] **Step 5: Run the focused engine test**

Run: `pnpm exec vitest run shared/engine/__tests__/immediate-logs.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/game/types.ts shared/actions/hooks.ts shared/engine/engine.ts shared/engine/__tests__/immediate-logs.test.ts
git commit -m "refactor(log): add engine immediate log support"
```

### Task 2: Move improvement logs to the purchase step

**Files:**
- Modify: `shared/actions/effects/improvement.ts`
- Test: `shared/actions/effects/__tests__/improvement-log.test.ts`
- Test: `server/__tests__/D95_SiteManager-session.test.ts`

- [ ] **Step 1: Add a failing improvement-flow test**

```ts
it('emits playImprovement immediate log even when onBuy returns flow', () => {
  const state = createState()
  const player = createPlayer()
  player.resources.clay = 2
  player.improvements = ['Major_ClayOven']

  const result = playImprovement(state, player, 'C60_SmallPottersOven', 'minor')

  expect(result.type).toBe('flow')
  if (result.type !== 'flow') return
  expect(result.immediateLogs).toEqual([
    {
      key: 'log.playMinorImprovement',
      params: {
        improvements: 'C60_SmallPottersOven',
        costResources: { clay: 2 },
        returnedCards: ['Major_ClayOven'],
      },
    },
  ])
})
```

- [ ] **Step 2: Run the focused improvement test to verify it fails**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/improvement-log.test.ts`

Expected: FAIL because `flow` results from `playImprovement()` do not yet carry immediate logs.

- [ ] **Step 3: Refactor improvement log construction into a shared purchase helper**

```ts
type ImprovementLogKind = 'major' | 'minor'

const buildImprovementImmediateLogs = (
  kind: ImprovementLogKind,
  improvementId: string,
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  options?: {
    returnedCards?: string[]
    bonusSources?: string[]
  },
) => [
  {
    key: kind === 'major' ? 'log.playImprovement' : 'log.playMinorImprovement',
    params: buildImprovementLogParams(improvementId, costResources, options),
  },
]
```

- [ ] **Step 4: Attach immediate logs on both `ok` and `flow` paths**

```ts
// inside finalizeMajorImprovementPurchase / finalizeMinorImprovementPurchase
const immediateLogs = buildImprovementImmediateLogs(
  'major',
  improvementId,
  costResources,
  {
    returnedCards: returnedMajorId ? [returnedMajorId] : undefined,
    bonusSources: readActionBonusSources(player),
  },
)

if (activation.type === 'flow') {
  activation.immediateLogs = immediateLogs
  return attachImprovementPayment(activation, improvementId, costResources, returnedMajorId)
}

return attachImprovementPayment({
  type: 'ok',
  immediateLogs,
}, improvementId, costResources, returnedMajorId)
```

- [ ] **Step 5: Update tests to assert the new step-local behavior**

```ts
// shared/actions/effects/__tests__/improvement-log.test.ts
expect(result.immediateLogs).toEqual([
  {
    key: 'log.playImprovement',
    params: {
      improvements: 'Major_Fireplace1',
      costResources: { clay: 2 },
    },
  },
])
```

```ts
// server/__tests__/D95_SiteManager-session.test.ts
const keys = resp.state.log.map((entry) => entry.key)
expect(keys.indexOf('log.playImprovement')).toBeLessThan(keys.indexOf('log.actionDetail'))
```

- [ ] **Step 6: Run focused tests**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/improvement-log.test.ts server/__tests__/D95_SiteManager-session.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add shared/actions/effects/improvement.ts shared/actions/effects/__tests__/improvement-log.test.ts server/__tests__/D95_SiteManager-session.test.ts
git commit -m "refactor(log): emit improvement logs at purchase time"
```

### Task 3: Migrate occupation and bake-bread to immediate logs

**Files:**
- Modify: `shared/actions/effects/occupation.ts`
- Modify: `shared/actions/effects/bake-bread.ts`
- Test: `server/__tests__/D95_SiteManager-session.test.ts`
- Test: `shared/cards/__tests__/cooking-exchange.test.ts`
- Test: `server/__tests__/C107_Baker-session.test.ts`

- [ ] **Step 1: Add failing occupation and bake-bread tests**

```ts
// server/__tests__/D95_SiteManager-session.test.ts
expect(occEntry?.params).toEqual({
  player: 'PlayerA',
  occupations: 'D95_SiteManager',
  costResources: { food: 1 },
})
```

```ts
// shared/cards/__tests__/cooking-exchange.test.ts
it('returns an immediate bakeBread log from the bake step', () => {
  const player = makePlayer()
  player.resources.grain = 1
  player.improvements = ['Major_ClayOven']

  const result = bakeBread(player, 'Major_ClayOven', 1)

  expect(result.immediateLogs).toEqual([
    {
      key: 'log.bakeBread',
      params: { count: 1, food: 5 },
    },
  ])
})
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `pnpm exec vitest run server/__tests__/D95_SiteManager-session.test.ts shared/cards/__tests__/cooking-exchange.test.ts`

Expected: FAIL because `occupation` still relies on `extraData.occupationLog`, and `bakeBread()` still emits `log.bakeBreadResult` / session delta behavior.

- [ ] **Step 3: Replace `extraData.occupationLog` with immediate logs**

```ts
const buildOccupationImmediateLogs = (
  occupationId: string,
  costResources: Partial<Resource> | undefined,
  bonusSources?: string[],
) => [
  {
    key: 'log.playOccupation',
    params: buildOccupationLogParams(occupationId, costResources, bonusSources),
  },
]

if (activation.type === 'flow') {
  activation.immediateLogs = buildOccupationImmediateLogs(
    occupation.id,
    cost,
    readActionBonusSources(player),
  )
  return activation
}

return {
  type: 'ok',
  immediateLogs: buildOccupationImmediateLogs(
    occupation.id,
    cost,
    readActionBonusSources(player),
  ),
}
```

- [ ] **Step 4: Make `bakeBread()` emit `log.bakeBread` immediately**

```ts
export const bakeBread = (
  player: PlayerState,
  cardId: string,
  times = 1,
): ActionExecutionResult => {
  const rates = getPlayerBakeRates(player)
  const rate = rates.find((r) => r.cardId === cardId)
  if (!rate || player.resources.grain <= 0) return { type: 'ok' }
  const bakeTimes = Math.max(0, Math.min(player.resources.grain, times))
  if (bakeTimes === 0) return { type: 'ok' }
  const foodGained = rate.rate * bakeTimes
  player.resources.grain -= bakeTimes
  player.resources.food += foodGained
  return {
    type: 'ok',
    immediateLogs: [
      {
        key: 'log.bakeBread',
        params: { count: bakeTimes, food: foodGained },
      },
    ],
  }
}
```

- [ ] **Step 5: Add a session-level bake-bread ordering test**

```ts
it('writes bakeBread before harvest/feed follow-up processing continues', () => {
  const session = new GameSession()
  // set up Baker or another flow that inserts optional bake-bread
  // drive choice resolution
  expect(resp.state.log[0]?.key).toBe('log.bakeBread')
})
```

- [ ] **Step 6: Run focused tests**

Run: `pnpm exec vitest run server/__tests__/D95_SiteManager-session.test.ts shared/cards/__tests__/cooking-exchange.test.ts server/__tests__/C107_Baker-session.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add shared/actions/effects/occupation.ts shared/actions/effects/bake-bread.ts server/__tests__/D95_SiteManager-session.test.ts shared/cards/__tests__/cooking-exchange.test.ts server/__tests__/C107_Baker-session.test.ts
git commit -m "refactor(log): move occupation and bake-bread logs to substeps"
```

### Task 4: Delete specialized GameCore delta loggers and verify regressions

**Files:**
- Modify: `shared/session/game-core.ts`
- Test: `server/__tests__/A123_FrameBuilder-renovate-log-session.test.ts`
- Test: `server/__tests__/house-redevelopment-leaf-log.test.ts`
- Test: `server/__tests__/D95_SiteManager-session.test.ts`

- [ ] **Step 1: Write a failing regression test around GameCore cleanup**

```ts
it('still emits improvement and occupation logs after GameCore delta helpers are removed', () => {
  const session = setupSessionThatUsesD95AndFollowUpImprovement()
  const resp = driveActionToCompletion(session)
  const keys = resp.state.log.map((entry) => entry.key)
  expect(keys).toContain('log.playOccupation')
  expect(keys).toContain('log.playImprovement')
})
```

- [ ] **Step 2: Run the focused regression suite to verify red**

Run: `pnpm exec vitest run server/__tests__/D95_SiteManager-session.test.ts server/__tests__/A123_FrameBuilder-renovate-log-session.test.ts server/__tests__/house-redevelopment-leaf-log.test.ts`

Expected: PASS before cleanup, establishing the regression baseline that must stay green after removing the specialized delta helpers.

- [ ] **Step 3: Remove specialized delta loggers and related forwarding**

```ts
// shared/session/game-core.ts
// delete:
// - logImprovementDelta()
// - logOccupationDelta()
// - logBakeBreadDelta()
// - emitActionResultExtraLogs()

private finalizeActionLog(player: PlayerState) {
  const before = this.actionStartPlayerSnapshot
  if (before) {
    this.logActionDetail(before, player)
  }
  this.actionStartPlayerSnapshot = null
  delete player._activeActionBonusSources
  this.usedBakeBreadThisAction = false
}
```

- [ ] **Step 4: Keep leaf-flush aggregation intact**

```ts
// preserve this behavior:
if (result.type === 'ok' && resolvedActionId) {
  this.flushLeafActionDetail(resolvedActionId, Boolean(result.logKey))
}
```

Do not change `buildActionDetailParts()`, `flushLeafActionDetail()`, or the `emitLeafActionDetail` contract in this task except for removing obsolete specialized-delta comments/guards.

- [ ] **Step 5: Run regression tests and then the build**

Run: `pnpm exec vitest run server/__tests__/D95_SiteManager-session.test.ts server/__tests__/A123_FrameBuilder-renovate-log-session.test.ts server/__tests__/house-redevelopment-leaf-log.test.ts`

Expected: PASS

Run: `pnpm run build`

Expected: exit code 0

- [ ] **Step 6: Commit**

```bash
git add shared/session/game-core.ts server/__tests__/D95_SiteManager-session.test.ts server/__tests__/A123_FrameBuilder-renovate-log-session.test.ts server/__tests__/house-redevelopment-leaf-log.test.ts
git commit -m "refactor(log): remove GameCore delta reconciliation"
```

### Task 5: Final verification sweep

**Files:**
- Modify: none
- Test: `shared/engine/__tests__/immediate-logs.test.ts`
- Test: `shared/actions/effects/__tests__/improvement-log.test.ts`
- Test: `server/__tests__/D95_SiteManager-session.test.ts`
- Test: `shared/cards/__tests__/cooking-exchange.test.ts`
- Test: `server/__tests__/C107_Baker-session.test.ts`
- Test: `server/__tests__/A123_FrameBuilder-renovate-log-session.test.ts`
- Test: `server/__tests__/house-redevelopment-leaf-log.test.ts`

- [ ] **Step 1: Run the focused suite**

Run:

```bash
pnpm exec vitest run \
  shared/engine/__tests__/immediate-logs.test.ts \
  shared/actions/effects/__tests__/improvement-log.test.ts \
  server/__tests__/D95_SiteManager-session.test.ts \
  shared/cards/__tests__/cooking-exchange.test.ts \
  server/__tests__/C107_Baker-session.test.ts \
  server/__tests__/A123_FrameBuilder-renovate-log-session.test.ts \
  server/__tests__/house-redevelopment-leaf-log.test.ts
```

Expected: PASS

- [ ] **Step 2: Run lints on changed files**

Run:

```bash
pnpm exec eslint \
  shared/game/types.ts \
  shared/actions/hooks.ts \
  shared/engine/engine.ts \
  shared/actions/effects/improvement.ts \
  shared/actions/effects/occupation.ts \
  shared/actions/effects/bake-bread.ts \
  shared/session/game-core.ts
```

Expected: exit code 0

- [ ] **Step 3: Run final build**

Run: `pnpm run build`

Expected: exit code 0

- [ ] **Step 4: Confirm the working tree is clean after verification**

```bash
git status --short
```

Expected: no output

If output is non-empty, stop and either:

```bash
git diff --stat
```

or

```bash
git diff
```

then fix the unexpected leftovers before considering the plan complete.

## Self-Review Checklist

- Spec coverage:
  - Engine-level immediate log protocol: Task 1
  - `improvement` migration: Task 2
  - `occupation` migration: Task 3
  - `bakeBread` migration: Task 3
  - `GameCore` specialized delta removal: Task 4
  - Regression and build verification: Task 5

- Placeholder scan:
  - No `TODO` / `TBD`
  - All tasks contain exact files, commands, and concrete code snippets

- Type consistency:
  - New field name is consistently `immediateLogs`
  - Hook and action result protocols use the same log entry shape
  - `extraData.improvementPayment` remains unchanged and is not renamed
