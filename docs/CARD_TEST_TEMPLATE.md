# Card Testing Template

[English](CARD_TEST_TEMPLATE.md) | [中文](CARD_TEST_TEMPLATE_zh.md)

## 1. Purpose

This document defines the standard testing approach for adding or changing a card implementation in Open Agricola.

Core principles:

- Use static gates for mechanical constraints, direct behavior tests for simple immediate effects, and the `GameSession` boundary for high-risk flows.
- Assert real behavior, not the existence of exports or object shapes.
- Session assertions should focus on the server response: `state`, `interaction`, `state.log`, and `scores`.
- Test frontend rendering, controls, and screenshots separately in rendering tests or E2E tests.

In short:

- Card correctness is primarily determined by backend state changes.
- Display correctness is primarily determined by frontend rendering tests and E2E tests.

## 2. Scope

Use this template for:

- Occupations
- Minor improvements
- Card effects attached to major improvements
- Action-triggered passive cards
- Round-phase-triggered cards
- Cards that introduce waiting interactions, follow-up actions, additional choices, or delayed effects

Do not use it for:

- Style-only changes
- Text-only translation changes
- General UI component tests unrelated to cards
- Tests of whether Workshop or AI Designer generated code runs; that framework is documented in `docs/test/llm-card-gen.md`

## 3. Test Layers

Choose the smallest test layer that proves the rule. Do not generate generic smoke tests that only verify exports, definitions, or object shapes.

### 3.1 Static Gates

Put mechanically verifiable constraints that do not require a running game in CI static gates. For example, a listener that returns `costs` must provide `costAttribution` in the same object. Static gates do not replace card behavior tests.

### 3.2 Direct Behavior Tests

For a simple immediate effect, call the card's public effect or listener directly and assert the returned `ActionFlow`, resource delta, source card, and non-triggering branches. Invoke listener handlers through `invokeListenerHandlerUnderGuard` or `guardedListener` from `shared/cards/__tests__/listener-purity-guard.ts` rather than `registration.handler(ctx)`, so the direct test proves the handler only reads state and returns copies; `executeCardListener` and every `GameSession` path are guarded automatically by the Vitest setup. Use this layer only when the effect does not pass through payment solving, choices or pending state, delayed phases, cross-player behavior, or a multi-step flow.

### 3.3 Session Tests

Cards involving payment, choices or pending state, delayed effects, cross-player behavior, multi-step flows, or the real action-candidate or payment pipeline must use `GameSession`. Call public commands such as `takeAction()`, `resolveChoice()`, and `commitSelectionChoice()` directly, then assert:

- `state`
- `interaction`
- `state.log`
- `scores`

### 3.4 Frontend Rendering Tests

This is a supporting layer.

Goals:

- Verify that a server state renders correctly.
- Verify button visibility, disabled controls, and log output.

Inputs:

- A fixed `stateUpdate`
- A fixed `GameApiResponse`
- A fixed `SerializedGameState`

### 3.5 E2E Tests

This layer verifies the complete path.

Goals:

- Confirm that the browser UI and real-time multiplayer synchronization path work end to end.
- Confirm that critical interactions can be completed in the real page.

E2E tests should not carry the primary rule assertions. They should focus on whether the action can be performed and whether multiple windows stay synchronized.

## 4. Required Test Information for Every Card

A card test description must explicitly provide the following information.

### 4.1 Basic Information

- `cardId`
- Card name
- Card type: occupation, minor improvement, or an effect attached to a major improvement
- Trigger timing
- Affected player: self, opponent, or any player
- Whether the card creates a waiting interaction
- Whether the card modifies `cardStates`

### 4.2 Test Goals

At minimum, explain:

- The card's positive effect
- The prerequisites under which it triggers
- Cases in which it must not trigger
- Whether it writes a log entry
- Whether it changes a later action, flow, or interaction
- Whether the test uses a static gate, direct behavior test, or Session test, and why

### 4.3 Initial State Setup

For a Session test, state explicitly:

- That the test starts from a new two-player game
- Which player is under test
- The current round
- The player's resources
- Cards the player has already played
- Cards remaining in the player's hand
- Occupied action spaces
- Farmyard state
- Any required initial `cardStates`

Choose the fixture before constructing the Session (§5.2). A constructor can already produce an opening interaction, so replacing hands after construction is too late to isolate a work-phase test. Work fixtures fix every player's hands before loading; irrelevant hands use `['__test_placeholder__']`, since empty hands are re-dealt by `normalizeState`. Opening tests preserve the real deal and explicitly assert the resulting phase and interaction.

### 4.4 Multiple Reactions at the Same Timing

If the card is an action-reaction listener, harvest field-stage card effect, before-end card effect, or extra-turn provider, and another card may trigger at the same timing, cover `trigger-select`:

- Set up at least two cards that can trigger at the same timing.
- Assert that `interaction` offers selectable source cards instead of executing them in played-zone order.
- Select each source card in separate paths and assert the resulting flow, state, log, and recalculated remaining triggers.
- Cover deriving the same `trigger-select` again after `undoStep` or `undoAction`.

## 5. Recommended Backend Entry Points

Drive Session card tests through a backend boundary. Room gameplay uses WebSocket as its primary rule path; HTTP `game-router` is only for development, sandbox, and test support. Session tests call `GameSession` directly.

### 5.1 Three Recommended Drivers

From lightest to heaviest:

1. **Create a `GameSession` with the shared test fixtures (§5.2) and call methods directly.** Use the constructor directly when its construction or snapshot-loading behavior is the subject of the test.
   - It avoids the network and runs fastest.
   - It is the preferred way to assert whether a card triggers and how state changes.
   - See section 5.3 for entry-point methods.
2. **Drive an in-memory room through `server/connection/room-router.ts`.**
   - Use this when testing multiple-window synchronization, `stateUpdate` broadcasts, or reconnects.
   - Reuse the `RoomRegistry`, `Broadcaster`, in-memory persistence, and `dispatch` arrangement in `server/connection/__tests__/room-router.test.ts`.
3. **Playwright E2E in `e2e-tests/*.spec.ts`.**
   - Use this only for the browser UI path or multi-window synchronization. Keep rule assertions out of this layer.

### 5.2 Preparing State

Session public commands and queries bind their own rules. Do not wrap a Session scenario or its whole file in an official-card registry fixture: that hides public entries which fail to bind their own owner. When a test directly queries rules for a Session, wrap only that query in `session.withCtx(() => ...)`. Register injected effects and listeners in that same owner scope.

Standalone direct behavior tests that read official card rules explicitly call `installOfficialCardRegistry()` from `shared/cards/__tests__/card-environment.ts`; this fixture installs a fresh registry before each test and restores the prior environment afterward. In a mixed suite, scope an official registry only around standalone direct queries. Tests for a missing environment must omit the fixture. Never install a process-wide rule default in test setup. `pnpm check:test-rule-environments` rejects blanket registry fixtures in server or Session-mixed tests, non-null registry publication from lifecycle hooks, and explicitly async temporary scopes. This static gate does not prove ownership across arbitrary helper aliases or thenables.

Action execution and query context objects must explicitly include `actionHooks`. Use `session.actionHooks` when exercising that Session, or a test-owned `ActionHookRegistry` for standalone generic rules. Pure calls that do not query generic rules may explicitly use `actionHooks: undefined`; this is not a fallback for rule consumers. The field does not replace the temporary card environment.

Use `server/__tests__/_helpers/session-fixtures.ts` for new Session scenarios. Both helpers default to two players and dispose the Session if their initial assertions fail; the caller disposes successful Sessions after use.

| Helper | Contract |
|---|---|
| `createOpeningSession({ seed, options?, customCards?, expected })` | Runs the real constructor and setup lifecycle. Requires a finite numeric seed or explicit `'random'`. Requires `expected.phase`, `expected.roundPhase`, and `expected.interaction.stateId`; optionally checks waiting request `kind`, `playerIndex`, and exact `hands`. Never clears hands or consumes pending choices. |
| `createWorkSession({ seed?, options?, customCards?, configure? })` | Builds a fresh state, fixes all hands to placeholders, applies `configure(state)`, then loads the Session and rebuilds modifiers. Defaults to seed 42. Asserts `playing` / `work` / `idle` and unchanged configured hands. Rejects empty hands, draft, and parent setup. It skips opening effects and cannot prove first-round lifecycle correctness. |

Numeric seeds also fix the independent ordinary-deck and parent-selection streams to 42 unless explicitly overridden in `options`. Random opening tests must say `seed: 'random'`; production randomness is unchanged. Put target hands, played cards, resources, and other scenario prerequisites in `configure`, before loading:

```ts
const session = createWorkSession({
  configure: state => {
    state.players[0].occupationHand = ['E096_Elder']
    state.players[0].resources.food = 3
  },
}) // playing / work / idle: ready for an ordinary occupation action

const opening = createOpeningSession({
  seed: 12,
  options: { deckIds: ['E'] },
  expected: {
    phase: 'playing', roundPhase: 'preparation',
    interaction: { stateId: 'wait', kind: 'choice', playerIndex: 0 },
  },
}) // Elder's real round-one choice remains pending
```

For startup regressions, drive draft, parent selection, and opening choices through public commands. Check `state` and `interaction` before proceeding; do not call `loadState` to erase an unexpected wait. `assertSessionFixture(session, expected)` can check the contract again after setup commands. See `first-round-start-session.test.ts` and `session-fixtures.test.ts` for complete examples.

Do not assume that `POST /api/game/dev/*` exists. Available setup mechanisms are:

- **`GameSession.loadState(state)`** — load a `SerializedGameState` defined in `shared/session/serialization.ts`.
- **WebSocket commands `devSetResources`, `devSetRound`, `devDrawCard`, `devPlayCard`, and `devCreatePasture`** — adjust a development room as needed.
- **Direct mutation on a GameSession instance**, only in unit and Session tests, never across a network path:
  - Change `session.state.players[i].resources`.
  - Push `CARD_ID` into `session.state.players[i].minorPlayed`.
  - Push `{ playerId, workerId }` into `session.state.actionSpaces[k].takenBy`.

### 5.3 Common GameSession Entry Points

| Method | `interaction.allowedCommands` name | WebSocket `type` | Purpose |
|---|---|---|---|
| `takeAction(playerIndex, spaceId)` | `takeAction` | `action` | Place a worker and trigger the main action |
| `takeAnytimeAction(playerIndex, actionId)` | `takeAnytimeAction` | `anytime` | Trigger an anytime card effect |
| `resolveChoice(playerIndex, value, payload?)` | `resolveChoice` | `choice` | Answer choice, confirm, feed, or animal-reorg while `interaction.stateId === 'wait'` |
| `commitSelectionChoice(playerIndex, payload)` | `commitSelection` | `commitSelection` | Submit fence, room, stable, plow, sow, farm-position, occupation-hand, or resource selections |
| `performRoundEnd()` | — | `roundEnd` | Advance the round; normally triggered by the engine |
| `undoStep()` / `undoAction()` | `undoStep` / `undoAction` | `undoStep` / `undoAction` | Undo one step or the whole action |

> **Protocol names versus engine names:** WebSocket `ClientCommand.type` values do not exactly match `interaction.allowedCommands` strings. See `ARCHITECTURE.md` section 7.2. Use the first column when calling `GameSession` directly and the WebSocket column when driving a room.

### 5.4 WebSocket Commands for Room Tests

Treat the `ClientCommand` definition in `shared/contract/protocol/ws.ts` as authoritative. Common commands:

- `createRoom` / `joinRoom` / `dissolveRoom`
- `getState`
- `action` / `choice` / `anytime`
- `roundEnd`
- `commitSelection`
- `undoStep` / `undoAction`
- `newGame` / `loadGame`
- `devSetResources` / `devSetRound` / `devDrawCard` / `devPlayCard` / `devCreatePasture`

For `ServerEvent`, card rule assertions primarily inspect `stateUpdate.payload`, which contains `state`, `interaction`, and `scores`; logs are in `state.log`. Other handshake events are outside the scope of card rule assertions.

## 6. Fields to Assert After Each Step

Assert the following groups after every critical interaction.

### 6.1 Player State

- `state.players[n].resources`
- `state.players[n].minorPlayed` / `occupationPlayed` / `improvements`
- `getPlayedCardKeys(state.players[n])`, which aggregates those three zones
- `state.players[n].cardStates[CARD_ID]?.{ flagged, counters, extraData, stack, ... }`
- `state.players[n].workers`, where each Worker identity slot has `id`, `isActive`, and `isNewborn`
- `familySize(player)` / `workersAvailable(state, player)` / `workersAtHome(state, player)` from `shared/domain/player.ts`. These are helpers, not fields. Reading `player.workers` directly returns every slot, including supply slots; use the helpers for game-level family size and workers at home.
- `state.players[n].fields` / `pastures` / `stableTiles` / `roomTiles`
- `state.players[n].fenceSegments`, an array of `FenceSegment`
- `getFenceCount(player)` / `getPalisadeCount(player)`
- `countFields(player)` / `countOccupations(player)`, which aggregate owned and card-provided virtual identities for prerequisites
- `countPeopleOnSpace(state, spaceId)` from `shared/cards/helpers/space-occupancy.ts`, used by cards such as A25

### 6.2 Global State

- `state.currentPlayerIndex`
- `state.round`
- `state.gameOver`
- `state.availableMajorImprovements`
- `state.actionSpaces[*].takenBy`, which is a `WorkerRef[]` containing `{ playerId, workerId }`, not player IDs alone
- `state.actionSpaces[*].resources`
- `state.actionSpaces[*].players`, the player-count filter used by `createActionSpaces(playerCount?)`

### 6.3 Interaction State

`InteractionState` is the frontend's interaction authority:

- `interaction.stateId`: `idle`, `wait`, or `gameover`
- `interaction.playerIndex` for `wait`: the player who must respond
- `interaction.sourceCard` for `wait`: the source card ID
- `interaction.request.kind` for `wait`: `choice`, `farm-select`, `selection`, `animal-reorg`, `feed`, `confirm-next-player`, `confirm-player-switch`, or another concrete request
- `interaction.allowedCommands`: the allowlist of engine command names available to the current player
- `interaction.request.options` in choice mode
- `interaction.request.farm` in farm-select mode: `farmType` plus its payload schema
- `interaction.request.selection` in selection mode: selection type and candidates
- `interaction.promptKey` / `promptParams`: i18n key and parameters

### 6.4 Logs and Scores

- `log[0].key`
- `log[0].params`
- Whether the expected log was added, without mistaking a different listener's entry for the target
- `resp.scores`, or `stateUpdate.payload.scores` on the WebSocket path

## 7. Card Test Description Template

Every card test description should follow this structure.

---

## Card Test Description

### A. Card Information

- `cardId`: `CARD_ID`
- Name: `CARD_NAME`
- Type: occupation, minor improvement, or an effect attached to a major improvement
- Trigger timing: `TRIGGER_TIMING`, as a hook phase or listener `actions` plus `phases`
- Scope: self, opponent, or any player, matching the `registerCardListener` scope
- Waiting interaction: yes or no; if yes, name `interaction.request.kind`
- Writes `cardStates`: yes or no; if yes, list the `flagged`, `counters`, `extraData`, or `stack` keys
- Declares `handHooks`: yes or no; list hooks that trigger from hand, currently used only by E96 Elder
- Must propagate `sourceCard`: yes or no; card-triggered choice, farm-select, and selection interactions should carry it

### B. Test Goals

- Verify `EXPECTED_PRIMARY_EFFECT`.
- Verify `EXPECTED_NEGATIVE_CASE`.
- Verify `EXPECTED_LOG_BEHAVIOR`.
- Verify `EXPECTED_PENDING_BEHAVIOR`.

### C. Initial State Setup

#### C.1 Start the Game

1. Choose `createOpeningSession` for real startup or `createWorkSession` for a prepared work scenario (§5.2). Both default to two players; pass `options: { playerCount }` for three or four.
2. State the expected phase, interaction, hands, and player count. Configure work prerequisites before loading; preserve and resolve real startup choices in opening tests.

#### C.2 Select the Current Player or Advance to the Target Phase

1. Set `state.currentPlayerIndex = X`, or consume unrelated players with `takeAction`.
2. To jump to a round, set `state.round = R` and call `performRoundEnd()` if needed to align the phase.

#### C.3 Set Resources

Mutate `state.players[X].resources` directly:

```ts
state.players[0].resources = {
  ...state.players[0].resources,
  food: 0,
}
```

On the WebSocket path, send `devSetResources`.

#### C.4 Set Cards

- In a Session test, push `CARD_ID` into `state.players[X].minorPlayed`, `occupationPlayed`, or `improvements`.
- To trigger `onBuy`, use `takeAction` and the real purchase path.
- On the WebSocket path, use `devPlayCard` or `devDrawCard`.

#### C.5 Set the Board, Action Spaces, and Special Preconditions

Add only what the card needs:

- Occupy an action space with `state.actionSpaces[k].takenBy.push({ playerId: state.players[X].id, workerId: state.players[X].workers[i].id })`.
- Set pastures, fields, stables, or rooms by mutating `pastures`, `fields`, `stableTiles`, or `roomTiles`, or use `commitSelectionChoice` to exercise the real path.
- Preload `cardStates` with `state.players[X].cardStates[CARD_ID] = { flagged: true, counters: {...}, extraData: {...} }`.
- Set the round or phase with `state.round = R` and `performRoundEnd()`.

#### C.6 Reading Global `completedFeedingPhases` in Tests

`state.completedFeedingPhases` is the global completed-harvest count. Cards such as A148 Woolgrower and B086 Truffle Searcher use it for effects based on completed feeding phases plus one. A Session test does not need to run a complete harvest; override the field during setup:

```ts
const session = createWorkSession({
  seed: SEED,
  configure: state => {
    state.completedFeedingPhases = 3
    state.players[0].occupationPlayed.push('A148_Woolgrower')
  },
})
// onComputeAnimalZones(player, zones, state) now reads cap = 3
```

To test that a real feeding phase increments the count, run the complete harvest through `performRoundEnd()` and subsequent `resolveChoice()` calls, then assert that `session.state.completedFeedingPhases` increases monotonically.

### D. Test Steps

#### D.1 Step 1: Trigger the Main Action

```ts
const resp = session.takeAction(X, 'ACTION_ID')
```

Assert:

- `resp.ok === true`, or `false` plus `resp.error` for a negative case
- `resp.state.players[X].resources`
- `resp.state.players[X].cardStates[CARD_ID]`
- `resp.state.actionSpaces[*].takenBy`
- `resp.interaction`
- `resp.state.log`

#### D.2 Step 2: Submit a Waiting Interaction by Request Kind

First assert `interaction.stateId === 'wait'`, then call the corresponding method for `interaction.request.kind`:

- `choice`: `session.resolveChoice(X, 'CHOICE_VALUE')`
- `animal-reorg`: `session.resolveChoice(X, 'confirm', interaction.request.zones)`
- `feed`: `session.resolveChoice(X, 'confirm', { selections: [...] })`
- `confirm-next-player`: `session.resolveChoice(interaction.request.nextPlayerIndex, 'confirm')`
- `confirm-player-switch`: `session.resolveChoice(interaction.request.toPlayerIndex, 'confirm')`
- `farm-select` / `selection`: `session.commitSelectionChoice(X, payload)`

Assert:

- Whether `interaction.stateId` returns to `idle` or enters another `wait`
- `state.players[X].resources` and `cardStates`
- `state.log`

#### D.3 Step 3: End the Round

Call `performRoundEnd()` when needed. The engine normally invokes it automatically; a test calls it directly mainly to assert an end-of-round hook.

For every step, record:

- Request parameters
- The response `interaction`
- Critical state changes in the response
- New log entries

### E. Required State-Change Assertions

State each expected change explicitly:

- Which resources change for which player
- Which action-space state changes
- Whether a card is added or removed
- How `cardStates[cardId]` changes
- How `interaction` changes
- Which entries are added to `log`

### F. Log Assertions

At minimum, assert:

- Log `key`
- Log `params`
- Whether it contains `cardId`
- Whether it contains the resource change
- Whether any forbidden log entry appears

### G. Negative Tests

Add at least one negative case:

- The card must not trigger when prerequisites are not met.
- State must not change when the wrong player acts.
- An invalid choice must return an error or leave state unchanged.
- An unrelated action must not trigger the card.

### H. Rendering Tests

Keep rendering tests separate from rule tests. Verify:

- Correct buttons, prompts, and logs are displayed.
- The current player is interactive while other players are read-only.
- The appropriate controls appear for a `wait` interaction.

### I. E2E Tests

If the card affects the multiplayer synchronization path, add an E2E test:

1. Join the same room in two windows.
2. Player A triggers the card effect.
3. Player B automatically receives the latest state.
4. Both windows display the same result.

---

## 8. Recommended Assertion Order

Assert each step in this order:

1. `resp.ok`
2. `resp.interaction`
3. `resp.state.currentPlayerIndex`
4. `resp.state.players[targetPlayerIndex]`
5. `resp.state.actionSpaces`
6. `resp.state.log[0]`
7. `resp.scores`

This confirms command success first, then the interaction phase, state changes, and finally supporting outputs such as logs and scores.

## 9. Recommended Test File Split

For each card, consider these test files using current repository naming conventions:

- `shared/cards/__tests__/CARD_ID.test.ts`
  - Direct behavior tests for simple immediate effects. Call public effects or listeners and assert real flows and deltas; do not write definition-existence smoke tests.
- `server/__tests__/CARD_ID-session.test.ts`
  - `GameSession` integration tests for payment, choices or pending state, delayed effects, cross-player behavior, and multi-step flows.
- `e2e-tests/CARD_ID.spec.ts`
  - Playwright tests only when the real UI or multi-window synchronization must be verified, as in `e2e-tests/C22_BasketChair.spec.ts`.

Not every card needs all three layers, but every card must meet these minimums:

- Direct behavior or Session tests cover rule correctness; static gates cover mechanical constraints.
- Rendering or E2E tests cover complex UI interactions.

### 9.1 Audit migration target

Migrate audit scenarios into the existing per-card and shared-mechanism Session tests in batches. Submit each cohesive card or mechanism batch as an independently reviewable PR. Main receives the integrated tests and their required helpers and gates, without first importing the entire numbered audit suite.

Keep a small migration inventory with the source audit commit, each old scenario ID, and its destination test. When an existing test already covers a scenario, identify that test and verify that it retains the scenario's assertions. Preserve distinct rejection, payment, pending, undo, and retry behavior. Delete migrated scenarios and unused helpers from the migration source in the same batch. Test counts alone do not prove coverage.

Keep the remaining audit scenarios in a local migration workspace. For each batch, use the candidate PR's production code and native tests, then add only the unmigrated audit scenarios. Validate that combined source and attach the results to the batch PR. After the batch merges, update to current main before preparing the next batch. Main CI checks files present in that PR and must not depend on an unmerged audit branch. Preserve the original audit evidence outside Git. Track newly confirmed production defects in separate issues.

Repair type errors in the audit tests and the helpers they use before migration. Each batch must type-check all remaining audit tests, all migrated destination files, and their transitive helpers. Main's type-check scope includes the migrated files and their transitive dependencies. Record the actual included files, and replace deleted source paths with their destination paths. Covered test responsibilities must not disappear through exclusions. Unrelated legacy server-test type debt is a separate effort. Connect the shared gate through the existing architecture checks.

Declare additional native regression files that a batch changes in `nativeScope` as `{ file, reason }` entries in the migration inventory. These files join the mapped destinations in both the strict gate and candidate behavior run. Each path must identify an existing test inside the checkout, with no duplicate entries and a nonempty reason. This explicit scope does not create or replace any source-scenario mapping.

Copy observed `GameState` values with `captureStateWithHistory` from `shared/session/history-streams`. `cloneState`, `cloneStateWithHistory`, and `normalizeState` normalize data and can hide differences in returned values; use them only inside an explicit `GameSession` constructor or `loadState` operation. The native gate checks destination files and their actual test helpers for this mistake. Capture undo expectations before the command from the live Session or a pure observation copy. Assert complete rules, scores, returned and live interactions, and the actor before retrying. Represent a confirmed restore difference with explicit expected values for that scenario; do not normalize away fields.

For C131 N3, use the current OA result of vegetable `0` as the regression expectation. Preserve the earlier vegetable `1` comparison in the deferred rule discussion ([#1175](https://github.com/titanxxh/open-agricola/issues/1175), [#1181](https://github.com/titanxxh/open-agricola/issues/1181)). That comparison does not establish an official ruling or require a production change as part of this test migration.

Successful tests retain a short result summary. Save scenario evidence on assertion failure or when an explicit diagnostic run requests it. Separate evidence by run, test file, and scenario, and keep full snapshots outside Git. Verify this policy with an intentional failure in a disposable test and a parallel run that checks for artifact collisions.

Native scenarios can use `createScenarioEvidence(import.meta.url)` in their suite. Register every session with `track(session)` and freeze optional intermediate data with `record(label, value)`. The helper owns disposal: it caches a bounded checkpoint before disposing sessions, then writes it only on failure, including a later teardown failure. Normal passing tests write no full snapshots. `AGRICOLA_TEST_DIAGNOSTIC=1` enables passing diagnostics; `AGRICOLA_TEST_EVIDENCE_DIR` selects a directory outside Git. Evidence is isolated by run, file, scenario, and attempt. File parallelism is supported; concurrent tests in one suite are rejected. Omitted oversized checkpoints are counted in the evidence.

Use `pnpm verify focus` while migrating. Check which Vitest project owns each destination file, since shared-mechanism filenames may belong to fast rather than slow. Complete each batch with the current-source checks required by [CI Checks](operations/ci-checks.md), including `pnpm verify prepush`, the migration type checks, and the combined audit and migrated tests. At completion, remove the independent audit normal/RAW modes and their expected-versus-observed assertion switch. The integrated tests use ordinary assertions and the existing `pnpm test`, `pnpm test:slow`, and `pnpm verify focus` entrypoints, without a separate audit workflow.

## 10. Minimal Example

Replace all placeholders with real values in an actual test description.

```ts
// server/__tests__/CXX_SomeCard-session.test.ts
import { describe, it, expect } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'

describe('CXX_SomeCard', () => {
  it('gives the player 1 additional food after fishing', () => {
    const session = createWorkSession({
      configure: state => {
        state.players[0].resources.wood = 0
        state.players[0].resources.food = 0
        state.players[0].minorPlayed.push('CXX_SomeCard')
      },
    })

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0].resources.food).toBe(EXPECTED_FOOD)
    expect(resp.state.players[0].cardStates.CXX_SomeCard).toBeDefined()
    expect(['idle', 'wait']).toContain(resp.interaction.stateId)
    expect(resp.state.log[0].key).toBe('EXPECTED_LOG_KEY')
  })

  it('does not add the effect when the card has not been played', () => {
    const session = createWorkSession({
      configure: state => { state.players[0].resources.food = 0 },
    })

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0].resources.food).toBe(BASE_FISHING_FOOD)
  })
})
```

## 11. Relationship to the Architecture Document

This template implements the test-layering strategy described in `docs/ARCHITECTURE.md`.

- The architecture document defines testing principles.
- This document defines how to write card test descriptions and cases.

If the two conflict, follow the system-boundary principles in the architecture document and then update this template.
