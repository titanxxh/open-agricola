# `shared/contract/`: Protocol Layer

[English](contract.md) | [中文](contract_zh.md)

This module centralizes the shapes shared by the frontend, backend and sandbox, and contains no rule code. The main frontend bundle may read only `shared/contract/`, `shared/i18n/`, `shared/domain/` and the manifest-backed `client/services/card-meta`.

## Key Files

| File | Contents |
|---|---|
| `contract/types.ts` | `GameState`, `PlayerState`, `ActionSpace`, `Resource`, `InteractionState`, `InteractionRequest`, `ActionDefinition` |
| `contract/workshop.ts` | Frontend/backend protocol for Workshop Design Drafts, Workspaces, and generated candidates |
| `contract/protocol/ws.ts` | `ClientCommand`, `ServerEvent`, `RoomSummary` |
| `contract/protocol/game.ts` | `GameSyncPayload`, `StateUpdateEnvelope`, `StateUpdateCause`, `ActionDetailEffects` |
| `contract/cards.ts` | `CardDefinition`, the public card shape |
| `contract/prompt-keys.ts` | `PromptKey` enum used as the i18n anchor |
| `contract/state-constants.ts` | Action-space and board constants without rule code |
| `session/serialization.ts` | `SerializedGameState`, `serializeState`, and `rehydrateState` |

## GameState: Domain Truth

Selected fields:

```ts
{
  round, currentPlayerIndex, gameOver,
  players: PlayerState[],
  actionSpaces: ActionSpaceState[],   // { id, resources, takenBy }
  log: LogEntry[],
  events: GameEvent[],
  nextEventSeq: number,
  publicEventArchive: PublicEventArchivePacket[],
  nextPublicEventArchivePacketSeq: number,
  roundActionOrder: (string|null)[],
  gameSeed: number | string,          // Explicit Seed | wide seed, never sent to viewers
  availableMajorImprovements: string[],
  futureMeeples, pendingFutureMeeples,
  workPhaseObtainedResources: Record<string, Partial<Resource>>,
  completedFeedingPhases: number,
}
```

- `actionSpaces[*].takenBy` is `WorkerRef[]`. Card-created linked occupancy adds `synthetic: { kind: 'linked-occupancy', sourceCard, linkedWorkerId }`, so cleanup reads semantic metadata instead of another card's ID.
- `spend-worker` puts a Card-held Person on a non-interactive `card-worker:<sourceCard>` holder created by the pure factory in `shared/domain/card-worker-space.ts`. Its WorkerRefs are placement facts until return-home cleanup, even if the source card leaves the played zone; recovery recreates the holder definition from code and never accepts stored callbacks.
- `workPhaseObtainedResources` (cleared after returning home) and `completedFeedingPhases` are shared facts cards read instead of keeping per-card counters.
- Placement facts are aggregates: `farm.animalMoved.newlyPlacedOnFarmyard` counts newly placed reserve animals in physical farmyard zones (a card zone with a `farmPosition` on the owner's farm counts as physical), and `addFarmyardSpaceState(..., eventSink)` emits positive goods additions to a physical field as `resource.moved`; logical card fields stay separate locations.

**Events and logs.**

- `events` is the public structured rule-event stream. Backend rules write `GameEvent`s; mappers derive the text log, notifications, highlights, animations, audit and Replay. `log` is a cache and never a rule source. Only named cache boundaries write it (`appendImmediateEvents()`, `GameCore.flushEngineLog()`); `pnpm run check:direct-session-log` enforces this.
- Every public `GameEvent['type']` appears in `shared/events/event-mapping-policy.ts`, marked mapped, conditionally mapped or intentionally silent per consumer. Adding an event type adds its policy entry, mapper fixtures and documentation. `eventsToLogEntries()` writes no generic fallback rows.
- `buildLogPresentationPlan()` is the single source of Action Log relationships (`rows`, `consumedEvents`, `suppressedEvents`); the client never infers relationships from names, counts or card IDs.
- `EventStore` gives each new event an opaque `occurrenceId`, kept through snapshots, rebasing, cancellation and projection. Derived log rows carry `LogEntry.sourceEvent = { occurrenceId, rowIndex }`; cache matching uses it plus the log key, and older records without these fields keep parameter-count matching.
- Card purchases carry `PaymentInfo.publicPayment` into `card.played.payment` with a `paymentId` shared by the exact `resource.paid` event; a free play carries an explicit empty receipt.
- `publicEventArchive` is append-only metadata: `publicEvents.committed` and `publicEvents.canceled` packets, validated before writing. Rules and listeners never read it. Runtime `publicEventCancellations` are restoration-response metadata only, filtered and remapped per viewer like the archive; reconnect and `getState` never replay them.
- Only `visibility: 'public'` events enter `GameState.events`. `privateEvents` is a per-viewer synchronization layer for private prompts and hand or draft changes; it never enters Replay or rules.

**Seed and viewer projection.** Game Seed is server-private ([ADR 0020](../adr/0020-game-seed-is-server-private-and-unguessable.md)); `shared/utils/rng.ts` owns wide and Explicit Seeds. `filterSerializedStateForPlayer` drops `gameSeed` for every viewer and returns `null` for each Unrevealed Round Card, in `roundActionOrder` and in the `actionId` of goods scheduled on it (a card can reveal one early through the public `action.revealed` event). Live sync, Bug Report evidence and the Replay seat perspective share this projection. Dev-room `dev-viewer` sync keeps round-card order visible but still drops the seed; `debug` is the full state for hotseat rooms and the dev-room unredacted read.

**Persistence shapes.** `SerializedGameState` is the public network and Replay representation; its `engineStack` is always empty. `PersistedSessionSnapshot` stores authoritative `state`, public `frame` and a server-private `sessionCursor` (engine restoration data, history, provisional continuation metadata) that never reaches a viewer. Synchronization versions and connections are not part of `GameState`.

Tests: `shared/events/__tests__/{event-mapping-policy,log-mapper}.test.ts`, `shared/session/__tests__/{serialization-filter,serialization-archive-projection}.test.ts`.

## PlayerState by Responsibility

- Identity: `id`, `name`, `color`
- Economy: `resources`, `familySize`, `workersAvailable`, `rooms`, `houseType`
- Farm: `fields` with multiple `CropStack[]`, `roomTiles`, `stableTiles`, `fenceSegments`, `pastures`, Farmers of the Moor `farmTerrain` with top `kind` and optional `covered`, `farmyardExtensions`, `farmyardSpaceStates`
- Animals: `houseAnimals` (room-position assignments), `stableAnimals`, `newbornCount`
- Played cards: `improvements`, `minorPlayed`, `occupationPlayed`
- Hands: `minorHand`, `occupationHand`
- Persistent effects: `majorEffects`, `activeModifiers`
- Supply tokens: `supplyTokensConsumed` records permanently consumed fence or stable components; helpers calculate the remaining limit
- Card-local state: `cardStates` ([Local state in cardStates](cards.md#local-state-in-cardstates))
- Worker identity: `workers: Worker[]` with five fixed slots `'1'..'5'`; `isActive` / `isNewborn` describe permanent family members, and optional `supplyUse` records a reserved, pending or temporarily placed supply person and its disposition

`PlayerState.fields` stores Farmyard Fields (bottom stack first). Card-facing rules use the Logical Field seam ([Card Fields and the Logical Field seam](cards.md#card-fields-and-the-logical-field-seam)); only geometry and occupancy rules ask for Farmyard Fields.

## ClientCommand

```ts
type ClientCommand = (
  | { type: 'auth'; token }
  | { type: 'createRoom'; maxPlayers?, name?, customCardIds?, enableCommunityDeck?,
      enableParentCards?, draftParents?, enableThroughTheSeasons?,
      enableFarmersOfTheMoor?, allowIncompleteFarmersOfTheMoorMinorDeal?,
      enableSnakeOpening?, draftMode?, draftPoolSize? }
  | { type: 'joinRoom'; roomId; intent?: 'join' | 'resume'; requestedPlayerIndex?; name? }
  | { type: 'dissolveRoom' }
  | { type: 'getState' }
  | { type: 'action'; spaceId }
  | { type: 'choice'; value; payload? }
  | { type: 'anytime'; actionId }
  | { type: 'commitSelection'; playerIndex; payload: {
      cancel?, positions?, cardIds?, resourceCounts?, resourceBatchExchange?,
      edges?, palisadeEdges?, extraWood?, rooms?, stables?, tile?, crops?
    } }
  | { type: 'roundEnd' }
  | { type: 'undoStep' } | { type: 'undoAction' }
  | { type: 'newGame'; seed? } | { type: 'loadGame'; state }
  | { type: 'devSetResources' | 'devSetRound' | 'devDrawCard' | 'devPlayCard' | 'devCreatePasture'; ... }
  | { type: 'draftSubmit'; playerId; pick }
) & { requestId? }
```

- `newGame.seed` is honored only in a dev room; elsewhere it is ignored and a wide seed is drawn. `loadGame` and `dev*` commands are rejected outside a dev room.
- There are no separate `reorg`, `feed`, `nextPlayer` or `confirmPlayerSwitch` commands: every wait shape submits through `choice`, with `payload` determined by `InteractionRequest.kind`.
- `commitSelection` is only for structured targeted selections (farm-position, occupation-hand, resource-quantity, resource-batch-exchange). Occupation-hand selections must be unique subsets within the declared limits, validated before any effect or random observation. Farm-position may use server-validated `validPositionGroups`; positions carrying `sourceCard` / `cardFieldSlot` / `groupKey` count by group and are canonicalized by the backend.
- Game Variant flags (`enableParentCards` / `draftParents`, `enableThroughTheSeasons`, `enableFarmersOfTheMoor`, `enableSnakeOpening`) are Room options persisted across `newGame` and restarts; `draftParents: false` deals each player a parent pair without `parent-selection`.
- `customCardIds` take effect only with `enableCommunityDeck: true` and only for live, approved Workshop cards ([Workshop backend](server.md#workshop-backend)).

## ServerEvent and StateUpdateEnvelope

```ts
type ServerEvent =
  | StateUpdateEnvelope
  | { type: 'error'; error; requestId? }
  | { type: 'authOk'; userId; username }
  | { type: 'roomCreated' | 'gameStarted'
      | 'playerJoined' | 'playerDisconnected' | 'roomDissolved'; ... }
  | { type: 'roomJoined'; roomId; playerIndex; status; players; maxPlayers }
  | { type: 'roomWaiting'; roomId; players; maxPlayers }

type StateUpdateEnvelope = {
  type: 'stateUpdate'
  roomId: string
  version: number
  sync: 'snapshot'
  cause: StateUpdateCause
  requestId?: string
  payload: GameSyncPayload
  emittedAt: number
}

type GameSyncPayload = {
  state: SerializedGameState
  interaction: ClientInteractionState
  privateEvents?: PrivateGameEvent[]
  scores: PlayerScoreSummary[] | null
  pastureCapacities?: Record<string, Record<string, number>>
  historyLength: number
  hasActionStartSnapshot: boolean
  ok: boolean
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
  cardWarnings?: string[]
  customCardDefs?: CustomCardDef[]
}
```

- `stateUpdate`, `roomWaiting`, `gameStarted`, `playerJoined`, `playerDisconnected` and `roomDissolved` are broadcasts; `roomCreated`, `roomJoined`, `authOk` and request errors are unicasts.
- Every broadcast is built per viewer from the connection's `viewerPlayerId`: the target receives real private prompts and `privateEvents`, others receive `private-prompt` redaction. An HTTP sandbox without `X-Viewer-Player` keeps the unfiltered development flow; with it, the same viewer filtering and seat guard apply.
- `cardWarnings` appears only in HTTP debugging and sandbox payloads. HTTP envelopes carry `gameInstanceId`, rotated after a state load; it is neither authorization nor model input.
- Hosted writes carry `commandContext` (scope, stable command ID, Room ID, expected committed version); simultaneous draft and parent inputs share an input-window ID. The router resolves durable receipts before freshness, rejects changed content under the same identity, and persists results with the Room transaction. Receipts hold outcome identifiers and hashes and are private to their actor. `requestId` only correlates one exchange.

## InteractionState: Frontend Rendering Authority

```ts
type InteractionState =
  | { stateId: 'idle';  allowedCommands; anytimeActions }
  | { stateId: 'wait';  allowedCommands; anytimeActions;
      playerIndex; spaceId?; promptKey?; promptParams?; sourceCard?;
      request: InteractionRequest; ...accessor compatibility fields }
  | { stateId: 'gameover'; allowedCommands; anytimeActions; winners?; scores? }
```

`InteractionRequest` is a sum type discriminated by `kind`:

| kind | Payload shape |
|---|---|
| `choice` | `{ options: ActionChoiceOption[], multiSelect?: { valuePrefix, minSelections, maxSelections } }` |
| `farm-select` | `{ farm: { farmType: 'plow'\|'sow'\|'fence'\|'room'\|'stable', selectable*..., maxSelections? }, options? }` |
| `selection` | `{ selection: { selectionType: 'farm-position'\|'occupation-hand', ... } }` |
| `animal-reorg` | `{ zones: InteractionAnimalReorgZone[] }` |
| `feed` | `{ remaining; foodUsed; feedQueue? }` |
| `confirm-next-player` | `{ nextPlayerIndex }` |
| `confirm-player-switch` | `{ fromPlayerIndex; toPlayerIndex }` |
| `card-draft` | `{ mode: 'simultaneous'; round; totalRounds; poolSize; seatOrder; pools; pendingPicks; kept }` |

Frontend buttons use these `InteractionCommand` values from `allowedCommands`:

```text
takeAction | resolveChoice | commitSelection | takeAnytimeAction | undoStep | undoAction
```

- WebSocket `ClientCommand.type` names do not match `InteractionCommand` one to one; the frontend decides what is possible only from `allowedCommands`, and online commands normalize to `choice`, `commitSelection`, `action` and related protocol names.
- `shared/session/interaction-state-adapter.ts` is the server projection seam. `GameCore.buildInteraction()` passes current state, `EngineStack`, anytime, undo and score snapshots, and one `projectPendingRequest(...)`; request payload construction lives behind it. `redactInteractionForViewer` consumes an already derived `InteractionState`.
- Every new interaction exposes its command and options explicitly and is validated by the backend. Improvement choice values are bare `cardId`s; payment options keep the `pay:*` namespace. There are no encoded choice shortcuts or frontend adjudication.
- Native card effects may implement `CardEffect.projectInteractionRequest(state, player, request, actionId)`, a pure query scoped to its own pending action. Session calls it with the effective pending owner to refresh choice availability and quantity limits before presentation, authoritative commands and single-choice advancement. It preserves prompt metadata, accepted decisions, cached random observations and progress, and never reruns execution, payment, drawing or logging.
- `emit-choice` `multiSelect` offers individual candidates with nonempty, comma-free values; the client submits `valuePrefix + values.join(',')`. Generic validation rejects unknown, disabled or duplicate candidates and counts outside the current bounds before any card hook, and structured-prefix admission cannot bypass it. `minSelections: 0` allows an empty subset; a multi-select always needs explicit confirmation.
- A private choice about a card visible in the recipient's hand may set `promptParams.cardId`; non-recipients receive `private-prompt` without it. The frontend never reads `cardStates`.

Tests: `shared/engine/__tests__/pending-validation.test.ts`, `shared/session/__tests__/{interaction-state-adapter,interaction-command-policy}.test.ts`, `server/__tests__/rejected-pending-input.test.ts`.

## ActionChoiceOption and Previews

```ts
type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, unknown>
  sourceCard?: string
  effectPreview?: ResourceExchangePreview | PaymentPreview | TextPreview
  descriptionPreview?: ActionDescription | ActionDescriptionGroup
}
```

Choice Preview derives from shared executable rule plans ([ADR 0024](../adr/0024-choice-previews-use-shared-rule-plans.md)); cards add no presentation callbacks.

- `effectPreview` kinds include `resourceExchange`, `payment`, `text`, `resourceMovement`, `futureSchedule`, `futureOffers`, `actionSpace`, `cardScore` and `fieldContents`; the complete set is the `ChoiceEffectPreview` union in `shared/contract/types.ts`. They are produced by the pure `ActionDefinition.previewEffect`. Future requests share `normalizeFutureSchedule` (target filtering, prefixes, conditions, costs, room type) with execution. `seq(pay, gain[, bonus-vp])` previews aggregate automatically, including handwritten pay and gain leaves.
- `descriptionPreview` recursively describes the flow (`ChoiceDescriptionPreview`): sequence, exclusive and inclusive choices, parallel order, optionality and actor. `Engine.describe()` reads the executable flow without advancing; `Engine.describeFlow()` describes a standalone plan; opaque native actions expose a pure `ActionDefinition.flowFactory` that execution also calls. Base descriptions omit player modifiers and keep every conditional case; deferred quantities keep their formula until due.
- Visible option text comes from `descriptionPreview` and `effectPreview`; `choiceLabelKey` is only for semantic overrides. `special-effect` supplies semantic descriptions from `params.kind`, and display-only synchronization is omitted.
- A preview describes declared effects; it does not promise that future conditions will hold. Consecutive identical future entries combine; others stay visible in order.
- Current interaction choices use the Interaction Player and the authoritative payment solver, including quantity limits and alternative payment sources.
- Farm-cell choices carry `ActionChoiceOption.target` (actor, logical field, positions, Card Field slots) and `targetCard`; the client renders these and submits the opaque value.
- `collectScheduledEffectPreviews()` projects scheduled receipts, offers, timed rules and obligations as `ScheduledEffectPreview` (round, phase, source, description, multiplicity). Grouping changes display only; player filtering removes hidden sources and unrevealed action identity; rehydration strips these projections, and they cross the JSON boundary before joining a snapshot Frame.

Tests: `shared/actions/__tests__/future-schedule-preview.test.ts`, `server/__tests__/anytime-description-session.test.ts`.

## LogEntry

`LogEntry { key, params, playerId? }` carries an i18n key plus parameters, rendered for the active locale. Bootstrap entries may carry stable `playerId` so seat display-name changes refresh by identity.

