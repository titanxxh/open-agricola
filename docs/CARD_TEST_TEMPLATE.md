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

For a simple immediate effect, call the card's public effect or listener directly and assert the returned `ActionFlow`, resource delta, source card, and non-triggering branches. Use this layer only when the effect does not pass through payment solving, choices or pending state, delayed phases, cross-player behavior, or a multi-step flow.

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

Before the first action, every Session test must explicitly fix every player's `minorHand` and `occupationHand`. Use `['__test_placeholder__']` when the hand is irrelevant. Do not use an empty array because `normalizeState` will deal a new hand. Add the target card separately after fixing these background hands.

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

1. **Instantiate `new GameSession(stateOrSeed?, customCards?, initialStateOptions?)` and call methods directly.** This is the common pattern in `server/__tests__/*.test.ts`.
   - It avoids the network and runs fastest.
   - It is the preferred way to assert whether a card triggers and how state changes.
   - See section 5.3 for entry-point methods.
2. **Drive an in-memory room through `server/connection/room-router.ts`.**
   - Use this when testing multiple-window synchronization, `stateUpdate` broadcasts, or reconnects.
   - Reuse the `RoomRegistry`, `Broadcaster`, in-memory persistence, and `dispatch` arrangement in `server/connection/__tests__/room-router.test.ts`.
3. **Playwright E2E in `e2e-tests/*.spec.ts`.**
   - Use this only for the browser UI path or multi-window synchronization. Keep rule assertions out of this layer.

### 5.2 Preparing State

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

1. Create `const session = new GameSession(seed)`. Two players are the default; use `new GameSession(seed, undefined, { playerCount })` for three or four players.
2. Assert `session.state.players.length === expectedPlayerCount`.

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
const session = new GameSession(SEED)
session.state.completedFeedingPhases = 3
session.state.players[0].occupationPlayed.push('A148_Woolgrower')
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

## 10. Minimal Example

Replace all placeholders with real values in an actual test description.

```ts
// server/__tests__/CXX_SomeCard-session.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'

describe('CXX_SomeCard', () => {
  it('gives the player 1 additional food after fishing', () => {
    const session = new GameSession(42)
    const state = session.state
    state.currentPlayerIndex = 0
    state.players[0].resources.wood = 0
    state.players[0].resources.food = 0
    state.players[0].minorPlayed.push('CXX_SomeCard')

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0].resources.food).toBe(EXPECTED_FOOD)
    expect(resp.state.players[0].cardStates.CXX_SomeCard).toBeDefined()
    expect(['idle', 'wait']).toContain(resp.interaction.stateId)
    expect(resp.state.log[0].key).toBe('EXPECTED_LOG_KEY')
  })

  it('does not add the effect when the card has not been played', () => {
    const session = new GameSession(42)
    const state = session.state
    state.currentPlayerIndex = 0
    state.players[0].resources.food = 0

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
