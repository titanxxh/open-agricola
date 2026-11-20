# `shared/session/`: Session Layer

[English](session.md) | [中文](session_zh.md)

`GameCore` coordinates `GameState`, `EngineStack`, history, phase progression, interaction building, undo and responses. Phase functions in `phases/` are pure helpers, not mixins; all coordination converges in `GameCore`.

## Files

```text
shared/session/
├── session-core.ts        GameCore command entry points
├── serialization.ts       SerializedGameState serialization
├── state-bootstrap.ts     Initial state construction
├── stats.ts               Statistics and logging
└── phases/
    ├── setup.ts
    ├── round.ts
    ├── harvest.ts
    └── draft.ts
```

## GameCore Entry Points

`GameCore` owns `state`, `engineStack`, step history with the action-start snapshot, and the end-game scoring cache. `GameSession` (`server/game/authoritative-session.ts`) is a thin wrapper that builds viewer-filtered or debug payloads; it never executes Workshop code (ADR 0052). Commands exposed to the server:

```text
takeAction(playerIndex, spaceId)
takeSpecialAction(playerIndex, cardId, actionId, payload?)
takeAnytimeAction(playerIndex, actionId)
resolveChoice(playerIndex, value, payload?)
commitSelectionChoice(playerIndex, payload)
resolveOrdinaryCardDrawChoice(playerIndex, choiceId, keepCardId)
performRoundEnd()
loadState(raw)
undoStep() / undoAction()
```

## Read-only farm selection quotes

`quoteFenceSelection(playerIndex, requestKey, payload)` binds a draft to the current Interaction Player and pending fence request. It reuses settlement's geometry-sensitive cost hooks, contribution, season and policy calculation; incomplete geometry can have a quoted cost without becoming a legal submission. Reads preserve state, cursor, history and events.

Room clients use a seat-bound read-only WebSocket query with the current Room version. The transport rejects replies after a newer snapshot; callers also discard a reply when the draft or interaction changes. HTTP sandbox and browser-local workers expose the same query. Quotes do not authorize a commit; the ordinary command still validates and settles the live selection.

Tests: `server/__tests__/fence-selection-quote-session.test.ts`, `server/connection/__tests__/fence-selection-quote.test.ts`.

## Unified SessionResponse

`harvest-requirements.ts` projects the next harvest's food and optional fuel demand through settlement's feeding and heating queries. Pending or active harvest skips have zero demand. It keeps current family, house and played-card facts, ages existing newborns when the harvest falls in a later round, and advances only a detached season value. Serialization publishes this read-only display field for every viewer and strips it on recovery. It neither predicts future actions nor advances the engine. Coverage: `server/game/__tests__/harvest-requirements.test.ts`.

```ts
type SessionResponse = {
  ok: boolean
  state: GameState
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
}
```

- Session tests assert this structure directly; WebSocket paths serialize it through `GameSession.buildSyncPayload()` and filter it per viewer.
- `waiting-seats.ts` derives Waiting Seats for live `sync-payload.ts` and committed lobby summaries. Draft includes occupied seats with a current packet requiring a choice; parent selection includes unsubmitted seats; ordinary play uses the top engine-frame owner, including confirmation frames, falling back to the rotation player. This projection is independent of the Interaction Player. Waiting rooms, solo hand selection and completed games have none. Tests: `shared/session/__tests__/waiting-seats.test.ts`, `server/__tests__/lobby-my-rooms.test.ts`, `server/game/__tests__/authoritative-session-sync-payload.test.ts`.
- Every mutating command crosses one settlement boundary ([ADR 0015](../adr/0015-provisional-cross-player-continuation-resolution.md)). Input Rejection restores the complete command checkpoint, including history and action-start metadata; accepted mandatory blocking keeps its effects. `ok:false` or `recoverable:true` alone never classifies a rejection. A rule-valid guard-breaking command keeps its durable provisional restoration and failure memory; an invalid input inside a guarded scope gains neither.
- Failure memory compares rule state without restoration/completion bookkeeping (`continuation.restored`, `anytime.completed`). Completion reactions retain their normal state changes and domain facts, which can reopen a failed command; completing a no-op anytime flow alone cannot.

Tests: `server/__tests__/{authoritative-command-settlement,rejected-pending-input}.test.ts`.

Native `ActionDefinition.projectInteractionRequest` and the card projection hook refresh pending requests from current authoritative state without executing effects. Native projection receives the saved params and action space and can update the prompt alongside the request. This keeps affordability current after an existing legal anytime exchange and lets restored construction replace obsolete unpaid quotes without replaying effects. Tests: `server/__tests__/fixed-room-prices-recovery.test.ts`. Solo Moor preparation uses the native `onMoorSoloPreparation` continuation before round-start hooks; choice annotations and the complete engine cursor survive Session restoration. Tests: `server/__tests__/standard-solo-moor-session.test.ts`.

## Rotation, extra turns and supply people

Undo history distinguishes snapshots captured after disclosure from boundaries reached during an action or player handoff. An entry marked `undoBoundary` with either `actionStart` or `postObservation` already contains the disclosed information: step undo may restore it, then re-arms `pendingUndoBoundary` to protect older history. Anytime activation records `postObservation` when it consumes a pending disclosure boundary, without opening a Turn or changing the whole-action snapshot. Later boundaries still prevent undoing the older action. The optional marker survives private-cursor recovery; retained entries without it keep their existing conservative boundary behavior. Tests: `server/__tests__/{pending-undo-boundary,standard-solo-moor-session}.test.ts`.

A standard solo game has one actual participant. New-game resource initialization gives that player no food; common action definitions admit one player and use the two-player base board, with Forest replenishing two wood. Participant count stays one for dealing, rule queries and settlement. Ordinary actions keep the existing confirmation and undo boundary, including the last placement before returning home or harvesting. Tests: `server/__tests__/standard-solo-core-session.test.ts`.

**Extra turns** ([ADR 0001](../adr/0001-a92-adoptive-pull-model-extra-turn-hook.md), [ADR 0008](../adr/0008-node-parallel-reaction-dispatch.md)):

- `contributeExtraTurn?: (state, player) => ActionFlow | void` is a `CardEffect` hook consumed explicitly by rotation in `shared/session/phases/round.ts`, never by `runCardEffectHook`.
- `collectExtraTurnContributions()` is the single source; `hasPendingExtraTurn()` checks it and `collectExtraTurnFlow()` builds the interaction. It gathers the card providers and every provider registered through `registerExtraTurnProvider()` (Guests, below). Each contribution carries its counting key, whether it may be taken while the owner still has people to place, and the leaf offered when it is one of several choices. Three gates treat a pending extra turn as eligibility: `nextSeatedPlayerIdx`, `roundWorkComplete` and the rotation skip loop.
- `startPendingExtraTurnIfAny(core)` is the only injection path, shared by work-phase entry, confirm-next-player rotation, state loading, undo restoration and the end of a flow outside any turn (an anytime action from an idle work turn), and injects only into an empty stack at the current seat. Its history entry is marked `turnOffer`: restoring it only brings the offer back, so a step undo from an untouched offer undoes the step before it, never across an undo boundary. A provider with `extraTurnBeforeWorkers: true` appears alongside ordinary placement and legal Moor special actions; otherwise providers run after ordinary workers are exhausted. A supply provider can be declined only once ordinary workers are exhausted, and choosing ordinary placement keeps later opportunities unless the card requires the first turn, which it consumes in `onEndTurn`. Pending ordinary-card draws defer injection.
- A repeatable provider may define `countExtraTurns`. Skips and forced consumption count per contribution key (a card ID or a Guest ID) in `PlayerState` fields, and `countPendingExtraTurns()` reuses provider aggregation instead of a player-level counter; a non-interactive fallback consumes one source in stable card order only when automatic progression requires it.
- `onBeforePlayerTurn` returning `{ skipTurn: true }` makes rotation pass the player before their turn starts.
- Snake Opening (ignored for a single seat) gives every player 3 starting food. In round 1, `nextWorkRotationIdx()` reverses the work rotation the first time it would wrap past the Round Work Order start, emits `snakeOpening.reversed` and stays reversed for that work phase; the backward walk starts at the seat that just acted, so that seat is considered again first; other orderings use the forward helpers.

**Supply people:**

- Supply placements use `place-farmer` with `actionContext.workerSource: { kind: 'supply', disposition, workerId? }`. Execution locks one finite worker ID before showing targets; submission, events, linked occupancy, movement and undo keep it. A card-driven placement records its person-action identity in the current Turn Scope.
- `inactiveWorkersInSupply()` excludes reservations, pending placements, temporary people and removed tokens; `availableWorkers()` includes a recalled temporary person, while family size, housing, feeding and scoring use permanent members.
- `returnSupplyWorkers()` runs after every `onBeforeReturnHome` and before `onStartReturnHome`, removing every location of the exact ID and applying its disposition; recalled or moved people keep theirs, and reservations without a due return round survive returning home. Before that, `recordReturnHomePlacements()` captures final positions in `__roundPlacement__`; return-home effects read `getReturnHomePlacements()` or `getReturningPersonPlacements()` (which excludes synthetic blocks and removed people), never live occupancy.
- A reservation is distinct from a placement opportunity; the reserving card releases it at its declared timing (for example, in the target StartOfTurn tree). Supply opportunities use ordinary current-step admission: an accepted use with no legal target blocks until explicit undo, with no future-target preflight or refund.
- When extra housing expires, its capacity clears first; insufficient housing permanently removes only the first active person in stable family order (`removedFromSupply`, references cleared, `worker.returned` with `to=removed`).

Tests: `server/__tests__/{supply-workers-session,snake-opening-session}.test.ts`.

**Guests** ([ADR 0050](../adr/0050-rules-code-does-not-assume-one-card-edition.md)):

- A Guest is a `GuestRecord` in `player.guests` (`shared/domain/guests.ts`): `id` (`guest:<n>`, never a worker slot), `sourceCardId`, `round`, optional `where` and `dispatched`. Family size, the Family Token Limit, housing, feeding and scoring read `workers` only. The record belongs to the player: nothing asks whether its source card is still in play, and no rule reads the game's Card Edition.
- `shared/cards/helpers/guest-flow.ts` provides the native Guest flows. `grantGuestLeaf()` assigns a round and placement scope. `grantImmediateGuestLeaf()` grants a Guest that is placed in the same flow, under ordinary placement rules, or voided on decline or when no target is legal. A Guest has no timing of its own: a card whose Guest comes at another moment places it from that moment's hook, through `grantImmediateGuestLeaf()` or the timed-rule operation `guest-placement` (for example `onAllWorkersPlaced`, or `contributeExtraTurn` through `timedExtraTurnResolution()`). The operation places one Guest, or as many as the source card's `countFact` holds, so a card bought twice before its moment keeps both Guests.
- `shared/actions/guest-turns.ts` offers each Guest of the round with a legal space on any of its owner's work turns, next to ordinary placement. With no family member left, the owner may decline and void the Guest. A card whose extra turn places a Guest declares `extraTurnGuest: { where }`, and its contribution is marked `guest`. Forced consumption (`consumePendingExtraTurns()`) leaves every Guest opportunity. Card text about people left to place, the last person or all people placed reads `peopleLeftToPlace()`: family members at home plus granted Guests and Guest extra turns a legal space awaits (`hasPendingGuestPlacement()` asks only for the latter). It collects Guest opportunities without evaluating other extra turns, so a card's own extra turn can ask it.
- `state.workEndWindowRound` marks the round whose `onAllWorkersPlaced` window has begun. No work turn follows it, so a Guest granted for the current round from then on is placed at once, or declined and voided.
- Dispatch is `place-farmer` with `workerSource: { kind: 'guest', guestId }`. `shared/actions/helpers/placement-person.ts` resolves it through the same `PlacementPerson` seam as a Supply Person. The placement occupies the space and advances the Person Placement Order. Dispatched by rotation or by its granting card, the Guest owns the use (`PlacementPerson.ownsUse`): the use and the space's action carry no card source, as on a family member's ordinary turn. A card's "place another person" (`place-farmer` with a source card and no declared person) and `spend-worker` first offer the person when a Guest could go: a family member or each placeable Guest, one candidate going directly. Such a use keeps that card as its source, as a family member's would. `addWorkerRef()` marks the ref `guest: true` wherever the Guest is placed or moved.
- Where a Guest stands is read from the board, as for family members. A Guest is dispatched once: one that an effect recalls home waits out the round and leaves at return home.
- Return home clears Guest refs with the other spaces and leaves them out of `worker.returned`. `returnGuests()` then drops every record whose round has come and reports the ones never dispatched as `guest.voided`. Public Guest grants, placements and voids stay visible if the source card passes into a hidden hand.

Tests: `server/__tests__/{guest-mechanism-session,classic-animal-farm-session,immediate-guest-cards-session}.test.ts`, `shared/domain/__tests__/guests.test.ts`. A classic Guest card with revised cards in one game: `server/__tests__/guest-mixed-edition-session.test.ts`.

## Turn Scope and Action-Execution Scope

Rotation opportunity, Turn Scope and action-execution scope are separate lifetimes. "On your turn" and "in the same turn" read the Turn Scope; "what was actually built / plowed / sown" reads the current action's committed receipt.

| Rule situation | Rotation opportunity | Turn Scope | Action-execution scope |
|---|---|---|---|
| Ordinary placement or a Moor special action chosen by rotation | Consume the current opportunity | Open a new scope | One per complete Rule Action |
| A contributed Extra Turn | Open an additional opportunity | Open a new scope | One per complete Rule Action |
| A worker move through `move-farmer-to-space` (each moved worker) | No new opportunity | Open a new scope per moved worker | One per complete Rule Action |
| An immediate Rule Action that stays part of the current Turn | No new opportunity | Inherit the current scope | Open a new scope |
| A phase or anytime Rule Action that is not a Turn | No new opportunity | None | Open a new scope |
| A raw gain, payment, choice or listener activation | No new opportunity | Inherit if one exists | Stay in the surrounding scope |

- A Turn Scope begins before its placement, Moor special action or card-driven space use and lasts through every Rule Action, trailing effect, required reorganization and end-of-turn hook of that Turn; then its active snapshot clears. An explicit after-turn activation retains only the captured identity without reopening the scope or snapshot. A moved worker's Turn passes the ordinary person-action trigger to those hooks and closes before the next worker is chosen.
- `recordActionSnapshot()` opens typed `turnConstruction` facts, cleared by `endTurnScope()`. Successful farm commits record distinct built stable identities, the last constructed room material and ordinary fence construction. These facts survive returns, renovation, serialization and undo within the scope; they do not infer construction from net layout changes. Card helpers distinguish a boolean stable-built condition from a distinct-piece threshold.
- Executing an "on your turn" effect requires the owner's active scope; ordinary-placement admission explicitly supplies a read-only `turnScopeProjection` for the scope about to open. Child doability checks inherit it; real execution and current-flow queries do not infer it from the rotation seat.
- Multiple Rule Actions in one Turn share the Turn Scope and use separate action scopes. Per-action construction counts use the host receipt.
- Anytime acceptance captures an active Turn token, the just-ended token only in the original player's handoff window, or an explicit before-turn/outside-turn affiliation. An idle next player never inherits `lastToken`; before-turn qualification waits for their next real Turn end. Descendants inherit the frozen affiliation, and per-Turn consumers use it rather than guessing from later state.
- Same-person `jumpLeaf` relocations and worker-less `viaCardJump` uses stay in the surrounding Turn Scope, if any; only `move-farmer-to-space` wraps each move in `turn-scope` begin / end.
- `actionContext.trueAction` only says whether an effect counts as taking its named action for listeners; it creates no Turn and no action scope.
- **Person Placement Order** counts normal person placements in the Work Placement Chronology: moving the same worker does not advance it; normally placing a temporary or recalled person does. `isCurrentActionSecondPersonPlacement()` prefers the current context's `placedWorkerId`.
- `recordRoundPlacement()` returns a transient `PersonUseReceipt` with the actual worker ID and ordinal from that chronology; relocations return no receipt. Ordinary placement freezes it in the serializable action frame, and granted placements retain it in their result until the existing whole-space `place-farmer.after` continuation. A card-only person use emits `worker.useCompleted` at its successful mutation, so its reactions finish before later reward siblings. Each boundary keeps its own completion timing without a persistent use counter. Tests: `server/__tests__/person-use-completion-session.test.ts`.

Tests: `server/__tests__/{person-placement-order-session,move-farmer-before-placement-session}.test.ts`.

## Player Feeding Settlement

Heating previews use `computeHeatingRequirement()` with `discountTiming: 'upcoming-harvest'`; settlement keeps its existing default. A card's pure `computeHarvestHeatingRoomDiscount` query shares its field-phase calculation. The captured discount and `heatingRoomDiscountRound` preserve that harvest's value after animals change; legacy feeding/breeding snapshots retain their stored discount. This native query is outside the Workshop hook allowlist. Coverage: `server/__tests__/harvest-heating-discount-session.test.ts`.

`shared/actions/helpers/harvest-feeding-requirement.ts` owns the feeding requirement: adults require three food with one actual participant and two otherwise; newborns require one. Existing card modifiers apply to that base before the result is offered or settled. Tests: `shared/actions/helpers/__tests__/harvest-feeding-requirement.test.ts` and `server/__tests__/standard-solo-core-session.test.ts`.

`computeHarvestFeedingOrderPriority()` sorts only the feeding queue, with higher values later and ties in normal Harvest player order. The queue is frozen after feeding stage hooks and persists through pending/recovery; field and breeding order are unchanged. Tests: `server/__tests__/classic-slaughterhouse-session.test.ts`.

`handleFeedResolved()` resolves the offered and live recipe catalogs and validates the complete batch before replacing its pending frame with an ordinary Exchange flow. Its private `harvestSettlementResume` stores remaining demand, prepaid food, conversion costs and the player queue. Every batch reaction and required animal reorganization completes before remaining food payment, begging and heating. Snapshot recovery and undo restore that continuation with the engine cursor, so completed exchange and prepaid food never replay.

`startHeatingOrContinue()` settles each participating player after their feeding continuation. `computeHeatingRequirementBeforeSeason()` in `shared/moor/heating.ts` is the pure requirement query that retains house and active card discounts and caps; the ordinary query then applies the season. A summer waiver with a positive normal requirement emits the existing `harvest.heated` fact without a payment interaction. It reads the player's current card state at this seam and never changes the season to reconstruct a hypothetical payment. Tests: `server/__tests__/season-heating-log-session.test.ts`.

If a legal anytime action remains after a batch, a new feed pending keeps the same continuation. An empty submission closes that opportunity; another batch adds conversion costs without repaying prepaid food. With no available anytime action, settlement continues automatically. This lets reaction rewards fund a new batch and card actions complete before the remaining food is paid.

Tests: `server/__tests__/{exchange-batch-session,harvest-session,harvest-feed-conversion-listener-session}.test.ts`.

`handleHeatingResolved()` uses the same validation of offered and live catalogs and Exchange batch executor as feeding. The typed `harvestSettlementResume` retains the selected fuel payment and converted wood through reactions and animal reorganization; `finishHeatingSettlement()` then applies payment and sickness once. `shared/domain/heating-payment.ts` projects server-quoted requirements and payment bounds for both settlement and the Exchange Center. Wood conversion credits fuel through an ordinary exchange before heating spends it. Tests: `server/__tests__/heating-exchange-session.test.ts`.

## Card Edition and the deal

`state-bootstrap.ts` deals ordinary cards by the game's Card Edition ([ADR 0049](../adr/0049-classic-card-edition-behind-a-switch.md)). `InitialStateOptions.cardEdition: 'classic'` with `classicDeckIds` makes a classic game: creation normalizes the decks with `normalizeClassicDeckIds()` and writes `cardEdition` and `classicDeckIds` into `GameState`. Revised games write neither field, and an absent field means revised, so retained games need no migration. `dealHands()` then draws only from the eligible cards of those decks (`getEligibleClassicCardIds()`); revised deck IDs and the community deck never join it, while Workshop cards still do. The plain deal, the draft, fallback decks and the legacy `normalizeState()` rebuild all follow the game's own edition, never the revised A–E default. The fields survive serialization and rehydration unchanged. They serve setup, the deal pool and display only: rules code never reads them and stays correct when cards of both editions are in one game ([ADR 0050](../adr/0050-rules-code-does-not-assume-one-card-edition.md)). Legacy rebuild test: `shared/session/__tests__/classic-legacy-rebuild.test.ts`.

`getClassicDealShortfall(options)` in `classic-deal-pool.ts` is the creation check for a classic game. It needs 7 cards of each type per seat, or one `draftPoolSize` packet per seat in a draft (`classicCardsNeededPerType()` in `shared/contract/card-edition.ts`), and counts eligible classic cards only. A short pool yields a `ClassicPoolShortfall` with code `classic_pool_insufficient`, the needed and eligible counts, and the decks. Admission passes the room's `maxPlayers`. Hands never shrink, and revised cards never fill a gap: a classic `dealHands()` throws `ClassicPoolInsufficientError` with the same shortfall. Tests: `server/__tests__/classic-deal-session.test.ts`.

`card-edition-admission.ts` gates room creation, rematches and HTTP or browser sandbox creation. Admission defaults to `CLASSIC_EDITION_ENABLED` and tests can inject either value. The switch applies to new games. Existing games can load, continue, reconnect and replay with the switch off. Room metadata and opening facts retain the Card Edition and Classic Decks. Workshop stores the author's setup and checks the pool when the sandbox starts. Coverage is in `classic-edition-room.test.ts`, `privacy-http.test.ts`, `workshop-api.test.ts` and `client/local-sandbox/__tests__/local-core.test.ts`.

The Workshop HTTP game uses `POST /api/game/reset-sandbox` to restart the active instance with its accepted setup. A restart checks Card Edition admission and replaces the active game after initialization succeeds. See `http-sandbox-instance.test.ts`.

## Snapshot data and executable-rule recovery

See [ADR 0028](../adr/0028-session-recovery-preserves-authoritative-snapshot-data.md). New-game creation owns initial dealing. Loading or restoring a Session preserves present empty hands, stored card identities, missing optional rule fields, animal assignments and history; it never re-deals, and it rejects invalid required input instead of converting it into a new game. `rehydrateState()` only decodes data; the owning Core then rebuilds known executable definitions and engine cursors without replacing the captured data. Undo, command checkpoints, provisional checkpoints and process recovery share this contract.

Explicit format migrations precede ordinary restoration and preserve the game's meaning. Changes to persisted state or private cursors follow the [retained-game upgrade policy](../HOW_TO_DEPLOY.md#compatibility-of-retained-games), including recovery followed by a real command, publication and reconnect.

For a legacy Classic capture missing its ordinary draw piles, `restoreSessionState()` rebuilds the eligible remainder from its saved seed and chosen decks. Hands, played cards, pending choices and draft packets stay authoritative. Recovery rejects missing piles when a completed draw choice or an oversized draft has discarded unidentified cards. See `server/__tests__/classic-deal-session.test.ts`.

`restoreSessionState()` converts retained global-round drafts through `shared/draft/legacy-draft.ts` before rebuilding rules. Publication and saved lobby summaries share that conversion. Authoritative state uses per-seat inboxes; migrated games' new Replay Frames also retain the fields required by their frozen Viewer. Live redaction removes those aliases. Historical Frames, hashes, cursor history and command receipts are not rewritten. Tests: `server/__tests__/legacy-draft-recovery-session.test.ts`, `server/game/__tests__/room-committer.test.ts`.

The explicit ordinary-pet rule in ADR 0026 is the assignment exception. After restoring its rules or a command checkpoint, the Core reconciles an existing ordinary pet to the legal room without changing animal totals or emitting placement events. Pending animal-reorganization zones are projected again from the restored state.

Acquisition origin stays with the private reorganization continuation, so restoring the current request can rederive reserve-cooking offers from the live rules. A retained continuation without the origin resumes its ordinary reorganization. [ADR 0048](../adr/0048-cook-reserve-animals-during-reorganization.md)

Tests: `server/__tests__/session-recovery-data.test.ts`, `server/__tests__/room-animal-holders-session.test.ts`.

