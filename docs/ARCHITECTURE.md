# Open Agricola Architecture

[English](ARCHITECTURE.md) | [中文](ARCHITECTURE_zh.md)

> Canonical module map of the architecture on `main`. Each section states a module's responsibilities, invariants and seams, and points to the entry files, ADRs and tests that hold the details. Card behavior lives in each card's tests; design decisions live in [`docs/adr/`](adr/).

---

## 1. Design Goals and Invariants

The primary path is **WebSocket room gameplay + backend authority + passive frontend rendering**. HTTP serves startup, debugging, operations and test support, plus the versioned Game Context, Replay and Bug Report product APIs.

Violating any invariant below is an architecture bug:

- **Sole backend owner:** `GameSession` in `server/game/authoritative-session.ts` is the only server command entry and owns `GameState`; mutations execute in the `GameCore` and action leaves it drives.
- **Command-driven:** the frontend sends intent. The backend validates, executes, commits state, produces logs, and broadcasts.
- **Weak client:** the frontend renders, collects input, and manages temporary local UI state. It never adjudicates rules and never commits optimistically: game UI changes only after `stateUpdate` arrives.
- **Full snapshots:** every client in a room receives the same `stateUpdate`; the frontend does not apply partial patches.
- **WebSocket game path:** `/ws` receives `ClientCommand` and emits `StateUpdateEnvelope`.
- **`InteractionState` is the only frontend interaction truth:** `stateId` is `idle`, `wait`, or `gameover`; `wait` branches on `request.kind`.
- **One domain implementation:** actions, engine, cards, rounds, harvest, and scoring live in `shared/` and are reused by both frontend and backend.
- **Physical three-layer boundary:** ESLint `architecture/imports` enforces `shared/` ⇄ `server/` ⇄ `client/` as CI errors. There are no circular dependencies.
- **Two client bundles:** `client-app` does not import `shared/{engine,session,actions,cards,custom-code,draft}`; sandbox and Worker permissions are restricted to the exact entries and files in `scripts/architecture-policy.mjs`.
- **The node tree is the only state machine:** `engine.peekPendingEnvelope()` and the pending host derive what execution is waiting for.
- **Flows enter the engine only through its seams**: `EngineStack.push` / `pop` create and leave nested frames, and `Engine.injectBeforeFlows()` inserts hook and anytime flows into the current frame. Never mutate `pending` directly.
- **`ActionFlow` matches the reference's small algebra:** the card DSL exposes only `leaf`, `seq`, `parallel`, `xor`, and `or` plus metadata. Runtime-only nodes do not enter card flows.
- **Listener handlers do not mutate state:** listener, preview, and doability paths build flows or return structured values. Mutation occurs only while an action leaf executes.
- **Card-local closure:** a card is finished inside `shared/cards/{Deck}/{Card}.ts`. Core files such as `shared/actions/effects/pay.ts`, `shared/actions/effects/improvement.ts`, `shared/session/session-core.ts` and `server/game/authoritative-session.ts` do not change for one card. A new hook point requires tests and documentation in the same change.
- **Local `cardStates`:** persistent counters and markers use `player.cardStates[cardId]`; later choices use explicit pending state and continuations.
- **Supply tokens are payment resources:** player supply limits such as fences and stables must not be hard-coded as 15 or 4. Read them through supply-token helpers or the payment-resource pipeline.
- **Durable Room Commit:** a successful command that changes the public Frame or Private Session Cursor, or any response marked `durableTransition`, atomically writes Room snapshot and Replay Step before sending viewer-filtered state.
- **Global Replay Steps:** simultaneous submissions still receive consecutive `stepNo`; automatic settlement belongs to the last triggering input and results do not depend on arrival order.
- **Failures do not spread:** command errors reach only the caller; durable rejections still publish the committed version to peers as error-free snapshots. Persistence failure freezes the same Frame and blocks the Room instead of overwriting or advancing.
- **Thirty-Room limit:** one instance counts ordinary waiting and playing Rooms. Only new creation is rejected; recovery is unaffected.
- **Immutable historical Viewer:** a Room freezes schema and Build. Completed playback uses a credentialless read-only Viewer and never executes historical rules code.
- **Tests default to two players.** Prove rules at the backend boundary, never infer them from the DOM.

---

## 2. System Topology

```text
Browser windows p1 / p2 / p3 / p4
        │
        │ WebSocket /ws            ← primary path
        ▼
server/connection/ws-server.ts
  ├─ connection lifecycle / auth
  ├─ command routing
  └─ StateUpdateEnvelope broadcast
        │
        ▼
server/game/{room.ts, room-registry.ts, lobby.ts}
        │
        ▼
server/game/authoritative-session.ts (GameSession extends GameCore)
  ├─ sole server command entry and GameState owner
  ├─ inherits GameCore, which owns EngineStack
  ├─ undo history / action-start snapshots
  └─ computes InteractionState and scores
        │
        ├─→ shared/session/ (GameCore, phases/)
        ├─→ shared/engine/  (Engine, EngineStack, nodes/)
        ├─→ shared/actions/ (effects/, payment/, hooks)
        ├─→ shared/cards/   (decks A..E + major + community)
        └─→ shared/domain/  (PlayerBoard, farmyard, scoring, ...)
        │
        ▼
server/game/persistence/
  ├─ postgres-adapter.ts (DATABASE_URL)
  └─ memory-adapter.ts   (tests)
```

`server/game-router.ts` retains HTTP `/api/*` endpoints for health checks, room lists, snapshot recovery, test fixtures, development debugging, and sandbox creation.

---

## 3. Three-Layer Directory Structure

```text
shared/        No React; shared by frontend, backend, and sandbox
├── contract/      Protocol shapes: GameState, InteractionState, ClientCommand, StateUpdateEnvelope
├── engine/        Node-tree engine + EngineStack
├── session/       GameCore + phases/ for setup, round, harvest, and draft
├── actions/       Action definitions, effects/, payment/, and hooks
├── cards/         Card Source by decks A/B/C/D/E, major, and community; each card owns meta + impl
├── domain/        Domain aggregates: PlayerBoard, farmyard, pasture, scoring, ...
├── draft/         Simultaneous card selection
├── custom-code/   Custom-card AST validation
├── i18n/          Locale keys
└── utils/         Shared utilities

server/        Node process: HTTP + WebSocket + persistence + custom-code isolation
├── index.ts             Composes HTTP, WebSocket, database, and static assets
├── connection/          WebSocket layer: ws-server, room-router, broadcaster
├── game/                Room, GameSession, Lobby, RoomRegistry
│   └── persistence/     PostgreSQL Room storage and isolated test substitutes
├── game-router.ts       HTTP /api/* routes
├── auth.ts              GitHub OAuth
├── workshop.ts          Workshop and Sandbox backend
├── workshop-pr/         Workshop pull-request integration
├── custom-code/         Isolated execution: compiler, runtime, executor-worker
├── payload-validation.ts  Pure validation; never writes state
└── db.ts                PostgreSQL connection

client/        Browser React UI with two bundles
├── app/                 Top-level routing and pages: GameContainerApi, LobbyPage, ...
├── components/          board/, interaction/, common/, header/
├── contexts/            AuthContext, LocaleContext
├── hooks/               useGameSync, useFarmSelection, ...
├── services/            gameTransport, card-meta, rehydrate, llm/generation
├── sandbox/             Offline hot-seat client in a separate bundle
└── types/, utils/, styles/, assets/, config.ts, main.tsx

e2e-tests/     Playwright browser tests
```

`eslint.config.js` enforces the three layers:

- `client/{app,components,services,hooks,contexts,utils}/**` cannot import `shared/session`, `shared/engine`, Card Source, generated card catalogs, or per-card implementation modules. UI metadata must come from `public/cards-manifest.json` through `client/services/card-meta`.
- Privileged entries are the exact Workshop sandbox entry and isolated local worker listed in `scripts/architecture-policy.mjs`; no directory-wide exemption exists.
- One resolved-import rule checks static imports, re-exports, literal dynamic imports, and require calls without flat-config overrides.
- Every violation is a CI error.

---

## 4. `shared/contract/`: Protocol Layer

This module centralizes the shapes shared by the frontend, backend and sandbox, and contains no rule code. The main frontend bundle may read only `shared/contract/`, `shared/i18n/`, `shared/domain/` and the manifest-backed `client/services/card-meta`.

### 4.1 Key Files

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

### 4.2 GameState: Domain Truth

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

**Seed and viewer projection.** Game Seed is server-private ([ADR 0020](adr/0020-game-seed-is-server-private-and-unguessable.md)); `shared/utils/rng.ts` owns wide and Explicit Seeds. `filterSerializedStateForPlayer` drops `gameSeed` for every viewer and returns `null` for each Unrevealed Round Card, in `roundActionOrder` and in the `actionId` of goods scheduled on it (a card can reveal one early through the public `action.revealed` event). Live sync, Bug Report evidence and the Replay seat perspective share this projection. Dev-room `dev-viewer` sync keeps round-card order visible but still drops the seed; `debug` is the full state for hotseat rooms and the dev-room unredacted read.

**Persistence shapes.** `SerializedGameState` is the public network and Replay representation; its `engineStack` is always empty. `PersistedSessionSnapshot` stores authoritative `state`, public `frame` and a server-private `sessionCursor` (engine restoration data, history, provisional continuation metadata) that never reaches a viewer. Synchronization versions and connections are not part of `GameState`.

Tests: `shared/events/__tests__/{event-mapping-policy,log-mapper}.test.ts`, `shared/session/__tests__/{serialization-filter,serialization-archive-projection}.test.ts`.

### 4.3 PlayerState by Responsibility

- Identity: `id`, `name`, `color`
- Economy: `resources`, `familySize`, `workersAvailable`, `rooms`, `houseType`
- Farm: `fields` with multiple `CropStack[]`, `roomTiles`, `stableTiles`, `fenceSegments`, `pastures`, Farmers of the Moor `farmTerrain` with top `kind` and optional `covered`, `farmyardExtensions`, `farmyardSpaceStates`
- Animals: `houseAnimals` (room-position assignments), `stableAnimals`, `newbornCount`
- Played cards: `improvements`, `minorPlayed`, `occupationPlayed`
- Hands: `minorHand`, `occupationHand`
- Persistent effects: `majorEffects`, `activeModifiers`
- Supply tokens: `supplyTokensConsumed` records permanently consumed fence or stable components; helpers calculate the remaining limit
- Card-local state: `cardStates` (§8.3)
- Worker identity: `workers: Worker[]` with five fixed slots `'1'..'5'`; `isActive` / `isNewborn` describe permanent family members, and optional `supplyUse` records a reserved, pending or temporarily placed supply person and its disposition

`PlayerState.fields` stores Farmyard Fields (bottom stack first). Card-facing rules use the Logical Field seam (§8.5); only geometry and occupancy rules ask for Farmyard Fields.

### 4.4 ClientCommand

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
- `customCardIds` take effect only with `enableCommunityDeck: true` and only for live, approved Workshop cards (§11.6).

### 4.5 ServerEvent and StateUpdateEnvelope

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

### 4.6 InteractionState: Frontend Rendering Authority

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

### 4.7 ActionChoiceOption and Previews

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

Choice Preview derives from shared executable rule plans ([ADR 0024](adr/0024-choice-previews-use-shared-rule-plans.md)); cards add no presentation callbacks.

- `effectPreview` kinds include `resourceExchange`, `payment`, `text`, `resourceMovement`, `futureSchedule`, `futureOffers`, `actionSpace`, `cardScore` and `fieldContents`; the complete set is the `ChoiceEffectPreview` union in `shared/contract/types.ts`. They are produced by the pure `ActionDefinition.previewEffect`. Future requests share `normalizeFutureSchedule` (target filtering, prefixes, conditions, costs, room type) with execution. `seq(pay, gain[, bonus-vp])` previews aggregate automatically, including handwritten pay and gain leaves.
- `descriptionPreview` recursively describes the flow (`ChoiceDescriptionPreview`): sequence, exclusive and inclusive choices, parallel order, optionality and actor. `Engine.describe()` reads the executable flow without advancing; `Engine.describeFlow()` describes a standalone plan; opaque native actions expose a pure `ActionDefinition.flowFactory` that execution also calls. Base descriptions omit player modifiers and keep every conditional case; deferred quantities keep their formula until due.
- Visible option text comes from `descriptionPreview` and `effectPreview`; `choiceLabelKey` is only for semantic overrides. `special-effect` supplies semantic descriptions from `params.kind`, and display-only synchronization is omitted.
- A preview describes declared effects; it does not promise that future conditions will hold. Consecutive identical future entries combine; others stay visible in order.
- Current interaction choices use the Interaction Player and the authoritative payment solver, including quantity limits and alternative payment sources.
- Farm-cell choices carry `ActionChoiceOption.target` (actor, logical field, positions, Card Field slots) and `targetCard`; the client renders these and submits the opaque value.
- `collectScheduledEffectPreviews()` projects scheduled receipts, offers, timed rules and obligations as `ScheduledEffectPreview` (round, phase, source, description, multiplicity). Grouping changes display only; player filtering removes hidden sources and unrevealed action identity; rehydration strips these projections, and they cross the JSON boundary before joining a snapshot Frame.

Tests: `shared/actions/__tests__/future-schedule-preview.test.ts`, `server/__tests__/anytime-description-session.test.ts`.

### 4.8 LogEntry

`LogEntry { key, params, playerId? }` carries an i18n key plus parameters, rendered for the active locale. Bootstrap entries may carry stable `playerId` so seat display-name changes refresh by identity.

---

## 5. `shared/engine/`: Node-Tree Engine

The node tree is the only state machine: the engine cursor determines what input is awaited, and there is no `PendingAction` union.

### 5.1 Files

```text
shared/engine/
├── engine.ts              Engine class
├── engine-stack.ts        EngineStack child-flow frame stack
├── engine-resolve.ts      resolveChoice path
├── engine-proceed.ts      step and progression path
├── dispatcher.ts          Hook and listener dispatch
├── tree.ts                Node-tree construction
├── registry.ts            ActionDefinition registration and lookup
├── log-store.ts           Buffered logs
├── types.ts               EngineContext, EngineFrame, EngineStackCursor
└── nodes/
    ├── base.ts            BaseNode and shared metadata/pending state
    ├── action-node.ts     Atomic action leaf
    ├── sequence-node.ts
    ├── parallel-node.ts
    ├── xor-node.ts
    └── or-node.ts
```

### 5.2 Node Types

- Domain `ActionFlow` follows the reference node algebra and exposes only `leaf`, `seq`, `parallel`, `xor` and `or`. `optional`, `promptKey`, `sourceCard`, `choiceLabel*` and `targetPlayerId` are metadata, not node types; runtime-only nodes never enter card flows.
- The runtime tree has five concrete nodes: `ActionNode`, `SequenceNode`, `ParallelNode`, `XorNode`, `OrNode`. Cross-player ownership, optional state, trigger selection, listener activation and pending state are node metadata, internal leaves, pending envelopes and frame state, never wrapper nodes.
- `targetPlayerId` compiles to `ownerPlayerId` on the target subtree; explicit child owners win. Every dynamic insertion path carries the current effective owner, and cursors persist owners instead of inferring them from `currentPlayerIndex`. `injectBeforeFlows()` drains only nodes owned by the current player and returns others to the Session driver.
- `XorNode` stores `selectedChildId` and drains only that branch; a leaf selected directly by OR/XOR stores `selectedBranchChoice`. When that leaf completes without a request of its own, its trailing reactions receive it as `choice`; a leaf with its own request completes with the submitted value. `ParallelNode(mode='trigger-select')` implements reaction selection (§7.7); `resolveAfterSelection` makes it one-shot.
- Shared metadata: `ownerPlayerId`; `optional` / `optionalActive` / `optionalPromptKey` (XOR and OR keep a direct `__skip__`); `mandatory`, inherited recursively by `afterHostCommit` children and dynamically returned flows, so a later unexecutable leaf returns mandatory-blocked and Session enters undo-only `engine-blocked`; `selectedChildId`; `pending: PendingEnvelope | null`.
- Every request a leaf returns opens a pending envelope whose options come from `interactionRequestChoices()`; completion reactions run only after it is submitted. `InteractionRequest` is a protocol shape, not a node.
- `before` reaction leaves may return `beforeHostContributions` keyed by namespace and source; the engine upserts them into the unstarted host's `actionContext` through `continuationParentHostNodeId`. A contribution without a valid before host fails, and repeating a source replaces its entry. They follow the host through pending, recovery and undo, and nested or independently granted actions do not inherit them.

### 5.3 Engine Public API

`Engine` exposes a small interface to `GameCore`:

- `step(ctx)`: advance to the next unresolved node and stop at pending input.
- `resolveChoice(value, ctx, payload?)`: supply player input and continue.
- `peekPendingEnvelope()`: the current `PendingEnvelope`, or null.
- `peekPendingHost()`: the node hosting that envelope, for `sourceCard`, `actionContext` and owner lookup.
- `injectBeforeFlows(flows, ctx?)`: insert hook flows.
- `snapshot()` / `restore(snapshot)`: serialize and rebuild the tree, including node states, pending envelope, owner, optional and trigger metadata.
- `hasPendingChoiceCompositeAncestor()`: whether execution is inside a branch ancestor, for anytime handling.
- `describe()` / `describeFlow()`: pure descriptions (§4.7).

`GameCore.engineDeps()` and every engine `proceed` share `syncDynamicActionSpaces()`, which registers board spaces whose definitions are missing from the execution directory; cards create spaces through public mechanisms and never touch the Session registry. A missing definition is an internal invariant error that rolls back the authoritative command.

Tests: `shared/engine/__tests__/{engine,engine-flow,tree-selected-branch,restore-regressions,optional-node-context}.test.ts`.

### 5.4 EngineStack

`EngineStack` in `engine-stack.ts` owns `EngineFrame[]`:

```ts
type EngineFrame = {
  engine: Engine
  source: SubFlowReason
  ownerPlayerIndex: number
  spaceId?: string
  stageResume?: StageResume
  reason: SubFlowReason
}
```

- Its API is `push`, `pop`, `current`, `depth`, `peekPendingEnvelope`, `peekPendingHost` and `toCursor`. `push` / `pop` create and leave nested frames (subflows, confirmations, farm selection); hook and anytime flows enter the current frame through `Engine.injectBeforeFlows()`. Nothing mutates `pending` directly.
- `EngineStackCursor` is serialized into `PersistedSessionSnapshot.sessionCursor.engineStackCursor`; public and Replay `SerializedGameState.engineStack` stays empty.
- Undo history stores a detached cursor of the complete stack (every frame, its identity, reason, stage continuation, deferred switch and resolve boundary); `undoStep()` / `undoAction()` rebuild it without advancing.
- `SubFlowKind` is one of `choice`, `animal-reorg`, `confirm-next-player`, `confirm-player-switch`, `feed`, `farm-select`, `selection` or `card-draft`. Synthetic windows such as `post-reap-anytime` appear in both `SubFlowReason` and `PendingSyntheticKind`.

Tests: `shared/engine/__tests__/engine-stack.test.ts`.

---

## 6. `shared/session/`: Session Layer

`GameCore` coordinates `GameState`, `EngineStack`, history, phase progression, interaction building, undo and responses. Phase functions in `phases/` are pure helpers, not mixins; all coordination converges in `GameCore`.

### 6.1 Files

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

### 6.2 GameCore Entry Points

`GameCore` owns `state`, `engineStack`, step history with the action-start snapshot, and the end-game scoring cache. `GameSession` (`server/game/authoritative-session.ts`) is a thin wrapper that injects the isolated custom-card executor and builds viewer-filtered or debug payloads. Commands exposed to the server:

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

### 6.3 Unified SessionResponse

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
- Every mutating command crosses one settlement boundary ([ADR 0015](adr/0015-provisional-cross-player-continuation-resolution.md)). Input Rejection restores the complete command checkpoint, including history and action-start metadata; accepted mandatory blocking keeps its effects. `ok:false` or `recoverable:true` alone never classifies a rejection. A rule-valid guard-breaking command keeps its durable provisional restoration and failure memory; an invalid input inside a guarded scope gains neither.

Tests: `server/__tests__/{authoritative-command-settlement,rejected-pending-input}.test.ts`.

### 6.4 Rotation, extra turns and supply people

**Extra turns** ([ADR 0001](adr/0001-a92-adoptive-pull-model-extra-turn-hook.md), [ADR 0008](adr/0008-node-parallel-reaction-dispatch.md)):

- `contributeExtraTurn?: (state, player) => ActionFlow | void` is a `CardEffect` hook consumed explicitly by rotation in `shared/session/phases/round.ts`, never by `runCardEffectHook`.
- `collectExtraTurnContributions()` is the single source; `hasPendingExtraTurn()` checks it and `collectExtraTurnFlow()` builds the interaction. Three gates treat a pending extra turn as eligibility: `nextSeatedPlayerIdx`, `roundWorkComplete` and the rotation skip loop.
- `startPendingExtraTurnIfAny(core)` is the only injection path, shared by work-phase entry, confirm-next-player rotation, state loading and undo restoration, and injects only into an empty stack at the current seat. A provider with `extraTurnBeforeWorkers: true` appears alongside ordinary placement and legal Moor special actions; otherwise providers run after ordinary workers are exhausted. A supply provider can be declined only once ordinary workers are exhausted, and choosing ordinary placement keeps later opportunities unless the card requires the first turn, which it consumes in `onEndTurn`. Pending ordinary-card draws defer injection.
- A repeatable provider may define `countExtraTurns`. Skips and forced consumption count per source card in `PlayerState` fields, and `countPendingExtraTurns()` reuses provider aggregation instead of a player-level counter; a non-interactive fallback consumes one source in stable card order only when automatic progression requires it.
- `onBeforePlayerTurn` returning `{ skipTurn: true }` makes rotation pass the player before their turn starts.
- Snake Opening (ignored for a single seat) gives every player 3 starting food. In round 1, `nextWorkRotationIdx()` reverses the work rotation the first time it would wrap past the Round Work Order start, emits `snakeOpening.reversed` and stays reversed for that work phase; other orderings use the forward helpers.

**Supply people:**

- Supply placements use `place-farmer` with `actionContext.workerSource: { kind: 'supply', disposition, workerId? }`. Execution locks one finite worker ID before showing targets; submission, events, linked occupancy, movement and undo keep it. A card-driven placement records its person-action identity in the current Turn Scope.
- `inactiveWorkersInSupply()` excludes reservations, pending placements, temporary people and removed tokens; `availableWorkers()` includes a recalled temporary person, while family size, housing, feeding and scoring use permanent members.
- `returnSupplyWorkers()` runs after every `onBeforeReturnHome` and before `onStartReturnHome`, removing every location of the exact ID and applying its disposition; recalled or moved people keep theirs, and reservations without a due return round survive returning home. Before that, `recordReturnHomePlacements()` captures final positions in `__roundPlacement__`; return-home effects read `getReturnHomePlacements()` or `getReturningPersonPlacements()` (which excludes synthetic blocks and removed people), never live occupancy.
- A reservation is distinct from a placement opportunity; the reserving card releases it at its declared timing (for example, in the target StartOfTurn tree). Supply opportunities use ordinary current-step admission: an accepted use with no legal target blocks until explicit undo, with no future-target preflight or refund.
- When extra housing expires, its capacity clears first; insufficient housing permanently removes only the first active person in stable family order (`removedFromSupply`, references cleared, `worker.returned` with `to=removed`).

Tests: `server/__tests__/{supply-workers-session,snake-opening-session}.test.ts`.

### 6.5 Turn Scope and Action-Execution Scope

Rotation opportunity, Turn Scope and action-execution scope are separate lifetimes. "On your turn" and "in the same turn" read the Turn Scope; "what was actually built / plowed / sown" reads the current action's scope or transaction.

| Rule situation | Rotation opportunity | Turn Scope | Action-execution scope |
|---|---|---|---|
| Ordinary placement or a Moor special action chosen by rotation | Consume the current opportunity | Open a new scope | One per complete Rule Action |
| A contributed Extra Turn | Open an additional opportunity | Open a new scope | One per complete Rule Action |
| A worker move through `move-farmer-to-space` (each moved worker) | No new opportunity | Open a new scope per moved worker | One per complete Rule Action |
| An immediate Rule Action that stays part of the current Turn | No new opportunity | Inherit the current scope | Open a new scope |
| A phase or anytime Rule Action that is not a Turn | No new opportunity | None | Open a new scope |
| A raw gain, payment, choice or listener activation | No new opportunity | Inherit if one exists | Stay in the surrounding scope |

- A Turn Scope begins before its placement, Moor special action or card-driven space use and lasts through every Rule Action, trailing effect, required reorganization and end-of-turn hook of that Turn; then it clears, and later processing never observes a completed Turn's identity or start snapshot. A moved worker's Turn passes the ordinary person-action trigger to those hooks and closes before the next worker is chosen.
- Executing an "on your turn" effect requires the owner's active scope; a doability query may project the scope the current rotation player is about to open.
- Multiple Rule Actions in one Turn share the Turn Scope and use separate action scopes. Per-action deltas use the action transaction.
- Same-person `jumpLeaf` relocations and worker-less `viaCardJump` uses stay in the surrounding Turn Scope, if any; only `move-farmer-to-space` wraps each move in `turn-scope` begin / end.
- `actionContext.trueAction` only says whether an effect counts as taking its named action for listeners; it creates no Turn and no action scope.
- **Person Placement Order** counts normal person placements in the Work Placement Chronology: moving the same worker does not advance it; normally placing a temporary or recalled person does. `isCurrentActionSecondPersonPlacement()` prefers the current context's `placedWorkerId`.

Tests: `server/__tests__/{person-placement-order-session,move-farmer-before-placement-session}.test.ts`.

### 6.6 Snapshot data and executable-rule recovery

See [ADR 0028](adr/0028-session-recovery-preserves-authoritative-snapshot-data.md). New-game creation owns initial dealing. Loading or restoring a Session preserves present empty hands, stored card identities, missing optional rule fields, animal assignments and history; it never re-deals, and it rejects invalid required input instead of converting it into a new game. `rehydrateState()` only decodes data; the owning Core then rebuilds known executable definitions and engine cursors without replacing the captured data. Undo, command checkpoints, provisional checkpoints and process recovery share this contract.

Tests: `server/__tests__/session-recovery-data.test.ts`.

---

## 7. `shared/actions/`: Actions and Hooks

This module owns action definitions, the action lifecycle that card hooks and listeners attach to, payment, stage hooks and the farm-type commits. Rules for one card stay in that card's file and reach this module only through the seams below.

### 7.1 Directory

```text
shared/actions/
├── index.ts               actionDefinitionLookup Map; discovers base plus internal actions
├── flow.ts                ActionFlow: leaf, seq, parallel, xor, or, plus optional metadata
├── hooks.ts               Hook registration and dispatch
├── hook-matrix.ts         buildHookMatrix() optimization matrix
├── internal-actions.ts    Internal engine actions such as mark-card-trigger
├── effects/               Base actions, one action per file
│   └── internal/          Internal effects
├── factories/             Action factories
├── helpers/               Shared payment, animal, and farm helpers
├── payment/               PaymentSolver and executors
└── __tests__/
```

### 7.2 `ActionDefinition`

```ts
type ActionDefinition = {
  id: string
  nameKey: string
  descriptionKey?: string
  rulesKey?: string
  roundAvailable?: number
  gainPerRound?: Partial<Resource>
  canBeExecutedByPlayer?(state, player): boolean
  canBeOfferedByPlayer?(state, player): boolean
  originalActionCondition?(context): boolean
  isAlreadySatisfied?(context): boolean
  costPreview?(...): CostPreview
  isDoable?(...): boolean
  isAutomatic?(...): boolean
  execute(state, player, params?): ActionExecutionResult
  resolveChoice?(state, player, value, payload?): ActionExecutionResult
  emitLeafActionDetail?: boolean
  flow?: ActionFlow
  flowFactory?(planningContext): ActionFlow
  getBaseChoiceOptions?(...): ActionChoiceOption[]
  choicePromptKey?: PromptKey
  noChoiceLogKey?: string
}
```

- `descriptionKey` is the printed action text; `rulesKey` is a separate localized supplemental ruling with no effect on legality or execution.
- Hooks are not part of `ActionDefinition`. Generic variant rules register with the current Core's `ActionHookRegistry`; card reactions use Card Listeners.
- `getBaseChoiceOptions` is an opt-in choice pipeline: base options, injected `computeChoiceCandidates`, de-duplication by `value`, `costPreview.canExecute` filtering. Zero candidates fail, one resolves directly, two or more prompt. It is mutually exclusive with the `execute() → choice → computeArgs.extraOptions` path.
- `flowFactory` is a pure, data-only plan used by both execution and descriptions.
- `canBeOfferedByPlayer` separates non-payment eligibility from affordability for explicit optional offers: an eligible but unaffordable offer stays visible with Accept disabled, and eligibility never authorizes execution.
- `originalActionCondition` and `isAlreadySatisfied` are described in §7.5.1–§7.5.2.

Tests: `shared/engine/__tests__/engine-choice-candidates.test.ts`, `shared/actions/effects/__tests__/improvement-offer.test.ts`.

### 7.3 Effects and internal actions

- `shared/actions/index.ts` imports only top-level base effects and `effects/internal/` to build `actionDefinitionLookup`. `scripts/check-effects-file-list.ts` is the single allowlist of top-level effect files, reused by `shared/actions/effects/__tests__/architecture-guard.test.ts`.
- One action per file. An effect file never accumulates logic for several cards: host-action substeps use `internalChildren`, internal effects live in `effects/internal/`, and pure helpers in `shared/actions/helpers/`.
- A listener that needs a state change with no existing leaf gets a reusable internal action, never a mutation inside its handler (§7.7).

Generic internal actions and their contracts:

| Action | Contract |
|---|---|
| `collect` | The only entry for taking goods from an accumulation space, including partial and cross-space takes through `actionContext: { spaceId?, resource?, amount? }`. A card-provided accumulation space declares `gainPerRound` and stores goods in `ActionSpace.resources`. |
| `gain` | Resolves recipients before settlement. A payer-backed gain checks the full transfer before moving anything; events keep the payer as source. Explicit resource parameters are distinguished from an Action Space's configured base gain. |
| `return-to-space` | Returns goods to the space named by `actionContext.targetSpaceId`; payment and the movement event use the same target. |
| `place-farmer-on-space` | Places an additional worker on a fixed target and normally expands that target's flow; `params.executeTarget: false` places the worker without expanding it. `allowOccupied` relaxes only occupancy, never blocking, round availability, executability or worker supply. Cards never write `ActionSpace.takenBy` in a handler. |
| worker-less use and fixed-target jumps | A card may run a full Action Space flow without placing or consuming a person (`place-farmer.actionContext.viaCardJump`), or jump a bound worker to a fixed target (`jumpLeaf`). Query and execution bind the same worker; costs, vetoes, linked blocks and recursion guards still apply. |
| granted rule actions | A card that grants a rule action invokes that action directly; granting an action does not expand the whole Action Space that normally offers it. |
| `pass-minor-card-to-left` | Moves a played minor to the left player's hand, clears its card state and emits public `card.passed` plus a private hand change. Later triggers consume `card.passed`. |
| `individual-food-cost` | An occupation's mandatory individual food cost, separate from the Occupation Cost and PaymentSolver: pays available food, begs for the shortfall, needs explicit confirmation on a shortage, and reads live inventory at preview and settlement. |
| `take-from-card` | Deducts the source card's counters, then delegates inventory credit to `gain`, so Gain reactions observe goods moved off a card. A listener subscribes to one of the two, never both. |
| `special-effect` | The generic mutation dispatcher for listener-returned leaves: counters, flags, infobox, card stacks, supply tokens, farmyard space states and token claims. `claim-farmyard-goods-tokens` claims by source and, optionally, committed coordinates. `countCardUse: false` marks housekeeping that must not count as a card use. |
| `receive` | Settles mature future goods for one player in one transaction; see §7.6. |
| `activate-card` / `activate-card-effect` / `activate-extra-turn` | Activation leaves for listeners, stage effects and extra-turn providers; see §7.6–§7.7. |
| `reap` | Ordinary and private-field harvest; see §7.6. |

- Occupation availability, choice submission and direct or free play share one prerequisite gate. Improvement cost preview and payment use the granting `sourceCard` or physical action-space ID as `actionCardId`.
- Selection follow-ups carry semantic provenance in `actionContext` (for example `extraCropPlacement`); later cards read the marker, never the source card ID.

Tests: `shared/actions/effects/__tests__/{collect,gain,place-farmer-on-space,place-farmer-jump,take-from-card,special-effect,farmyard-goods-claim}.test.ts`, `server/__tests__/empty-accumulation-admission-session.test.ts`.

### 7.4 `payment/`

`PaymentSolver` (`solver.ts`) is the only production entry to payment: affordable solutions, payment choices, choice parsing, execution and the structured receipt, plus cost previews, typed-flat costs, room payment, simple trade side effects and card-cost candidate helpers. `payment/internal/*` is private to the package and its algorithm tests (`shared/actions/payment/internal/__tests__`); `shared/actions/payment/__tests__/import-boundary.test.ts` forbids every other import. External tests use `PaymentSolver` or `shared/actions/payment/__tests__/test-helpers.ts`.

**One `ComplexCost` model.** Construct, renovation, fencing, stables, plow, occupation, minor and major improvement and `pay` leaves all enumerate through `computeAllBuyableCombinations`:

| Field | Meaning |
|---|---|
| `fees` | Fixed per-action fees. A `computeCosts.costs` delta merges into `fees[0]`; negative totals clamp to zero, so a discount never refunds another resource. |
| `unitFee` + `nb` | Per-unit cost times quantity (rooms, renovated rooms, fence segments, stables). |
| `trades` | `from → to` substitutions. `Trade.scope: 'action'` converts the resource pool once per action; `'unit'` runs Candidate Closure on each unit row. `minCost` / `maxCost`, `replaceUpTo` and `groupMin` / `groupMax` bound uses; each unit `TradeUsage` records what it actually replaced. |
| `bonuses` | Per-action discounts or discount choices. `optional` adds the no-bonus branch; `capDiscountAtCost` caps a variable discount at the current fee; `trackChoiceIndex` records `bonusChoiceIndex`; only `choiceAffectsState` exempts a choice from dominance pruning; `conditions` are re-evaluated per quantity. |
| `costResourceRemovals` | Applied removals `{ resource, sourceCard, savedByFee }`. The input is a card's `CostResourceRemovalModifier` (`type: 'remove-resource'`, a `CostModifier`, not a `ComplexCost` key); `applyCostModifiers()` deletes the resource from every fee before enumeration and records it here, so enumeration keeps it removed after later bonuses and attributes the saving. Use it, not a large capped discount, for "no longer needs X". |
| `paymentResourceProviders` | Payment-only virtual resources supplied by a card or a `computeCosts` hook: availability, covered resources, consumption source. They appear under their own key in `resourcesPaid` and never in cost rows or `PlayerState.resources`. |
| `paymentBudget` | Ceiling on final `resourcesPaid`; it supplies nothing and never restricts geometry or unit count. |
| `minimumResourcesPaid` | Floor on final `resourcesPaid`, checked before dominance pruning; admission and the payment child share it. |
| `resourceReserve` | Keeps a minimum total in a resource pool after payment. `PaymentSolver` filters by it, together with a hook's `reserveResources`, after dominance pruning; it filters solutions only. |

**Fixed pipeline order** (a domain rule, not a card precedence): base candidates (`fee`, `fees`, `unitFee`, dynamic `getBaseCosts`) → structural resource removal → Candidate Closure → action-scoped trades → bonuses → card-provided payment resources → cards → affordable solutions → `paymentBudget` / `minimumResourcesPaid` filters → dominance pruning and sorting → `resourceReserve` / `reserveResources` filter.

- **Candidate Closure** ([ADR 0004](adr/0004-candidate-closure-replaces-cost-modifier-ordering.md)): card-purchase and occupation costs normalize into a Cost Candidate List, and every `deriveCardCostCandidate` transform applies to a fixed point followed by Mandatory Saturation. Results are independent of registration order; candidate transforms and `TradeModifier` have no `order` field. Each resources + `originalFeeIndex` group keeps one representative row. A card declares only a single-candidate transform and `cardCostCandidateMandatory`; dynamic base costs come from `CardImpl.getBaseCosts()`. Static consumers read printed candidates through `getPrintedImprovementCostCandidates()`.
- **Two cost paths** ([ADR 0003](adr/0003-card-purchase-compute-card-costs-candidates.md)): major / minor improvement and occupation costs use the candidate pipeline; other actions aggregate `computeCosts` results. Candidate metadata (`sources`, `originalFeeIndex`, Cost Attribution) never enters `PaymentSolution`. Option building (`describePaymentSolution()` / `describePaymentEffectPreview()`) merges `sources` into each option's `sourceCards` before selection; the `PaymentReceipt` keeps them as `candidateSources` next to `costAttribution`.
- **Dominance pruning** runs after resource feasibility and exempts payment-path identity, state-affecting bonus choices and card payment.
- **Cost Attribution**: saved / paid statistics come from attribution, never from a pay leaf's `sourceCard`. Action `computeCosts` declare `costAttribution`; the host writes the clamped before / after delta after real execution.
- **Payment option identity**: values are `<prefix>:<index>~<identity>`. Parsing settles the payment with that identity even if a recomputed list moved it; a vanished payment is a recoverable rejection that keeps the menu.
- **Receipts**: occupation and improvement commits keep the owning host payment's exact resources, bonus sources and returned card; a free play carries an explicit empty receipt.
- **Supply tokens are payment resources**: fences and stables flow through `cost`, the solver, `resourcesPaid` and `resource.paid` like any resource. Paying one increments only `player.supplyTokensConsumed`. Remaining capacity is read through `getOwnOrdinaryFenceBuildLimit()`, `getOwnOrdinaryFenceReserveCount()` or `getAvailableStableSupplyCount()`.
- **Granted cost bonuses**: a granted renovation carries a serializable, sourced `Bonus[]` in its leaf's `actionContext.costBonuses`, merged with `computeCosts` against the live target; no temporary player modifier is installed.
- **Validation**: `validateComplexCost` throws in development and, in production, logs and degrades to no solutions. `validateTradeModifier` (no `minNumRooms` on a unit trade, consistent group bounds) and `validateBonus` throw in every environment. Typed-cost enumeration (a `costType` is set) drops a branch with a negative `resourcesPaid` value; an untyped `ComplexCost` keeps it.
- **Resource commitments** ([ADR 0019](adr/0019-resource-commitments-preserve-unsettled-trades.md)) are checked at the command boundary and are not prepayment or solver reservations.

Tests: `shared/actions/payment/internal/__tests__/{candidate-closure,cost-modifier-permutation-probe,enumerate,cost-modifiers}.test.ts`, `shared/actions/payment/__tests__/{solver,card-purchase}.test.ts`, `shared/actions/effects/__tests__/{improvement-cost-candidates,pay-supply-token,renovation}.test.ts`.

### 7.5 Hook system

- Each `GameCore` owns its `ActionHookRegistry` (`actionHooks`). Dispatch, availability, cost previews and rule helpers receive it explicitly; there is no process-wide default. Context objects declare `actionHooks`, `undefined` only for pure calls with no generic rules. Registries are runtime dependencies rebuilt by each Core, never state or cursor data.
- `CardRegistry` has no process default either: card lookups use a temporary synchronous `withCtx` binding, restored after nested calls and exceptions; a lookup without a bound environment fails. Custom-code adapters strip `actionHooks` before calling untrusted code.

```text
isDoable                 change whether an action is executable
computeReplace           replace an entire action
computeCosts             adjust costs, including fencing and card-purchase discounts
computeArgs              add options to a choice returned by execute()
computeChoiceCandidates  inject candidates into opt-in getBaseChoiceOptions
computeExchanges         inject runtime CardExchange values
before / immediatelyAfter / after
anytime                  register additional anytime actions
```

- `ActionHookContext` is `{ actionHooks, state, player, space, actionId, phase, result?, choice?, doable? }`; during execution `ActionMutationContext.eventSink` records events. `ActionHookResult` (`shared/actions/hooks.ts`) is `{ doable?, actionId?, extraData?, extraOptions?, extraExchanges?, followUpActions?, flow?, costs?, trades?, bonuses?, paymentResourceProviders?, costAttribution?, reserveResources?, sourceCard?, countCardUse?, labelKey?, labelParams?, decline?, alternativeFlow? }`. `extraExchanges` injects runtime exchanges, `countCardUse` controls activation accounting, `labelKey` / `labelParams` label the contribution, and a `computeReplace` result with `decline` + `alternativeFlow` offers that flow as an alternative next to the original action instead of replacing it. A top-level `flow.sourceCard` is copied to child leaves that lack one.
- Card listeners match played cards by default; only an explicit `zones` scans the hand. The match carries `ownerCardId` / `ownerCardZone`. A hand listener stays state-pure, and per-viewer serialization hides everything derived from the hidden card.
- Listener `scope` is `player`, `opponent` or `any`. Matching enumerates by listener ID; trailing nodes group by owner (global, active player, others) and sort stably by play order. Reaction listeners use trigger-select; compute / query listeners aggregate deterministically.

**Events are the source of rule facts.** `EventStore` opens a transaction per public action or internal leaf, commits only on success (failure, cancel, rollback and skip append nothing), resequences against `state.nextEventSeq`, validates visibility, JSON safety, size and known fields, and appends a `publicEvents.committed` packet. `state.log` is a UI cache derived by the event mapper. Listeners read `transactionEvents` / `eventQuery`, never uncommitted global `state.events` or `context.result` for resource facts.

- Farm mutation events (`farm.fieldPlowed`, `farm.roomBuilt`, `farm.stableBuilt`, `farm.fenceBuilt`) carry `newlyUsedTiles`, captured around the mutation before trailing reactions. Fence commits also carry `newlyEnclosedPastureTiles`. Terrain placement and blocking-state mutations emit `farm.spacesUsed`. A scheduled room receipt emits `farm.roomBuilt` too.
- Consumers read these committed facts from the host's captured `actionEvents` through `getActionNewlyUsedTiles()` / `getNewlyEnclosedPastureTiles()`, filtered by player. They never reconstruct a difference from later geometry, keep a before-action cache, or fall back to the wider Turn.
- Printed fence counts and triggers count only ordinary `type='fence'` segments (`hasOrdinaryFenceBuiltEvent()`).
- Animal exchanges deduct through the exchange / trade path so placed animals stay in sync. Per-trade thresholds use `immediatelyAfter.trade-applied` and `extraData.preResources`.

**Trigger frame.** When a host action commits, the engine freezes `transactionEvents`, `actionEvents` and the matched trailing listener set and order before any `afterHostCommitListeners` mutation. Deferred continuations reuse that frame and never rematch. `CardListenerContext.triggerSnapshot` exists only in `immediatelyAfter` / `after` and holds each player's occupation / minor / major / improvement / played lists as of host commit; listeners asking "is this the Nth card" read it, and `check:card-impl-boundaries` rejects live length reads there. Activation does not recheck whether the owner card is still in its zone. The frame serializes with its `activate-card` node. A reaction to a host that returns a flow carries `preservedTransactionEvents` / `preservedActionEvents`, which every later commit extends.

- Cost previews (`previewComputeCosts`) evaluate `computeCosts` without cloning state under the query-purity contract.

Tests: `shared/engine/__tests__/{event-transaction,trigger-snapshot,hook-dispatch,continuation-event-scopes}.test.ts`, `shared/actions/effects/__tests__/farm-action-events.test.ts`, `shared/cards/__tests__/card-listener-zones.test.ts`.

#### 7.5.1 Public `ActionNode` execution order

`computeReplace → before → strict isDoable → computeCosts → execute → immediatelyAfter → after`

1. `computeReplace` runs first, after `actionContext.targetSpaceId` resolves `context.space`. Changing only `actionId` carries through every later phase.
2. Every matching `decline + alternativeFlow` contributes one complete subtree. `buildReplacementChoiceNode()` inserts an ordinary XOR before the original's optional prompt with `requiresExplicitChoice=true`, so even a single replacement waits for the player; the original branch keeps its optionality and no branch's `before` runs while offered. A chosen branch re-enters this pipeline skipping its own producer and every producer guard inherited from enclosing replacements; the original carries `checkedReplaceAction`, which only the dispatcher interprets. `resolvedReplacement` freezes the decision across restore; producer guards reset when placement or movement grants a new opportunity.
3. `before` listeners compile to `activate-card` leaves before the original leaf, in trigger-select per owner. Before-use eligibility is collected once at the actual space use (`collectBeforePlacementFlows`, `collectBeforeActionSpaceUseFlows`); `requiresNewPlacement` excludes worker moves.
4. Strict `isDoable` reads the state after real `before` mutations: base `canBeExecutedByPlayer`, cost preview, hook and listener `isDoable`. If it fails, only an already accepted mandatory continuation may resolve through `isAlreadySatisfied` against facts emitted earlier in the same transaction; the body and trailing listeners then do not run. Option-level listeners also filter occupation hand options, and `reserveResources` reaches the payment leaf.
5. `computeCosts` fills `executionContext.costs`, `costTrades`, `costBonuses` and `paymentResourceProviders`.
6. The body runs (`getBaseChoiceOptions` or `execute()`); `resolveChoice` revalidates doability and costs before continuing.
7. `immediatelyAfter` and `after` run from the frozen trigger frame (§7.5). Internal `activate-card` bypasses this pipeline and hands any returned flow back to the engine.

Composite actions select replacement before expansion and keep a deferred-expansion marker; children then make their own replacement decisions ([ADR 0027](adr/0027-composite-actions-use-existing-replacement-selection.md)). `EngineTree.insertBefore()` / `insertAfter()` preserve the parent OR/XOR selection. Direct `cancel` of a protected atomic action (`plow`, `sow`, `construct`, `stables`, `fence`, `reorganize`, `selection`) is rejected recoverably; optionality comes from `optional` metadata and `__skip__`, reversal from history.

Tests: `server/__tests__/action-replacement-session.test.ts`, `shared/engine/__tests__/engine-pipeline.test.ts`, `shared/actions/__tests__/flow-replacement-admission.test.ts`.

#### 7.5.2 Current-step admission and blocked recovery

Availability and authoritative entry share `GameCore.applyIsDoableCheck()` and the flow admission helpers; normal and card-granted placement share `isPlacementActionDoableInFlowContext()`. See [ADR 0015](adr/0015-provisional-cross-player-continuation-resolution.md).

- An action can start when its current atom is executable or an applicable `before` can start; this does not promise completion. SEQ checks its next step, OR/XOR any branch entry. There is no whole-flow search; payment, animal capacity and fence geometry stay atomic checks.
- Queries never consume resources, activations, events or the private cursor, and use no availability cache.
- `originalActionCondition` is a structural condition of the original branch: an empty accumulation space cannot be reopened by fixed or bonus gains, while explicit replacements stay eligible.
- Card-created Action Spaces use Strict Action Entry by default; standard composite spaces opt in ([ADR 0018](adr/0018-future-schedule-and-authoritative-action-entry.md)).
- The recursion key includes consumed replacement producer IDs, so a same-named alternative may progress while loops without progress stop.
- Accepted roots and mandatory continuations keep their obligation through composite descendants; explicit optional nodes stay skippable before acceptance. An unavailable mandatory node exposes `engine-blocked` and keeps earlier effects until `undoStep` / `undoAction`. Invalid input restores the command checkpoint and keeps the interaction; a stale option of an issued menu is rejected recoverably.
- Before its body, an unavailable mandatory host offers a Continue window only when the legal anytime list is non-empty; Continue rechecks strictly without replaying `before`.

Tests: `server/__tests__/{anytime-admission-session,empty-accumulation-admission-session,moor-admission-deep-session}.test.ts`.

#### 7.5.3 Pay-child invariants

- `pay` is an internal settlement child. The public host action owns business mutation, events and completion. Forbidden shapes: `seq:[pay, apply-*]`, top-level `apply-*` effects, a `PlayerState` payment scratchpad or any cross-action payment slot.
- `beforeHostListeners`, `afterHostCommitListeners` and `afterHostListeners` encode where each host pays. Mandatory payment for renovation, improvement, occupation, construct, fencing and stables settles before trailing effects, so a reaction cannot spend resources still owed to the host.
- Improvement and occupation `onBuy` run in `afterHostCommitListeners`: payment completes, the host commits the card, `onBuy` runs, then trailing reactions. One-time own-play benefits belong in `onBuy`; a played card does not match its own `occupation` / `improvement` trailing reactions, and still counts in the trigger snapshot. Effects "after a card is played" listen to the committed host, not its `pay` child.
- `shared/actions/helpers/improvement-purchase-lifecycle.ts` owns the post-payment commit of purchases (returned card, passing, `card.played` / `card.passed`, hand change). `params.allowedPurchases` restricts every candidate source; `purchaseActionCardId` passes this purchase node's source into `onBuy`; `playedFromHand` is frozen before the hand changes.
- A mandatory `afterHostCommit` continuation, and anything it returns or injects, stays mandatory; an impossible descendant blocks with ordinary undo. `mandatory: true` on a listener propagates even without a trigger menu.
- An `animal-reorg` request hands reorganization to a Session subflow while the host keeps its own reactions: `before` once, then `immediatelyAfter` / `after` once after the subflow.
- `activate-card-effect` reads `paymentInfo` from the internal result map and runs `onBuy` or a stage hook; stage activations carry owner, target and stage metadata.

Tests: `shared/actions/effects/__tests__/pay-child-context.test.ts`, `shared/engine/__tests__/internal-children.test.ts`, `server/__tests__/action-hook-continuations-session.test.ts`.

### 7.6 Stage hooks

```text
Preparation: onBeforeStartOfTurn -> advance round / action.revealed -> onAfterRevealAction -> onPreparation
  -> accumulate -> onRoundStart (StartOfTurn) -> onEndPreparation -> onBeforeWork -> onWorkStart -> work.started
Work:        PlaceFarmer -> atomic actions -> onEndTurn -> allWorkersUsed -> onAllWorkersPlaced
Return home: onBeforeReturnHome -> onStartReturnHome -> onReturnHome
Round end:   onRoundEnd -> onAfterRoundEnd
Harvest in rounds 4/7/9/11/13/14:
  onBeforeHarvest -> harvestPrepWindow -> onStartHarvest
  -> onStartHarvestFieldPhase -> onHarvestFieldPhase -> reap [dispatch 'reap'] -> reap reaction parallel
    -> onAfterReap -> onEndHarvestFieldPhase -> onHarvest
  -> postReapAnytimeWindow -> onStartHarvestFeedingPhase -> onHarvestFeedingPhase
    -> feed -> onEndHarvestFeedingPhase
  -> breed -> onEndHarvest -> onAfterHarvest
Before game end: after round 14 onAfterRoundEnd completes, without opening round-15 preparation,
  onBeforeEndGame -> preScoringWindow -> gameover
```

Stage hooks return `ActionFlow` and run as resumable subflows through `EngineStack`. **Stage Dispatch** ([ADR 0008](adr/0008-node-parallel-reaction-dispatch.md)) is the shared model for preparation windows, StartOfTurn, turn end, Before-Harvest, Harvest field and before-end:

- Each window freezes its player order (clockwise from the Start Player Marker where the rule says so) and, on each player's entry, captures a fixed tree of `activate-card-effect` sources using ownership, hand-enabled hooks and the pure `stageEligibility` query. Discovery never filters by current affordability.
- One source expands directly; several enter `ParallelNode(mode='trigger-select')`. Handlers, payment and mandatory / pass state are recomputed from a live cloned-state preview after each selection. Completed sources never replay; cards played inside a window join only later windows.
- Window context, player order and tree cursor persist in `stageResume`; restoration never rescans zones or rereads a changed marker. Legacy serial stages keep `resumeAfterCardId` for their own index recovery.
- Nested optional branches keep exchange opportunities without weakening a mandatory root. `requiresExplicitChoice` keeps a purchase choice open while a live exchange could fund it.
- At stage completion, unsettled animals nest the existing `reorganize` flow before the frame resumes.
- Private events from stage subflows are held until the outermost response.

Window-specific invariants:

- **Preparation**: `onRoundStart` is StartOfTurn; `onBeforeStartOfTurn` runs before the round increments and receives `nextRound`; reveal context keeps the actual `actionId` / `roundSlot`. Work order (`roundFirstPlayerId`) freezes before StartOfTurn. `startFirstRoundAfterSetup()` is the single fresh-game entry: bootstrap never pre-accumulates and loading a work state never re-prepares.
- **StartOfTurn**: round-start activations, scheduled receipts, payment-gated offers and scheduled actions share one player tree. Mature goods settle in one `receive` per player that keeps each entry's source and does not trigger Gain; `futureMeeple.resolved` commits only after the actual receipt.
- **Future schedules** ([ADR 0018](adr/0018-future-schedule-and-authoritative-action-entry.md)): an Exact Future Target keeps its round and is dropped outside `current round < target <= 14`; a Future Prefix keeps its surviving contiguous suffix. One-time future offers use the `scheduled-offer` action and `cardStates[cardId].extraData.scheduledOffers`, not resource tokens. Cards queue future tokens instead of writing a `targetRound` state machine.
- **Turn end**: ordinary rotation and card-driven Turns share one frozen source tree from `buildEndTurnReactionFlow()`; window completion closes the Turn Scope once. Cards record once-per-Turn receipts against the existing Turn identity.
- **Before-Harvest**: player order freezes before Harvest skips activate; every player participates; the order lives in `stageResume.extra.beforeHarvestPlayerOrder`.
- **Whole-Harvest skip**: a pending marker activates once after every `onBeforeHarvest` and excludes the player from every later Harvest step, stage hook and listener for that round.
- **Harvest preparation**: `harvestPrepWindow` offers only payable, use-limited Harvest exchanges that produce a demanded good, from `preHarvestGoodsWanted` / `preHarvestGoodsWantedBeforeReap` / `maySkipHarvestFieldPhase` metadata. Usage is recorded per source and round.
- **Reap**: `reap` is an internal action. A full Harvest uses `trigger: { phase: 'harvest' }`; a private field phase reaps without Harvest summaries. `computeHarvestCount()` returns counts with `sources` / `tags` / `scope`, changed only through `registerHarvestCountModifier()`. Per-crop `reap` events accumulate into one parallel flow before `onAfterReap`.
- **Post-reap anytime**: offered in Harvest order before feeding is computed; rebuilt after each flow.
- **Feeding**: `computeHarvestFeedingRequirement()` changes only through `registerHarvestFeedingRequirementModifier()`. The feed request carries an authoritative exchange catalog (§7.9); `handleFeedResolved()` validates the whole ordered plan before any mutation.
- **Breeding**: `getBreedThreshold()` takes the smallest played-card threshold; `computeHarvestBreedOrderPriority()` reorders breeding only.
- **Harvest summaries** are rule facts: `harvestReapSummary` (crops, positions, count applications) and `harvestBreedSummary` (placed newborns, settled after placement) last until `onAfterHarvest`; cards compose them through `getHarvestOutcome()`.
- **Before end**: `onBeforeEndGame` dispatches in target seating order with `beforeEndGameScope`; `handHooks` cannot use it. `preScoringWindow` then offers only `preScoring: true` anytime listeners per player before `gameOver`. Pre-scoring spending uses explicit flows; Scoring Reserve never deducts real resources.
- **`onBeforePlayerTurn`** is the one non-flow hook: skip-control only, `{ skipTurn?: true } | void`, never an `ActionFlow`, never pending.
- **Timed rules**: `CardEffect.timedRules` declares a closed `TimedRule` / `RuleBody` that native registration compiles into existing hooks; `timed-rules.ts` reads no runtime registry. Execution-time formulas come from `rule-queries.ts`.

Tests: `server/__tests__/{preparation-bga-session,before-harvest-reaction-dispatch-session,stage-animal-settlement-session,parallel-trigger-multi-session}.test.ts`, `server/__tests__/stage-hook-flow.test.ts`, `shared/actions/__tests__/future-meeples-entries.test.ts`.

### 7.7 Listener purity

`CardListenerRegistration.handler` is a state-pure flow builder on dispatch, preview and doability paths, matching the reference model where reaction collection only builds activation leaves and mutation happens in action leaves.

- A handler may read state and events and return `ActionHookResult`, `ActionFlow`, costs, doability or options. Every mutation, including writes to its own `cardStates[cardId]`, is a returned leaf (`gain`, `pay`, `special-effect`, `exchange` or a reusable internal action).
- Dispatch never runs a handler to precompute a result. A listener activation is an ordinary internal leaf (`activate-card`) carrying listener, card, event, owner and trigger player; `event.actionContext` keeps the triggering `targetSpaceId`.
- **Gate**: every Vitest project that dispatches listeners installs `shared/cards/__tests__/listener-purity-guard.ts`, which hands each invocation deep read-only proxies and fails on any write or returned live reference. `pnpm run check:card-impl-boundaries` statically rejects explicit context writes in every resolved handler and `deriveCardCostCandidate`. There is no exemption list.
- **Trigger-select** (`ParallelNode`) owns select, pass, mandatory and independent semantics; there is no listener-specific node. A structurally inapplicable child is hidden for this iteration and re-evaluated after siblings run; an applicable but unaffordable child stays visible and disabled. `mandatory: true` disables Pass only while a mandatory child is applicable and executable. Card-listener applicability comes only from the returned result; stage card effects still preview on clones.
- **Before reachability**: same-time `before` listeners are a real trigger flow ordered by the player, never statically simulated. A card that can make an unreachable action reachable opts in through a scoped `isDoable` that steps aside under `skipBeforeTriggers`. The pass gate checks the original with `skipBeforeTriggers=true`, then only generic replacement fallbacks.
- **Synthetic dispatch**: `trade-applied` and `harvest-feed-conversion` run only non-optional `special-effect` and `gain` leaves in deterministic `seq` / `parallel` flows (`executeImmediateSpecialEffectFlows()`); payments and interactions are not supported there.
- **Owners and switches**: owner and trigger player are explicit; runtime owns cross-player confirmation and undo boundaries. `confirm-player-switch` is submitted by the outgoing player and creates an undo boundary.
- **Provisional continuations** ([ADR 0015](adr/0015-provisional-cross-player-continuation-resolution.md)): every mutating command crosses one settlement boundary with a normalized identity and checkpoint; scopes, guards, Protected Observation and failure memory live in the private session cursor.
- Do not add an `order` field to `CardListenerRegistration`; stable fallback order comes from `playOrderIndex`.

Tests: `shared/cards/__tests__/listener-purity-guard.test.ts`, `shared/cards/__tests__/listener-purity-wave*.test.ts`, `server/__tests__/authoritative-command-settlement.test.ts`.

### 7.8 Farm-type commit

Each farm type closes its logic inside its own `ActionDefinition.resolveChoice` under `shared/actions/effects/`:

- **Room** (`construct.ts`): `room-payment.ts` expands per-room cost variants; a printed per-room discount uses `scope:'unit'`. House animals persist per real room in `houseAnimals`.
- **Stable / plow** (`stables.ts`, `plow.ts`): typed-flat payment; stable pricing derives one unit fee from the default, `exactCost` or `costOverride` and one complete farm-choice query. `plow.actionContext.allowedTiles` / `adjacencyPolicy` affect only that plow.
- **Fence** (`fencing.ts`): validate edges, sources, connectivity and regions; compute cost through the farm-choice `computeCosts` pass; pass trades, bonuses, providers and budget into `pay:fence:*`. `before` contributions write back to the host by source: wood discounts add no entity, and card-held fences are chosen explicitly and consumed only for ordinary fences built in this action.
- **Sow** (`sow.ts`): no payment combination. `maxSelections` counts Logical Fields, `maxSeedSelections` caps crop slots; action crop permissions intersect the field owner's; `isUnconditionalSow` keeps explicit restrictions.

First-round payloads are `fence: {edges, palisadeEdges, extraWood, fenceSources?}`, `room: {rooms}`, `stable: {stables}`, `plow: {tile}`, `sow: {crops}`, submitted as `{type:'choice', value:'confirm', payload}`. A second payment round persists the payload in `pending.actionContext.farmPayload`. Entry doability for construct and fence rejects states with no reachable commit.

#### 7.8.1 Fence segments and policy

- `FenceSegment.type` (ordinary fence or palisade) and `FenceSegment.source` (whose token) are independent. A borrowed fence is an ordinary segment with `source.kind='borrowed'`.
- The fencing main path never branches on card IDs or per-card flags. Card behavior uses `fencePolicy`: `allowedSegmentTypes`, `sourcePolicy`, `segmentBounds`, `newPastureBounds`, `newRegionBounds`, `pastureBounds`, `connectionPolicy`, `allowedNewRegionTiles`, `allowTerrainInNewRegions`, `suppressTerrainRegions`, `costPolicy`, `paymentBudget`, `cancelPolicy`, `preserveAnimalTotals`, `promptHintKey`.
- `sourcePolicy: { kind: 'borrowed', donorCaps }` requires `fenceSources` covering every new ordinary edge; the server reclamps caps against live donor reserve and consumes donor supply.
- `newPastureBounds` / `newRegionBounds` bound the count and total size of new pastures or regions. `pastureBounds` is a separate check: `newPastures` bounds the net pasture-count increase, `changedPastures` the number of new or reshaped pastures, and `newPastureSize` the size of each of those pastures.
- `segmentBounds.total` limits ordinary fences plus palisades together. `canStartFencing` preflights at least one legal commit with `validateFenceSelection()`, which stays the final atomic validator.
- `costPolicy` sets only this action's base unit cost; `computeCosts.fence` discounts still apply. `paymentBudget` filters only final payment, never geometry. `promptHintKey` is copy only.

Tests: `shared/actions/__tests__/fencing.test.ts`, `shared/actions/effects/__tests__/{fence-resolveChoice,fencing-entry-guard,construct-resolveChoice,sow-permissions}.test.ts`.

### 7.9 Anytime window policy

`computeAnytimePolicy()` in `shared/session/anytime-policy.ts` computes card-listener anytime availability once per `buildInteraction()`; clients never import it. `GameCore.getAnytimePolicyInput()` supplies the active context, `stageResume`, the request kind and the request's `anytimeWindow`.

- A flow or request may declare `{ allowed: true, blockedIds? }` or `{ allowed: false }`. The declaration belongs only to the current waiting node; parents, siblings and continuations confer nothing.
- Priority: no context; heating; engine-blocked; next-player confirmation (exchange blocked); player-switch confirmation; animal reorganization; the explicit current window; the default stage-hook-chain block; ordinary allowance. Metadata cannot override an earlier hard block; malformed windows close.
- Three consumers share the snapshot: `buildAnytimeEntries()` filters entries; `buildInteraction()` exposes `takeAnytimeAction` only when allowed and non-empty; `takeAnytimeAction()` enforces the policy before injection.
- Card entries share current-step admission (§7.5.2); a root `optional` does not bypass it, and the new action uses its own source, parameters, costs and actor.
- Nested anytime flows insert ahead of the current pending tree; the parent returns as the same `PendingEnvelope`.
- Re-entry: while an Anytime Ability's sequence is running, the same entry is excluded for that player across frames. `allowAnytimeReentry` lifts only this restriction and is set only by the system `exchange`. Goods or target options inside one ability share its entry.
- A turn-replacing anytime action (`replacesTurn`) is available only from an idle work phase and rotates after its whole flow and end-turn hooks.
- Completion: a terminal reaction that must wait for the full injected sequence marks its last leaf with `INJECTED_ANYTIME_COMPLETION_CONTEXT_KEY`, and consumers require both that marker and the engine's injected marker.
- **Exchange Batch**: one submission validates every recipe index and count before any payment, settles the whole batch, then runs any needed reorganization. Recipes may block anytime use in named interaction kinds (`blockedAnytimeInteractionKinds`); during breeding, animal cooking recipes are unavailable. Compact values such as `bulk:` are admitted through the request's `structuredChoicePrefixes`, never by action-ID special cases.
- **Feed catalog**: the `feed` request publishes `exchangeCatalog` entries keyed by stable `(sourceId, exchangeIndex)`; the client drafts only from it, and submission matches both the original and a live rebuild.
- Reorganize is a system subflow, never an anytime entry. Idle work turns and `confirm-next-player` are acting-player windows; `confirm-player-switch` and stage-hook chains are blocked unless the current node opens a window. `computeResourceCommitments()` limits are enforced at the command boundary ([ADR 0019](adr/0019-resource-commitments-preserve-unsettled-trades.md)).

Tests: `shared/session/__tests__/anytime-policy.test.ts`, `server/__tests__/{anytime-reentry-session,anytime-nested-pending,anytime-policy-negative,anytime-admission-session}.test.ts`.

---

## 8. `shared/cards/`: Card Source closure

This module owns every card's single source and the generic seams a card plugs into: hooks and listeners (§7), local state, Card Fields and capability metadata. A card's ability stays closed inside its own file.

### 8.1 Card Source and projections

A card author maintains one Card Source ([ADR 0002](adr/0002-card-source-manifest-projection.md)):

```ts
export const CardName = defineOccupationCard({   // the constant shares the file name
  meta: { id, name, deck, number, category, desc, cost, players },
  impl: { modifiers, listeners, effect, prerequisiteCheck, reaches },
})
```

| Concept | Form | Readers |
|---|---|---|
| Card Source | `shared/cards/{A..E,M,major,community}/{Card}.ts`, containing `meta` and optional `impl` | Server, sandbox and tests; forbidden from the main client bundle |
| Card Display | `public/cards-manifest.json`, built from Card Source `meta` | Main client bundle through `client/services/card-meta` |
| Card Impl | Card Source `impl`, collected into the generated `ALL_CARD_IMPLS` (`shared/cards/register-all.ts`; majors through `major/runtime.generated.ts`) and `CardRegistry` | Server and sandbox; forbidden from the main client bundle |

- `meta` is the Card Definition: serializable, frontend-visible fields without runtime behavior. Declarative rule fields (`cost`, `prerequisite`, `*Prerequisites`, `cardField`, `isCookery`, capability metadata) are allowed; `modifier(s)`, `listeners`, `effect` and `prerequisiteCheck` are not. `desc` and `prerequisite` are printed text; optional localizable `rules` is a supplemental ruling with no runtime effect. Static conditions use `*Prerequisites`; dynamic ones use `impl.prerequisiteCheck`.
- `impl` holds `modifiers`, `listeners`, `effect`, `prerequisiteCheck`, helper calls and `reaches`. Builders may project `reaches` to the manifest top level, never into `meta`.
- `scripts/build-cards-manifest.ts` extracts `meta` statically with the TypeScript AST and never imports a Card Source at runtime; `meta` contains only JSON-like literals and simple same-file constants.
- `definePlayerActionCard` declares `playerActionCardType`; the deal pool and UI use it rather than card numbers or i18n.
- Production descriptions render resources, animals, terrain and points as `ResourceText` icon tokens; `__…__` marks exact card, action and space names. `scripts/__tests__/card-description-icons.test.ts` and `card-description-double-underscore.test.ts` gate this.
- Card faces, trigger labels, log previews and Replay share `client/components/common/cardText.ts`: each name or text field falls back on its own from the canonical translation to `meta.locales[locale]` (empty values skipped) to source metadata, names also accept legacy `cards.<id>.name` aliases, and card-owned prompts reference names with `{card:<id>}`. Player names follow the generated-name provenance in `client/utils/player-name.ts` (§12).

Tests: `shared/cards/__tests__/card-source-representatives.test.ts`, `scripts/check-generated-cards-sync.ts`.

### 8.2 Generated catalog and registry

| File | Role |
|---|---|
| `shared/cards/catalog.generated.ts` | Generated from Card Sources: `catalogCardDefinitions`, the card lists (`minorImprovementCardsList`, `occupationCardsList`, `implemented*CardsList`) and ID lists |
| `shared/cards/register-all.ts` | Generated `ALL_CARD_IMPLS`, the resolved Card Impl map (`scripts/generate-register-all.ts`) |
| `shared/cards/catalog.ts` | Catalog facade, such as `minorImprovementCards` / `occupationCards` without community cards |
| `shared/cards/active-registry.ts` | Temporary synchronous `CardRegistry` scope; no persistent default |
| `shared/cards/registry.ts` | `CardRegistry` with `loadByIds` and `unload` for per-room loading |
| `shared/cards/custom-registry.ts` | Server and sandbox runtime implementation, session context, effects, listeners and modifiers for `CUSTOM_*` cards |
| `shared/cards/custom-card-metadata.ts` | Frontend `CUSTOM_*` Card Display, artwork URL and O number |

- Production paths access cards only through the generated catalog and `CardRegistry`; tests may import a single Card Source. Card Definitions are plain data with `kind: 'minor' | 'occupation' | 'playerAction' | 'major'`.
- The generated catalog must stay in sync (`pnpm run check:generated-cards-sync`); Workshop PR generation patches fetched upstream generated files, never the deployment host's local tree.
- The major runtime source enters the backend only through `major/runtime.generated.ts`.
- The server and sandbox register only custom runtime parts; the main client registers only display metadata and never imports the custom runtime registry.

### 8.3 Local state in `cardStates`

- Persistent counters, one-time flags and local state live in `player.cardStates[cardId]`, never top-level `PlayerState`. History a card needs before it is played uses an explicit hand-zone listener (§7.5), not a global statistic.
- Shared exceptions are facts several cards and the farm geometry rely on: `player.farmyardSpaceStates` (blocked spaces, farmyard and field goods tokens, non-field crop spaces; placement lock is distinct from used / unused) and `player.farmyardExtensions`.
- A later player choice is an explicit continuation: the card returns a flow whose leaf issues a request and waits in a `pending` envelope, never in a hidden shared slot.
- Held workers use `shared/cards/helpers/card-held-workers.ts`; return home releases them. `family-growth` may place a newborn directly on a card through `actionContext.holdNewbornOnCard`.
- Read-only UI markers (`extraData.farmTerrainMarkers`) and cross-player public markers (`extraData.publicCardMarkers`, scored through `cardBonusVp`) are rendered generically.
- **Visibility** ([ADR 0023](adr/0023-explicit-card-state-visibility-and-presentation.md)): card state is internal by default. Native `presentation` declarations and `getStatePresentation(player)` opt facts into public adapters; serialization records normalized `cardStatePresentation`, stripped on rehydration. Player-private `privateData` follows the storage player, not the current holder. Viewer snapshots, events, histories and seat-view Replay expose only public facts and the viewer's own private data, even to the card's owner; authoritative state, recovery, undo, debug full state and all-open Replay keep raw state. `card.stateChanged` events carry keys without values, and projection strips values from historical events without rewriting Frames.
- `getRuleContributions(player)` exposes read-only component reservations and unused-space reductions; consumers combine unique sources, floor finite values, reject negatives and non-numbers, and cap deductions. Generic stable discovery and return dispatch by `sourceCardId`, and only the source changes its construction state. Query inputs and results are detached from storage, for native and Workshop cards alike.

Tests: `server/__tests__/card-state-visibility-session.test.ts`.

### 8.4 Helpers under `shared/cards/helpers/`

- `pay-gain-node.ts`: pay-then-gain, pay-then-action and return-then-gain templates.
- `stage-effects.ts`: stage-effect flags and optional once-per-card Harvest exchanges through the existing exchange executor.
- `card-state.ts`, `round-placement.ts`: one-time state, the raw Work Placement Chronology and Person Placement Order (§6.5).
- `action-snapshot.ts`: the active Turn Scope identity and start snapshot (§6.5).
- `card-held-workers.ts`, `card-field.ts`: held workers (§8.3) and Card Fields (§8.5).

### 8.5 Card Fields and the Logical Field seam

See [ADR 0017](adr/0017-logical-field-ownership-boundary.md).

```ts
cardField?: {
  allowedCrops: readonly ('grain' | 'vegetable' | 'wood' | 'stone')[]
  capacity: number
}
```

- `makeCardFieldImpl(cardId, def, options?)` registers the Card Field owner and derives sow integration; a card adds only configuration and optional `onReap` / `onCropRemoved` callbacks. Virtual columns come from `deriveVirtualTileCol(cardId, slotIdx)`.
- The card-facing interface has three entries: `getLogicalFields(player)` (an immutable projection of Farmyard Fields plus every played Card Field, including empty fixed slots), `getFarmyardFields(player)` (geometry, fencing, adjacency, occupancy), and `mutateLogicalFields(state, player, options?)` with named `place`, `insertBottom`, `grow`, `remove` and atomic `replace`, which validates the target and then writes through the owning adapter.
- Storage accepts every legal field good. `allowedCrops` is the ordinary Sow capability, not the storage schema: `place` enforces it unless a card effect bypasses it explicitly; Sow and `replace` always enforce it; `insertBottom` adds a rule-granted crop under the top without a new slot or the Sow whitelist.
- `fieldOperationFlow` `move` accepts `sourceCrops`; the destination continuation rechecks the source crop and quantity, destination occupancy and `allowedCrops` before storing positions or mutating.
- Card Field slots store a top `{ crop, remaining }` and optional `below` layers. Normal Reap takes one crop per occupied slot; extra and whole-field harvest continue through lower layers.
- A Card Field has one stable Logical Field id and one `groupKey`; its slots keep stable coordinates. Base field scoring counts Farmyard Fields only.
- `onReap` runs only for reap; `onCropRemoved` for every real removal. Each runs after the shared mutation, once per crop, and returned flows join the ordinary parallel reaction. A selection resolves a removal callback's flow before its next parent continuation.
- `reap` is the single reaping implementation for both storage owners (§7.6). A multi-slot Card Field reaps every occupied slot but counts once per Logical Field and crop.
- The low-level adapter inside `card-field.ts` is the only Card Impl code that touches `PlayerState.fields`; `check:card-impl-boundaries` rejects any property or bracket access named `fields` in other production card and helper sources, whatever the receiver, with no allowlist.

Tests: `shared/cards/__tests__/{AB,CD,EM}-logical-field-boundary.test.ts`, `shared/actions/effects/__tests__/{reap,sow-permissions}.test.ts`.

### 8.6 Naming, capabilities and boundaries

- Card files use `{Deck}_{Number}_{Name}.ts` and export a constant with the same name; a major-family file such as `major/fireplace.ts` exports each physical card it holds.
- A card's ability stays inside its file. Core files such as `shared/actions/effects/pay.ts`, `shared/actions/effects/improvement.ts`, `shared/session/session-core.ts` and `server/game/authoritative-session.ts` never change for one card; there is no centralized card-effect registry and no frontend card rule.
- Cross-card identity and capability queries use typed metadata and played-card helpers: `getPlayedCardDefinitions(player)`, `collectCardDefinitionsAs(player, type)` and `playerHasCardCapability(player, capability, { asType? })`, reading only played zones; `asType` reuses `cardCountsAs` for dual-type identity. Registered capability metadata (`preventsHandDiscard`, `fireplaceIdentity`, `cookingHearthIdentity`, `ovenIdentity`, `firewoodBuildTrigger`, `potteryIdentity`, `animalHolder`, `blocksHouseAnimalZones`, `waresSalesmanGains`) lives in `meta` and adds no frontend behavior. `ovenIdentity` is OA's oven-family identity and does not imply a baking exchange; an upgrade can keep scoring identity and opt out of build triggers with `firewoodBuildTrigger: false`.
- `check:card-impl-boundaries`, part of `pnpm run check:architecture`, rejects runtime reads of another non-major card's ID in production Card Sources. Explicit exceptions are `Major_*`, `reaches`, `allowedPurchases` and prerequisite candidate lists.
- A card whose printed text names another card may declare it as a named printed target in `reaches` and read only its public facts (existence, owner, played status), never its private state; a checker exception binds one exact source-target pair.
- Metadata audits must cover new metadata fields with fixtures.

### 8.7 Minor-improvement passing

`CardDefinition.passing?: boolean` marks a minor that is passed after purchase. The improvement host completes payment through its internal `pay` child, then commits the purchase in `completeInternalChildren`: the card goes to the next player's `minorHand` (not `minorPlayed`), does not count toward `totalMinorBuilt`, adds no modifiers, emits `card.passed` instead of `card.played`, and `onBuy` still runs through `activate-card-effect` in `afterHostCommitListeners`. Card-entered-play reactions skip it naturally. The client animates `card.passed` and the mapper derives `log.cardPassed`.

---

## 9. `shared/domain/`: Domain aggregation

Derived views and invariant checks live here. `PlayerState` stays plain JSON; every "can I do X?" query belongs to `PlayerBoard`. Domain code is shared by the main client, sandbox and server.

```text
shared/domain/
├── player-board.ts          PlayerBoard and the playerBoard factory
├── farmyard.ts             farm-rule validation and normalizePlayerFarm
├── farmyard-interaction.ts interaction payload projections for farm-select and farm-position
├── farmyard-usage-core.ts  canonical used / unused farmyard spaces
├── pasture.ts              derived pasture sizes, stable counts and base capacity
├── animal-zones.ts         animal-zone capacity and accommodation
├── animal-reorg.ts         Animal Reorg Prefill
├── animal-payment.ts       animal payment order
├── animals.ts              animal model
├── scoring.ts              scoring and PlayerScoreSummary
├── scoring-reserve.ts      final Scoring Reserve reads, aggregation and scoring-clone deduction
├── farm.ts, field.ts, space.ts, farmyard-space-states.ts
└── index.ts
```

**PlayerBoard.** `PlayerBoard(player, state)` exposes `farmyard` (validation and queries such as `canPlow`, `canSow`, `canBuildFence`, `canBuildRoom`, `canBuildStable`), `farmInteraction` (derives `farm-select` / `farm-position` payloads) and `animals` (zone capacity and accommodation). A frontend farm draft consumes only the server payload.

**Farmyard.**

- Used / unused spaces are read only from `farmyard-usage-core.ts`, including extensions, terrain, blocked spaces and derived pasture tiles; `farmyard-usage.ts` and `farm.ts` are compatibility facades. Cards never hand-count a grid. Rooms, terrain, fields, stables and pasture tiles always count as used; a `farmyardSpaceStates` entry joins them only with `blocksPlacement`.
- Pastures persist identity, tiles and animal assignments. `getPastureSize()`, `getPastureStableCount()` and `getFencedStableCount()` derive the rest; `getPastureViews()` returns detached views; serialized `size` / `stables` are display-only and stripped on load.
- Farm and action-space provenance uses source / type metadata: `FenceSegment.type/source`, `WorkerRef.synthetic`, `ActionSpace.blockedBy`, supply-token helpers, action-space category helpers across player counts, reservation tokens and attachments. Base action definitions filter player counts 2–6; 5/6-only spaces are separate.
- Farmers of the Moor terrain ([ADR 0007](adr/0007-farmers-of-the-moor-variant-runtime.md)) is the public top layer of `farmTerrain.kind`, with Covered Farm Terrain in `covered`. Terrain changes go through the generic selection leaf and are revalidated against live occupancy at submission and effect time; future terrain tokens reuse `futureMeeples` entries. Fenced terrain adjacency is a pure helper; one-off adjacency uses `adjacencyPolicy` / `allowedTiles` / `fencePolicy`. Multi-layer stacked terrain is not supported.
- Farmyard Extensions extend the shared geometry; every farm reader uses the dynamic shape.

**Animals.**

- Each real room owns a capacity-one Room Animal Holder (`house:<positionKey>`); `PlayerState.houseAnimals` is the only writable room assignment ([ADR 0026](adr/0026-each-room-is-an-animal-holder.md)). `roomAnimalZones` is a display projection stripped on load. Occupancy groups and `occupiedZoneLimit` (ordinary room holders share a limit of one) constrain occupied holders across rooms and card zones, through the pure `shared/contract/animal-zone-occupancy.ts` query.
- Loose stables store `{ animalType, animalCount }` per farm position ([ADR 0029](adr/0029-loose-stables-retain-animal-species-and-count.md)); an empty stable has no entry and stays in `stableTiles`. Animal-number rules sum counts; occupied-space, presence and distinct-species rules keep their own semantics.
- Every "can accommodate" question uses `canAccommodateAnimalTotals()` or `canAccommodateAllAnimals()`, which search for a legal final assignment (allowing a later system `reorganize`) and respect `occupiedZoneLimit` and required-empty groups (`requiredEmptyZoneGroupIds`: at least one tagged zone per group stays empty). A card never tests a single zone locally. A candidate that permanently reduces holder capacity is filtered against post-payment capacity.
- `onComputeAnimalZones(player, zones, state)` adds zones; `computePastureCapacityModifiers(player, state)` returns replacement then additive modifiers in play order; `onComputeSharedAnimalZones()` contributes Hosted Card Animal Zones, stored in the card owner's `animalCountsByZone` but settled by `animalOwnerPlayerId` (and `breedingOwnerPlayerId` for breeding). Every holder writer persists `cardId`, `ownerPlayerId` and `animalOwnerPlayerId`; rewrites and cross-player deductions touch only the current Animal Owner's entries. `computeAnimalZones` fills a missing `cardId` on a card zone. A fixed animal type uses `allowedAnimalType`; `animalType` is only current occupancy.
- A farm-position-backed zone declares `farmPosition`, `countsFarmyardSpaceAsUnused` and `displaySource: 'farm-position'`; the client renders only server-provided zones there.
- `isHouseAnimalZone()` / `countHouseAnimals()` include tagged `houseAnimalZone` zones; `blocksHouseAnimalZones` removes them.
- Animal statistics and consumption (`getAssignedAnimalsByType()`, `subtractAnimalsFromBoard()`) read and write legacy holder fields together with `animalCountsByZone`. Payment order lives in `animal-payment.ts`: card-local `consumeAnimalPayment()`, then board and holders, then counter-backed holders marked `capacityCounterKey` / `capacityLossOnPayment`. A specific card counter named in `animalPaymentPreference.prefer` goes first and disables the counter-backed fallback. System removals notify cards through `onAnimalRemoved()`.
- Reorganization validates identity, species, counts, mixing, capacity, inventory, exclusive limits and required-empty groups before mutation; invalid input returns a recoverable `log.reorganizeFail` and changes nothing. Omitted zones are empty; under-assignment discards animals deliberately. Entering reorganization moves animals displaced from inactive or reduced card storage to reserve without reducing totals.
- Animal Reorg Prefill (`prefillAnimalZones()`) fixes valid existing occupancy and adds as many reserve animals as fit, without writing placement until confirmation; `actionContext.prefill=false` opts out.
- Farmyard-only exchanges (`CardExchange.fromFarmyard` / `Trade.fromFarmyard`) pay only with currently placed animals in both the exchange and the ordered feeding path; the feed request publishes the placed balance, and animals gained in the same feeding batch are still unplaced.
- `animalKeysForState()` adds horses only with Farmers of the Moor. Breeding and score adjustments use `computeBreedableAnimalCount()` and `computeAnimalScoreAdjustment()`.
- Special stables use the card-effect trio `getSpecialStablePositions`, `applySpecialStable` and `getBuiltSpecialStables`, and core stables code imports no card. They are offered only when `actionContext.farmHand === true` (the Farm Expansion stables leaf), through protocol field `farmHandPositions`. Built ones project to `SerializedPlayerState.specialStables` (stripped on rehydration); an unaccepted position rejects the whole batch recoverably.

**Scoring.**

- `cardBonusVp` is the single category for non-printed card points, attributed by `cardId` / `cardType`; printed card VP stays in `cards`; public card markers may score negative. Each bonus source enters the category once: generic scoring already reads `cardStates[cardId].counters.bonusVp`, so a card storing points there never also returns them from `computeBonusScore`. Old `cardsBonus` / `cardStateBonusVp` / `cardBonus` shapes are gone.
- Scoring Reserve is a final-scoring reservation, not payment, recorded through `special-effect` `record-scoring-reserve-bonus`. `computeScores()` deducts every selected reserve from a scoring clone before the costed-bonus solver, resource-based major scoring reads that clone, and an unpayable combination invalidates the bundle.

**Major improvement supply** ([ADR 0006](adr/0006-stack-aware-major-improvement-supply.md), [ADR 0016](adr/0016-separate-supply-family-from-improvement-identity.md)): variant templates create real card-ID stacks; the board exposes each stack's top. Purchase, return and swap go through supply helpers, and production reads use supply query helpers. Upgrade identity uses `*Identity` metadata, never the stack's `familyId`. Duplicates keep their concrete IDs as source and attribution. Bottom-row rules use `isBottomRowMajorImprovement()` / `getAvailableBottomRowMajorImprovementIds()`.

Tests: `shared/domain/__tests__/`, `shared/actions/__tests__/animals.test.ts`, `shared/actions/effects/__tests__/reorganize-engine.test.ts`.

---

## 10. Other `shared/` modules and Game Variants

### 10.1 `shared/draft/`

Pure functions for simultaneous selection (`initDraftState`, `processSubmit`, `tryAdvanceRound`, `finalizeDraft`); `createRoom` enables it with `draftMode: 'simultaneous'` and `draftPoolSize: 7..10`. With Farmers of the Moor, occupations, FoM minors and published minors draft in separate stages, the FoM minor pool derives from the implemented registry and refuses to start when short unless `allowIncompleteFarmersOfTheMoorMinorDeal` is set; Community Deck minors join only the published part.

### 10.2 Game Variants

A Game Variant changes setup, public state, Action Spaces, phase flow or scoring for one game; it is not a card source and adds no frontend rules.

- **Parent Cards** ([ADR 0005](adr/0005-parent-cards-dedicated-expansion-runtime.md)) are structured data in `shared/parents/*` with assets pinned by `public-assets.ref`, separate from Card Source projections; selection, rewards and side quests are backend-authoritative and use non-public seeds.
- **Through the Seasons** keeps the four season spaces on the board and enables only the current one; its modifiers register in each Core's `ActionHookRegistry` and never write player `cardStates`.
- **Farmers of the Moor** ([ADR 0007](adr/0007-farmers-of-the-moor-variant-runtime.md)) adds terrain, extensions, horses, heating and its major supply through the generic seams in §9.
- **Snake Opening** reverses only round-1 work rotation (§6.4).

### 10.3 `shared/custom-code/`

Workshop cards are admitted only through the deployed Workshop Capability Contract ([ADR 0025](adr/0025-workshop-capability-contract-is-fail-closed-and-opened-by-tests.md)).

- `ast-validator.ts` validates custom-card TypeScript with an AST: approved imports only, no forbidden APIs, network or I/O; `effect` must be an object literal; listener phases and effect keys must be in the contract allowlist.
- `sandbox-listener-actions.ts` is the single action list shared by prompts, the validator, server and browser manifests and doc sync (`pnpm run check:prompt-sync`); GitHub references cannot widen it.
- `flow-admission.ts`, `contract-admission.ts` and `listener-result-validator.ts` reject, before the engine, any output outside the contract: unlisted actions, foreign-card nodes and listeners, unopened node fields, wrong-typed opened fields and parameters, undocumented parameters, query results of the wrong type and writes to another card's or player's animal zones. Native card flows are not checked.
- Listener `costs` must come with matching `costAttribution`. Sandbox constraints are documented in [`docs/CUSTOM_CARD_SANDBOX.md`](CUSTOM_CARD_SANDBOX.md); runtime isolation lives in `server/custom-code/` (§11.4).

Tests: `shared/custom-code/__tests__/`, `server/__tests__/workshop-contract-*-session.test.ts`.

### 10.4 `shared/i18n/` and `shared/utils/`

`shared/i18n/` holds UI copy keys and resources; `PromptKey` lives in `shared/contract/prompt-keys.ts`. `shared/utils/` holds generic helpers with no business rules; `rng.ts` owns the Explicit Seed generator and the HMAC-SHA256 wide-seed streams.

---

## 11. `server/`: Backend authority

### 11.1 `server/connection/`: WebSocket entry

```text
server/connection/
├── ws-server.ts      new WebSocketServer({ server, path: '/ws' })
├── room-router.ts    routes ClientCommand.type to GameSession or Lobby
└── broadcaster.ts    fans out StateUpdateEnvelope
```

Invariants:

- One Room owns exactly one `GameSession`. The WebSocket handler awaits asynchronous `dispatch()` through the Room and connection queues.
- `room-router` validates commands, authorizes seats, and calls `GameSession`; it never writes `GameState` directly.
- `payload-validation.ts` is pure validation through `validateResourcePayload`, `validateSingleTilePayload`, and `validateMultiTilePayload`. It returns legal normalized values and never writes `GameSession`.
- ADR-0022 extends ADR-0014 to asynchronous PostgreSQL: the Room's `ready | blocked` gate remains at command entry, and its queue holds authorization, rule execution, commit and publication together. Save retries retain the exact captured transition while the Room is blocked.
- A rules command returning `resp.ok=false` without `durableTransition` responds only to its origin connection and neither increments `roomVersion` nor creates a Replay Step. A durable rejection still commits; only its error is restricted to the origin connection, while other seats receive the committed version as an error-free snapshot (ADR 0015).

### 11.2 `server/game/`: Room and GameSession

```text
server/game/
├── room.ts                    Room { id, session, players, maxPlayers, startedAt }
├── room-registry.ts           RoomRegistry
├── lobby.ts                   lobby, room list, and automatic join
├── room-persistence-checkpoint.ts  awaited waiting/seat metadata and discard lifecycle
├── authoritative-session.ts   GameSession extends GameCore; command-execution center
└── persistence/
    ├── room-persistence.ts    abstract persistence contract
    ├── postgres-adapter.ts    PostgreSQL rooms.state_json
    └── memory-adapter.ts      test injection
```

`RoomPlayer { ws, playerIndex, name, userId? }` represents a connection, not domain `PlayerState`. `GameSession` is a thin server wrapper around `GameCore` that injects the server custom-code executor. Connection binding, broadcasting, and persistence are outside it.

Development slots `dev2` through `dev6` point to permanent game identities in `development_room_slots`. An active recorded game keeps its identity on restart. Rematch or explicit reset retires the prior game and assigns a fresh UUID-suffixed identity; completed, expired and removed contexts are never revived. Development games have no idle expiry. All hosted rooms use PostgreSQL and mandatory recording. After every player disconnects, ordinary Rooms are retained for 30 minutes when `waiting` and seven days when `playing`; recovery includes `custom_card_ids` and reserved seats. Reconnection may replace a seat's previous connection.

Non-production discovery resolves a slot only when the caller explicitly sets `developmentSlot`; the transport joins the returned permanent ID. Concrete Context links and pending command receipts keep their original target. Synthetic development account labels retain generated-name provenance, so they do not overwrite localized default game names as custom account names.

Development Rooms allow one account to open separate connections for different requested seats. Join and resume preserve an explicit seat, including for local anonymous connections, `context` links and UUID-suffixed development games. The transport sends an explicit or acknowledged seat on reconnect and retains acknowledgements with pending commands across page reloads. Before acknowledgement, an unspecified seat stays unspecified; development resume requires a seat hint or a uniquely owned seat and rejects ambiguous or anonymous recovery instead of replacing another connection. Ordinary Room resume still derives the seat from authenticated ownership and ignores the supplied seat hint. A client-side `devMode` flag does not grant development Room privileges.

`room_players` stores ownership by `(room_id, player_index)`, so one development account can retain several seats through restart and result archival. Saving complete ownership metadata reconciles obsolete pairs without updating unchanged owners or their join timestamps. Account-level Context and Bug Report lookups use the lowest owned seat as their deterministic representative; the lobby lists each owned seat separately. The schema migration preserves existing ownership rows, snapshots and development-slot identities.

`roomId` uniquely identifies one game. `newGame` first creates a new `GameSession` and UUID, then switches online seats, player count, custom cards, persisted variant flags, and all connection references to the new Room record. It never reuses the old ID. The first `waiting -> playing` transition writes immutable `started_at`. Only authoritative `gameOver` writes scalar summaries to `game_results` and `game_result_players` and deletes `rooms.state_json` in one PostgreSQL transaction. TTL expiry, room dissolution, account deletion, and restart of an unfinished game delete only the recoverable snapshot and mark permanent Game Context as `expired`; they produce no result. An archive-write failure rolls back and retains the full final state for recovery or retry.

`RoomPersistenceCheckpoint` durably acknowledges creation, waiting-room state and seat metadata. All hosted games, including Workshop, hotseat and fixed development rooms, use mandatory recording. The initial Frame and subsequent transitions commit Room state, incremental recovery records, Replay Step and terminal result in one PostgreSQL transaction before publication. Reads and metadata changes do not advance the authoritative version. `newGame` creates its replacement and retires the old active game in the same transaction before switching connection references.

`room-queue.ts` serializes authorization, rules, asynchronous commit and publication. Moving a connection reserves both Room queues and the connection queue; disconnect, cleanup and administrative retirement use the same queue. Shutdown stops new input, releases pending retry waiters, drains accepted work and closes the database pool.

A successful storage retry retains its waiters until asynchronous publication finishes. If publication fails, it releases the queue and closes the affected connections so they can recover the committed receipt and snapshot; it does not repeat a partially executed Room-adoption callback. Rematching or retiring an online completed game checks ownership and its persisted final Step version because completion has already removed the active Room row. This exception applies only to retirement; ordinary writes still require active Room recovery data.

The stopped-application importer expires only proven unrecorded active games; live startup performs no legacy cleanup. Waiting rooms and games with recording intent, pinned builds, Replay or result evidence are preserved. Missing recorded data blocks recovery without inventing a replacement or a historical prefix. Independent HTTP/browser Workshop sandboxes remain available. See [ADR-0022](adr/0022-distributed-room-recovery.md).

`RoomDirectory` assigns each Room to an application process using a PostgreSQL lease and monotonic ownership epoch. Commit and publication both verify that owner and the expected Room version. `POST /api/rooms/locate` supplies a same-origin `/nodes/<instanceId>/ws` route; `ingress.ts` forwards to private instances. Production Compose starts two independent application processes in one app container on the same physical host. Local launch defaults to one process and also supports two. Shared lobby presence and HTTP affinity preserve Room routing and nonrecoverable Sandbox access.

Mutating commands carry a server-issued scope, stable command identity, Room identity and expected version or simultaneous-input window. `CommandStore` reserves their content fingerprint and commits their outcome in the same transaction as the Room transition. Repeated commands return the original receipt. The client journals pending commands, rediscovers the owner after normal reconnect, looks up receipts, resumes its existing seat and waits for an authoritative snapshot before accepting new input. A rematch only transfers online seats; disconnected old reservations cannot start the new game.

`InvalidationStore` commits card/user barriers, affected Room retirement and per-instance tasks before returning an operation identity. Every execution and publication checks the shared barrier. Instances drain queues, dispose Room and Sandbox workers and acknowledge tasks; the operation remains pending until each required instance acknowledges or loses its lease. Account deletion uses renewable durable claims and retains pending external GitHub cleanup. Administration and settings show completion only after this contract is satisfied.

**Recovery constraint for Issues #938–#940:** active recovery must preserve ordinary Undo History and nested provisional rollback checkpoints. Restoring the authoritative session and the RoomCommitter baseline needed to continue committing must remain independent of historical Replay payload. Recovery may verify Replay head metadata, but must not require decoding Replay checkpoints or deltas. See ADR-0011 §11 and ADR-0015.

**Room history and recovery (Issues #947–#954):** PostgreSQL stores immutable history nodes in `room_history_nodes` and shared ordinary/nested checkpoint records in `room_recovery_nodes` (preserving the original recovery formats). `shared/session/history-streams.ts` captures a smaller core body and immutable branches without copying full historical arrays; `RoomHistoryStore` writes only new nodes in the existing Room/Replay transaction. Failed writes never admit uncommitted IDs to the durable cache. Query failures propagate unchanged for storage retry; only successfully read data's decoding and integrity failures become `RoomHistoryCorruptionError`. Missing references, invalid checksums and raw Frame Hash mismatch fail closed. The memory test adapter retains complete logical snapshots. Startup loads Room-owned history and recovery records in a bounded batch of queries.

**Snapshot ownership (Issue #941):** `serializeSessionSnapshot` captures and freezes the authoritative core once. Its separate `state` and `frame` views share immutable nested core values and history records; player display fields are computed in the live session context and copied separately. Each player serialization computes animal zones once for its four display projections; that result is local to the call, with no cache across queries or commands. Frame constants, action-space execution-field removal and serialized key order remain unchanged. `rehydrateState` copies the smaller core before normalization or rule execution, including after Worker IPC has preserved aliases but removed object freezing. Restored rules can therefore write without changing either saved view.

`RoomCommitter` takes ownership of the native snapshot's freshly captured Frame and copies final scores separately. Worker snapshots remain externally cached, so their smaller Frame body is copied while reusing immutable histories. The accepted diff baseline and failed-commit retry retain that captured Frame and encoded payload. PostgreSQL writes internal Room history version 2: one packed `state`, a structural `frameDelta` against that same saved state, and the raw Frame Hash. The delta retains all Frame differences, including derived values, constants, removed execution fields, scores, future fields and independently captured history references. Version 1 `frameWithoutStreams` records remain readable. This changes only Room storage; the memory test adapter, Worker IPC and Replay retain their logical snapshot formats.

Packed latest, undo and checkpoint bodies use a level-1 gzip/base64 JSON envelope only when the complete envelope is smaller than the original JSON; history node records remain uncompressed. Recovery-record checksums cover the exact encoded text, and readers also accept raw JSON bodies. The latest envelope keeps only the lobby's turn-query fields available to PostgreSQL; recovery and local restart tooling decode the full body. Encoding never expands the referenced histories.

Recovery applies the saved Frame delta to an independent copy of the smaller state body, joins exact history references and verifies the canonical raw Frame Hash without Replay payload or current-rule recomputation. Rules, Workshop, Worker IPC, Replay and debug snapshots retain complete logical history. Worker IPC carries a separate recovery identity catalog, outside the raw Frame, to preserve record/group/checkpoint identities across messages. JSON snapshots include the same catalog for every serialized alias path, preserving those identities after restart. Ordinary undo, command rollback, nested provisional scopes and Protected Observation retain their existing behavior; see [ADR-0021](adr/0021-room-owned-history-branches-and-recovery-snapshots.md).

WebSocket viewer snapshots include `historyWindow`: the latest **20 complete operation groups**, stable record IDs, a viewer-bound branch ID and an optional older-page cursor. `getHistory` / `historyPage` use the existing active seat authorization (including replaced-connection rejection); full viewer filtering precedes paging, including hidden-hand events and cancellation payloads. Reads never write a Room or advance its version. HTTP/local/debug payloads remain complete. History nodes persist an append-path `continuationId`, separate from the changing head: ordinary appends retain the branch identity, while divergent successors and cancellations change it. Older cursors carry head anchors that must remain ancestors of the current streams. The client retains loaded pages and complete groups leaving the live window, deduplicates by record ID, and keeps timeline round DOM keys stable to preserve reading position. If reconnect skips an entire window, it retains the old reading range and exposes a cursor to fill the intervening gap. Rewind-detection lengths describe viewer-filtered streams, never hidden record counts. Forks, rewinds and viewer changes reset pages; request-scope identity rejects late responses even after switching away and back. Branch-invalidated cursors return `history_branch_changed`, prompting a fresh window.

Viewer projection freshness is separate from branch identity: playing a previously private hand card can disclose older events and renumber existing viewer sequences without forking. Each display record carries a cumulative `projectionHash`; `projectionHeads` and page cursors anchor the three filtered streams. Hashes encode only visible record identities and projected values, normalizing identity-based participant names to IDs. Hidden payloads and hidden record counts do not enter these hashes. Ordinary appends and renames preserve existing prefix anchors. A changed prefix returns `history_projection_changed`; the client refreshes its snapshot and automatically refetches the previously loaded range, staging pages until it reaches the prior oldest group rather than issuing an undo notice or discarding the reading range. Refresh scopes reject stale pagination responses, including projection mismatches found while filling reconnect gaps. Timeline event DOM/selection keys use `occurrenceId` when available, including canceled payloads; legacy entries retain their fallback keys. History backfill stays separate from live occurrence-based feedback. These computed anchors are outside persisted Frames and do not rewrite Replay data. Computing them currently traverses the complete visible streams, not just the selected page. Record identity is independent of reusable event sequence numbers. Actor and other participant names are projected from stable identity; renaming no longer rewrites raw historical parameters. Completed Replay continues to use its archived participant names and existing anonymization projection. For the same rule/runtime source, these storage and presentation changes preserve Replay schema, raw Frame Hash chains and immutable Viewer Builds.

Native windowed Room envelopes defer Session-name projection until the final Room-name projection, which falls back to Session names for missing or blank seat names. Full/direct Session and local payloads retain Session-name projection by default; debug keeps raw history names, and prepared Worker payloads retain their existing projection path. When no current or canceled event is hidden, archive projection reuses nonempty packets whose derived fields already match. Output arrays remain fresh, but shared packet records and nested fields must be treated as read-only; projection does not promise deep ownership. Visibility is reevaluated on every call, with no cache across commands.

### 11.3 Game Context, Replay, and Bug Report

This section is a cross-task implementation contract. `room-committer.ts`, `replay-codec.ts`, the seven-table migration, atomic PostgreSQL writes, the Game Context resolver, original-seat active-game recovery, public Replay and Anchor reads, and the immutable Replay Viewer are implemented. A later task supplies the Bug Report module.

```text
server/game/
├── room-committer.ts          only external seam for Durable Room Commit
├── replay-codec.ts            canonical JSON, delta, gzip, and Frame Hash
├── game-context-store.ts      lifecycle resolver
├── replay-store.ts            public manifest, Segment, and Anchor read model
├── replay-viewer-build.ts     Viewer Build integrity checks
└── persistence/
    └── postgres-adapter.ts      atomic Room, Replay, and Result transaction
server/game-context-routes.ts  lifecycle resolver
server/replay-routes.ts        manifest, Segment, Anchor, and Viewer/Asset static reads
server/bug-report-routes.ts    draft, GitHub connection, submit/status, and audit
server/bug-report/
├── bug-report-store.ts        PostgreSQL draft/attempt/claim state machine
└── github-issue-client.ts     sole external GitHub App adapter
```

`RoomCommitter` is a concrete deep module; do not add a one-implementation interface or factory. Its external surface exposes one commit operation returning:

```ts
type RoomCommitResult =
  | { kind: 'committed'; roomVersion: number; stepNo: number; frameHash: string }
  | { kind: 'unchanged' }
  | { kind: 'blocked'; error: string }
```

The main path is:

```text
ClientCommand
  -> room-router: validate seat and payload
  -> GameSession: built-in cards synchronously produce SessionResponse;
     executable Workshop cards return asynchronously from the session Worker
  -> RoomCommitter: serialize once and atomically write Room snapshot plus Replay Step
  -> Broadcaster: after commit, build viewer-filtered envelopes and send them
```

- `resp.ok=false` without `durableTransition` bypasses commit and responds only to the caller. A successful command returns `unchanged` only when both its public Frame Hash and private authoritative session cursor are unchanged and `durableTransition` is not set; a cursor-only transition still persists the Room snapshot and records a Step with a repeated public Frame. `durableTransition` forces a Step, including for a durable rejection that preserves rollback results and failure memory (ADR 0015). Only the submitting socket receives its error; peers receive the same committed version as an error-free snapshot. Reconnect and snapshot refetch create no Step.
- Replay Step has a Room-global monotonic `stepNo`, independent of `roomVersion`. Concurrent players submitting in one interaction still serialize into consecutive Steps. Automatic engine settlement caused by the last submission belongs to that Step. Rule results must not depend on arrival order.
- Step 0 is established before the first interactive command. The classic deal is already in the Frame. Interactive draft, Parent Selection, and explicit multiplayer submissions start at Step 1.
- A terminal Frame also archives authoritative `PlayerScoreSummary[]`. At a `gameOver` Step, historical Viewer reuses the read-only `ScoringPad` to show categories, card bonuses, and totals.
- An exhaustive protocol-boundary switch allowlists Replay Intent. Never store `requestId`, tokens, site `userId`, arbitrary raw WebSocket messages, or unvalidated payloads.
- A write failure freezes the same Frame and Intent, marks the Room blocked, and rejects new game commands. Retry after 1, 2, 5, 10, and 30 seconds, then every 30 seconds. Reconnecting clients wait during the pause and never read uncommitted memory state. The same idempotency key with a different hash permanently blocks and alerts.
- One instance allows at most 30 ordinary in-memory Rooms, counting both waiting and playing but excluding fixed development Rooms. An executable Workshop Room uses a session Worker plus a code Worker and has a separate limit of 15. The process-wide 15-slot accounting includes Worker reservations for WebSocket Rooms, restored Rooms, and HTTP sandboxes. A per-Room FIFO spans session execution through Durable Commit. Room or seat changes on the same connection wait for the in-flight command. Reaching a limit rejects only operations that need another corresponding Room or `newGame`. Built-in-card Rooms create no session Worker. Do not add Room sharding, Redis, or an external queue.

Completed Replay and Bug Report behavior uses ADR 0013's public and private read contract. GitHub submission is recoverable through PostgreSQL drafts, stable `submissionId`, attempt rows, and atomic claims. The production GitHub App client and test fake are the two adapters at the true external seam.

### 11.4 `server/custom-code/`: Isolated execution

```text
server/custom-code/
├── compiler.ts          TypeScript to JavaScript through ts-blank-space and esbuild
├── runtime.ts           sandbox runtime
├── engine.ts            source validation, compilation, and manifest extraction
├── isolate-runner.ts    isolated-vm entry
├── executor-worker.ts   Worker Thread entry
└── client.ts            synchronous main-process to Worker Thread client
```

The main backend stores only `compiled_code + code_manifest`. An executable Workshop card that is not built in gets a `CustomSessionExecutor` in both an HTTP sandbox and a WebSocket community Room. The entire `GameSession` command enters a dedicated Worker; one Room runs FIFO through Durable Commit and different Rooms run in parallel. Later room or seat changes on the same connection also enter the connection FIFO and cannot alter an in-flight command's Room or Replay actor.

The main thread retains only a nonexecuting mirror of the latest successful snapshot for broadcast, persistence, and seat validation. Returned snapshots enter that mirror through a nonsettling restore path, so it never re-probes authoritative continuations without executable card registrations. Inside the Worker, `client.ts` synchronously calls isolated-vm, so `Atomics.wait()` never runs on the HTTP or WebSocket event loop. Before each command, an in-memory checkpoint preserves pending state and undo history. A hook timeout or newly emitted runtime warning, including one from a read-only card query, restores that checkpoint while retaining the diagnostic warning. Worker crash or overall timeout terminates it and rebuilds from the latest successful snapshot. A source-shipped card marked `built_in=1` follows built-in implementation and creates no such Worker. Browser-local Workshop Worker and recovery behavior remain unchanged. The single source of truth for sandbox constraints is [`docs/CUSTOM_CARD_SANDBOX.md`](CUSTOM_CARD_SANDBOX.md), including its `prompt-sync:begin/end` marker blocks, validated by `pnpm run check:prompt-sync`.

### 11.5 HTTP endpoints

`server/game-router.ts` and `server/index.ts` provide:

- `GET /api/health`: health check;
- `GET /api/rooms`: room list;
- `GET /api/game/state`: current snapshot refetch;
- `POST /api/game/new`: new game or test reset. Accepts `seed?: number` plus the same setup payload as WebSocket `createRoom` (player count, draft mode and pool size, community deck with `customCardIds`, and the expansion switches), mapped through `server/game/game-setup-options.ts` so both surfaces agree. This is a debugging and test path — product games, including local hotseat, are authoritative rooms;
- `POST /api/game/load`: load test state;
- `POST /api/game/dev/*`: single-player debugging and E2E setup;
- `POST /api/game/new-sandbox`: create an independent `GameSession` without a WebSocket Room;
- `GET /cards-manifest.json`: card metadata fetched by the main bundle at startup;
- `POST /api/auth/oauth/:provider/start?intent=link`: authenticated GitHub / Google binding start, returning the provider authorization URL with PKCE S256;
- `GET /api/auth/oauth/:provider/callback`: login/registration callback, or a cookie-free binding handoff to `?page=settings` with short-lived state/code (or cancellation) in the URL fragment;
- `POST /api/auth/oauth/:provider/complete`: binding completion in the original frontend cookie partition. It atomically consumes a live binding state matching the current site user and provider before exchanging the code; it never creates a new site session.

`client/app/useAccountLinking.ts` removes handoff fragment fields before submitting once, including during StrictMode effect replay, and refreshes linked identities on success. Errors remain in Settings rather than being normalized into the authenticated homepage. Binding does not widen account OAuth scopes or use the Issue Submission Connection's tokens or encryption keys.

HTTP serves operations, tests, and debugging; it is not the real-time synchronization path. Responses match `SessionResponse`. Validation endpoints are pure and never write authoritative state. Inside a WebSocket Room, development commands should use `ClientCommand`.

Game Context, Replay, and Bug Report are product read and integration APIs, not replacements for WebSocket game synchronization:

```text
GET    /api/v1/game-contexts/:roomId
GET    /api/v1/replays/:roomId/manifest
GET    /api/v1/replays/:roomId/segments/:checkpointStepNo
GET    /api/v1/replays/:roomId/anchors/:stepNo?frame=<sha256>
GET    /api/v1/game-contexts/:roomId/evidence/:stepNo?frame=<sha256>
GET    /replay-viewers/:viewerBuildId/*
GET    /replay-assets/:sha256
POST   /api/v1/game-contexts/:roomId/bug-reports
GET    /api/v1/bug-reports/:submissionId
PATCH  /api/v1/bug-reports/:submissionId
POST   /api/v1/bug-reports/:submissionId/submit
DELETE /api/v1/bug-reports/:submissionId
POST   /api/v1/bug-reports/:submissionId/evidence/inspect
GET    /api/v1/issue-submission-connection
DELETE /api/v1/issue-submission-connection
POST   /api/v1/issue-submission-connection/github/start
GET    /api/v1/issue-submission-connection/github/callback
POST   /api/v1/issue-submission-connection/github/complete
POST   /api/v1/github-app/webhook
```

Public Replay APIs return versioned JSON and never expose PostgreSQL gzip or BLOB encoding. A Segment expands at most one checkpoint chain and verifies every frame hash on the server. An Anchor must exactly match `stepNo + frameHash`. Completed, expired, and removed resolution and public Replay remain outside login. Active descriptors, recovery, Bug Report, temporary evidence, and maintainer forensics enforce ADR 0013's seat or administrator authorization independently. External errors retain ADR 0013's discriminated `{ ok:false, code, lifecycle?, message }` form.

### 11.6 Workshop backend

`server/workshop.ts` and `server/workshop-pr/` provide custom-card upload, compilation, the sandbox and pull-request delivery. See [Platform design](PLATFORM_DESIGN.md) for the full product flow.

- Sandbox settings (`sandbox_settings`, `sandbox_cards`) persist player count, decks and variant flags; `POST /api/game/new-sandbox` passes them to `createInitialState()`.
- Review and publication are two dimensions in `server/workshop-status.ts`: review `unsubmitted / in_review / approved / stale / merged` and publication `live`. A card binds one open, non-draft PR based on `main`, pinned to its head and Design Draft. Only real exact-head approvals from a reviewer with push permission approve a version; publishing re-queries GitHub and requires head, review SHA, approved SHA and pinned version to agree. Any mismatch, close, draft transition, base change or dismissal moves the card to `stale·offline`, and so does a GitHub query failure while processing a webhook or publish. A transient refresh failure right after binding keeps the `in_review` binding, clears the sync time and lets the author retry through `refresh-pr-status`.
- A PR merged into `main` graduates an approved card to read-only `merged`. A merge seen before approval is recorded (`github_pr_status='merged'`) and graduates only after an authorized exact-head approval is reconciled; a PR merged into another base becomes `stale·offline`. A live merged card keeps serving its reviewed snapshot until release, when `markBuiltInMergedCards` lets the built-in definition take over on startup.
- `customCardIds` in a real Room accept only live approved cards through their reviewed snapshot; an author's own non-live card rejects creation with guidance, and every other unloadable ID is filtered silently. Unreviewed code runs only in the Workshop sandbox and never reaches a multiplayer `GameSession`.
- Author `unpublish` lets existing games finish; administrator takedown ends every Room embedding the card without scoring or Replay.
- Submissions use one repository-scoped GitHub App; `workshop_submissions` freezes operation identity and Draft Version before remote writes, branch publication uses expected-head CAS, and generated-file conflicts pause delivery. See the [GitHub App runbook](operations/github-oauth-app-setup.md).
- Workshop draft errors expose a typed `code` from `shared/contract/workshop.ts`.

Tests: `server/__tests__/{workshop-api,workshop-submissions}.test.ts`, `server/workshop-pr/__tests__/`.

### 11.7 Database

`server/db.ts` owns the asynchronous PostgreSQL connection through `pg`. Transactions retain one pool connection across awaits; nested transactions use serialized savepoints. Native PostgreSQL migrations are applied under an advisory lock before startup. Runtime persistence has no SQLite or JSON fallback.

`scripts/import-sqlite.ts` reads a stopped schema-33 SQLite database into a private copy, validates its current format, stages retained resources through private S3, and commits application rows only after exact row/byte comparisons, Room-owned recovery, Replay chain/hash and resource checks pass. It preserves encoded recovery TEXT and Replay BYTEA. It only discards proven unrecorded active games; damaged recorded games block the import. `data_imports` keeps failed imports behind a startup barrier. The independent erasure ledger is merged and applied before validation. `scripts/validate-backup.ts` validates a controlled PostgreSQL/S3 restore; SQLite is only an input tool.

ADR 0014 uses the next available migration to add ten tables. The first production Replay is `schemaVersion=1`; no unreleased experimental format is retained:

| Table | Facts owned |
|---|---|
| `game_contexts` | Permanent `roomId`, `active/completed/expired/removed`, phase, `available/legacy_no_replay`, expiry, and Tombstone reason |
| `game_context_participants` | Seat-to-site-user associations captured before an active Room is removed; account deletion nulls the foreign key for anonymous-seat evidence projection, and evidence cleanup removes the row |
| `game_replays` | `schemaVersion`, `viewerBuildId`, `gameBuildId`, recording or completed state, latest Step, `missingPrefix`, and custom-card snapshot |
| `game_replay_steps` | `roomId + stepNo`, `roomVersion`, `checkpointStepNo`, actor seat, allowlisted intent, payload kind or gzip, and Frame Hash |
| `issue_submission_connections` | Numeric GitHub user ID, AES-256-GCM token and refresh token, nonce and tag, `keyId`, expiry, and revocation state |
| `account_deletion_requests` | Submitted deletion request, next external cleanup time, and last error; the account is disabled first and a failed GitHub cleanup retries in background |
| `github_grant_revocations` | Encrypted GitHub grants awaiting retry after a deletion race or temporary failure |
| `bug_reports` | Stable `submissionId`, Reporter association, Anchor, draft, author choice, delivery state, Issue number and URL, and evidence expiry |
| `bug_report_attempts` | Thirty-day delivery, reconciliation, and rate-limit attempt metadata; never token, symptom copy, or raw GitHub response |
| `bug_report_evidence_audit` | Permanent maintainer identity, time, Anchor, perspective, and nonempty reason |

The following tables remain in use:

- `rooms` and `room_players` for active recovery snapshots and site-seat ownership;
- `game_results` and `game_result_players` for completed scalar results, Replay Participant names, and internal user associations;
- `oauth_states`, extended with an encrypted Bug Report PKCE verifier under its existing short-lived state and `returnTo` lifecycle. Account binding uses the separate server-only `account_pkce_verifier` column, valid for ten minutes and cleared on consumption; no new deployment secret is needed.

Do not add Replay Segment, Reported Evidence payload, quota-counter, or webhook-delivery tables. `checkpointStepNo` represents Segments. `bug_reports.evidence_expires_at` protects a shared Segment only while the Context is incomplete; normal completion switches to the permanent Replay Archive. Report and attempt rows answer quotas and the sitewide GitHub sending window of 20 requests per minute. Revocation webhook operations are intrinsically idempotent.

Migration must idempotently backfill existing data. `rooms` become active `game_contexts`; `game_results` become completed contexts; if one `roomId` exists in both, completed wins. A game completed before launch is marked `legacy_no_replay` and gets no `game_replays` header, Replay Frame, `schemaVersion`, or `viewerBuildId`. Its completed descriptor still returns the Game Result Archive summary; manifest and Segment exist only when `replayStatus=available`. Therefore an ID is `unknown_context` only when absent from both existing sources.

### 11.8 GitHub delivery, security, and deletion

- On draft creation, the server confirms that Reporter owns an original seat in active `room_players` or completed `game_result_players`, and freezes `roomId + stepNo + frameHash`. The trimmed symptom must contain 1 to 2,000 Unicode characters; there is no grammar or sentence-ending test. One user may retain at most five reports that are not discarded and have no known Issue number.
- The production `github-issue-client` accepts only server-configured Repository ID and Installation ID, never client owner, repository, labels, or URL. Every GitHub request has a 15-second timeout. Marker reconciliation accepts only an Issue created by the configured GitHub App, no earlier than its delivery attempt, and ending uniquely with the expected marker. The fake adapter covers success, 401, permission 403, rate-limit 403 or 429, 410 or 422, network errors, 5xx, and reconciliation after an uncertain response.
- Self-authored submission uses an encrypted GitHub App user token and requires confirmation that the public GitHub author identity cannot be anonymized by deleting the site account. The report persists the confirmed numeric GitHub user ID. Queueing and delivery reject silent account switching; the user must reconfirm after a change. Hosted Issue Identity uses an in-memory installation token. An invalid connection never changes author automatically. Token and refresh token use AES-256-GCM with per-row nonce and tag plus `keyId`. The PKCE verifier is encrypted and lives only until OAuth-state expiry. Each user retains one live Bug Report state. GitHub callback puts only state and code in the frontend URL fragment. After returning to the original top-level context, the frontend calls complete with a partitioned session; only then does the server consume state for the current site user and exchange the token.
- The PostgreSQL executor atomically claims one `submissionId`. After an uncertain response, it reconciles by the stable body marker before retrying. Retry and rate limiting follow ADR 0012. The client polls only site status and never GitHub directly.
- The Bug Report footer requests connection status for the current `roomId`. New-report entry is enabled only when the user is an original participant and the Room has at least one Replay Step. From an unauthenticated completed game, login preserves the current Replay Anchor. A saved draft remains recoverable or discardable after its associated active game expires or is removed. Waiting, unrecorded, and legacy-no-replay games return explicit anchor-unavailable states rather than pretending the user is not a participant.
- Issue title is a sanitized and truncated `Game bug: <first symptom line>`. Body contains no screenshot, log, Frame payload, other-player identity, or hidden information. Creation, marker reconciliation, account-deletion anonymization, and Issue webhooks share the fixed public target `titanxxh/open-agricola`. Its `bug-report-triage.yml` workflow adds `needs-triage` to in-game reports when the submitting identity cannot set labels; notifications rely on native GitHub watching.
- Explicit disconnect deletes tokens immediately. An account with only local unsubmitted drafts may delete those drafts and the account directly. If it has a connection, public Issue, or report already in delivery, account deletion first persists `deletion_pending`, signs out every session, and disables the local connection; the same installation adapter then edits known Issue bodies, retrying in background on failure. A discarded but previously submitted report with unknown Issue number reconciles by marker first. A GitHub `issues.deleted` webhook completes cleanup for a deleted Issue. Final internal association is cleared only after GitHub confirms that the body no longer contains the site user ID.
- Full maintainer evidence reads require a nonempty reason and append `bug_report_evidence_audit`; the audit stores a maintainer identity snapshot unaffected by account-foreign-key deletion. Each maintainer may read at most 30 times per hour. Before returning evidence, the server reapplies the current Participant tombstone projection. Evidence that expired before launch without a seat snapshot treats every seat as anonymized.
- Before `server/game/replay-removal.ts` deletes payloads, anonymizes or erases Results, and marks Contexts removed, it conditionally appends the entire versioned batch to `erasure/ledger.json` in private S3 storage. ETag compare-and-swap prevents concurrent removers from losing entries. This ledger is independent of PostgreSQL backups and must never be overwritten by an older restore. Startup and recovery tooling validate and idempotently apply it, including forbidden references discovered in old backups. Malformed ledger content blocks restoration. Resource reads and uploads also consult its permanent hash deny rules before returning data or accepting the same content again. Shared ordinary resources are retained while any durable reference remains; forbidden resources establish a catalog barrier and are deleted even if referenced. Unrelated corrupt Replay metadata does not block tombstones, but prevents unproven ordinary cleanup. Version one has no administration UI.
- Public resolver, manifest, and Segment endpoints have independent per-IP read quotas and response-size caps. Active evidence, Bug Report, and maintainer endpoints are rate-limited by account. Logs must never contain tokens, Frame payloads, symptom text, or raw GitHub responses.

### 11.9 Deployment, rollback, and observability

PostgreSQL stores platform data and the shared upload/reference catalog. A private S3 bucket stores these keys; application images contain no authoritative resource files:

```text
card-art/<filename>             original Workshop upload; public URL unchanged
replay-viewers/<viewerBuildId>/ immutable historical Viewer code Build
replay-assets/<sha256>          content-addressed Replay Card Snapshot assets
erasure/ledger.json             independent deletion ledger; never restore backward
```

`server/storage/` owns the S3 protocol, staged uploads, references, integrity checks, and cleanup claims. Upload intent is durable before writing S3. New uploads retain a 24-hour unreferenced grace period. Workshop drafts and immutable versions maintain references in their own PostgreSQL transaction. Replay preparation adds a durable reference before the frozen initial commit; that commit transfers it to the Replay atomically. Preparation references are released only after explicit retirement or shared cleanup proves there is no Room, Replay, live owner, allocation or unexpired pending command. Expired command scopes and abandoned allocation rows are collected periodically; an unknown scope never regains authority. Collectors lock resource rows, claim deletions, and reject new references while deletion is in progress. Only one claimant can delete an object, and another executor can resume an expired claim. Immutable Viewer references retain every published file.

Local dependencies run PostgreSQL and the ARM64 S3-compatible service in persistent Docker volumes. `restart-local.sh` generates untracked local credentials, builds the Viewer, uploads its exact manifest/files, and starts the app after publication. Tests use a separate database and bucket with a unique schema/object prefix. A managed S3 endpoint uses this same protocol; switching endpoints requires explicit data transfer and validation.

The complete target configuration is:

```text
DATABASE_URL
S3_ENDPOINT
S3_BUCKET
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
REPLAY_VIEWER_BUILD_ID
REPLAY_TRUST_PROXY
GAME_BUILD_ID
BUG_REPORTS_ENABLED
BUG_REPORT_GITHUB_APP_ID
BUG_REPORT_GITHUB_CLIENT_ID
BUG_REPORT_GITHUB_CLIENT_SECRET
BUG_REPORT_GITHUB_PRIVATE_KEY
BUG_REPORT_GITHUB_WEBHOOK_SECRET
BUG_REPORT_GITHUB_INSTALLATION_ID
BUG_REPORT_GITHUB_REPOSITORY_ID
BUG_REPORT_TOKEN_ENCRYPTION_KEYS
BUG_REPORT_TOKEN_ACTIVE_KEY_ID
```

Durable Room Commit requires PostgreSQL, shared resources, `REPLAY_VIEWER_BUILD_ID`, and `GAME_BUILD_ID`. Recording is mandatory. Room creation freezes both Build IDs and its custom-card runtime snapshot. An unpublished custom card requires explicit player consent to permanent publication. Viewer Build ID is the SHA-256 of the complete `manifest.json`, which fixes the `index.html` entry and every file's SHA-256. A Build stores only Viewer code, styles, and card manifest. Board art, card art, and fonts share the main site's current asset-repository GitHub Pages source and are not archived. Builds validate the deployed Pages version/manifest against `public-assets.ref`; runtime URLs use that version as a cache key, not a historical snapshot. Replay CSP allows the asset site's Pages path for images and fonts. The former raw asset-repository path remains permitted for existing rooms' immutable Viewers; new builds use only Pages URLs. Room creation fails when Build validation fails.

Before Step 0, custom-card artwork is copied into content-addressed S3 storage and the Replay header receives its immutable application URL. Waiting Rooms reject game writes until Step 0 exists. Unfinished expiry and Bug Report evidence retention retain their existing transaction boundaries; hourly shared collection removes eligible unreferenced objects. Missing recorded prefixes block recovery. Explicitly unrecorded active Rooms are discarded through Game Context lifecycle; no replacement prefix is invented.

Deployment uses a controlled maintenance window: publish and validate the Viewer, migrate persistent data and resources, apply the independent erasure ledger, validate target-build restoration, then resume application traffic. Preserve historical Viewer bytes and the existing public origin/OAuth callback URLs. GitHub App configuration is required only for its optional product features. See `HOW_TO_DEPLOY.md` for deployment commands.

After recording is enabled, the application may roll back only to a recorder-compatible build supporting every active Room `schemaVersion`; it cannot roll back to a backend predating the feature. The Viewer Build must exist before the backend freezes its ID into a new Room. Missing Viewer, unwritable persistence, or the 30-Room capacity limit makes readiness degraded and rejects new Rooms without sacrificing existing ones.

Version one adds no metrics backend. Structured logs and health state must expose at least ordinary Room count, capacity rejection, Durable Room Commit latency, errors, and retries, blocked Room count, hash collisions, Replay payload size and corruption, GitHub queue, attempts, and rate limits, and missing Viewer Build. Log fields contain only stable IDs and numbers, never protected payloads.

#### Platform operations observations

`server/observability/` owns bounded numeric metrics, collection, the administrator gateway and overview health. It has no rule/state writer. `Broadcaster` observes the existing encoded send once per recipient; `stateUpdate` rounds come from that envelope's returned state, including undo/recovery. Rounds are `1`–`14`, `pregame` (draft/parent selection), `postgame` (gameOver/playing round 15), `none` and `unknown`. An unrelated event uses the captured Room/command context. Never tag metrics with Room, account, command/request identity, card, payload or exception text.

Monotonic command duration spans parsed dispatch, queue wait, receipt/ownership checks, Session execution, durable commit and local publication. First correlated response is a separate measurement; a pending receipt is not completion. The commit boundary remains durable-before-publication, including frozen retries. Projection, JSON encoding and `ws.send` enqueue are separate overlapping stages; enqueue is not network delivery or client rendering. Metrics failures cannot change a game outcome. Default process metrics include CPU, RSS/heap, event-loop lag and GC; Worker wall time is not Worker CPU.

A private Prometheus scraper uses bearer-authenticated ingress discovery and per-instance forwarding because application ports bind loopback inside the app container. Stable port/slot labels survive process identity changes; PromQL handles counter resets and merges histogram buckets before calculating percentiles. The ingress owns global lease/epoch-aware Room aggregates and distinct online users from expiring private presence rows; application processes expose local connections, queues, Workers and persistence health. Collection updates operational presence only, never game state. No snapshot/history is traversed to collect platform gauges.

Grafana uses only aggregate Prometheus data. Every `/ops/` resource and query passes current site-session and `ADMIN_USERS` validation. A 30-second, atomic one-use handoff installs an HttpOnly dashboard cookie linked to the original session; deletion, expiry and permission changes take effect on the next request. The proxy drops supplied credentials/auth headers, supplies a reversible ASCII-encoded site username and Viewer role, and allows GET/HEAD plus the read-only datasource query POST. Grafana login tokens, anonymous/basic login, public dashboards, editing and Live are disabled; private service ports are not published in production. See [deployment operations](HOW_TO_DEPLOY.md#operations-monitoring) for the metric catalog and freshness limits.

The browser sends 10% sampled, finite, rate-limited batches of command RTT, first-snapshot readiness and snapshot-to-React-layout-commit duration. Both endpoints use the same browser monotonic clock; no cross-clock subtraction or browser-paint claim is made. Samples contain numeric duration, finite kind/outcome and round only, and remain untrusted observational input.

---

## 12. `client/`: Frontend

### 12.1 Client bundle boundaries

| Bundle | Entry | Paths | Constraint |
|---|---|---|---|
| `client-app` | `client/main.tsx` | `client/{app,components,services,hooks,contexts,utils}/` | Uses WebSocket. From `shared/*`, imports only `contract`, `domain`, and `i18n`. Card display uses manifest-backed `card-meta` plus `custom-card-metadata`. |
| `client-sandbox` | `client/sandbox/index.tsx` | `client/sandbox/` | Lazy-loads Workshop sandbox UI; rules still execute through the backend sandbox path. Permissions apply only to the exact entry and files in `scripts/architecture-policy.mjs`; the directory has no blanket exemption. |
| `local-sandbox-worker` | lazily created `client/local-sandbox/worker.ts` | `client/local-sandbox/` | Browser-mode engine Worker for Workshop playtesting. Its four Worker-side files may import complete `shared/*` through exact file permissions. Main-bundle `local-transport`, `persistence`, and `workshop-launch` use type-only shared imports, keeping the engine out of the main bundle. |
| `replay-viewer` | `replay-viewer/src/main.tsx` | `replay-viewer/` | Has no login, cookies, WebSocket, or command sending. It reads only public Replay JSON and reuses display filtering and board projection compiled at archive time. |

Strict main-bundle budgets in `scripts/check-bundle-size.ts` are 550 KB raw and 170 KB gzip.

### 12.2 Service layer under `client/services/`

- `gameTransport.ts`: `WsGameTransport` manages the WebSocket connection in the service layer, not React Context. URL switches include `?transport=ws`, `?player=p1|p2`, and `?room=devN`.
- `card-meta.ts`: fetches card metadata from `GET /cards-manifest.json` at startup. The `CUSTOM_*` overlay reads only `shared/cards/custom-card-metadata.ts`.
- `rehydrate.ts`: a lightweight rehydrator that skips `ActionSpace.onTaken` callbacks and breaks dependency chains into `shared/actions` and `shared/cards/catalog`.
- `llm/generation/`: the browser owns `GenerationAttempt`, immutable request construction, provider tool protocol, bounded GitHub reads and complete-source results. The LLM credential goes only to the configured provider; neither the game backend nor GitHub receives it. Each attempt resolves current GitHub main and pins subsequent reads to that SHA; a missing file returns a tool error so the model can choose another reference at the same SHA. Network/rate-limit failures pause for explicit retry. `server/workshop-references.ts` serves authenticated Workshop reads of latest main and fixed-commit tree metadata using project GitHub credentials; it accepts no caller URLs or model credentials. PostgreSQL shares per-user/global request budgets, upstream cooldowns and one-hour main-confirmed commit authorization across instances (see Platform C1.2). Retrying initialization preserves the confirmed SHA. The browser still fetches pinned raw text anonymously and verifies blob hashes. Source references are independent of the site release.
- `GET /api/workshop/sandbox-contract` returns the deployed runtime's hooks, actions, helper bodies, semantics and content identity from `server/workshop-sandbox-contract.ts`. This includes the validator's required literal object/array structure and inline listener functions. It serves no reference corpus. The short generation prompt includes that contract; on-demand GitHub documentation and built-in examples cannot expand it. `POST /api/workshop/cards/validate-code` binds validation to source and sandbox identities. Only separately verified provider/endpoint/model tuples are admitted.
- `WorkshopAbilityPanel` applies results through the draft reducer: follow-ups use the selected candidate, playtest repair uses the tested source, and raw cost/prerequisite requirements remain part of the frozen input. Editing ability input or switching model configuration cancels the old attempt and prevents late adoption or repair. The last valid candidate survives failed/manual edits. Visible messages and compact provenance are projected for recovery; raw tool/reasoning/signature records stay in page memory. Full request, recovery and acceptance contracts are in `docs/PLATFORM_DESIGN.md` and `docs/test/llm-card-gen.md`.

### 12.3 Synchronized state layer

- `client/hooks/useGameSync.ts` hydrates the server snapshot and holds `state`, `pending`, `interaction`, and `scores`, replacing them as a unit.
- A `stateUpdate` is processed as `normalizeState()`, `createActionSpaces()`, overlay server `resources` and `takenBy` on template fields, then replace the store.
- The frontend makes no optimistic commits. A click sends a command and UI state changes only after `stateUpdate` arrives.
- Local ephemeral UI state such as hover, draft selection, and input fields is separate. On a new snapshot, invalid local selection is cleared.
- Reconnect follows `socket reconnect -> joinRoom -> roomJoined(status, players, maxPlayers)`. `waiting` restores the waiting page; only `playing` continues to `getState -> stateUpdate -> full replacement`. When `newGame` returns connected players to waiting because seats are absent, the server broadcasts `roomWaiting(roomId, players, maxPlayers)` and the frontend immediately hides the old board and restores the waiting page.

### 12.4 View orchestration

`client/app/GameContainerApi.tsx`, with inline `useTransportSetup` connection management, plus `LobbyPage.tsx` and `PageRouter.tsx`. It derives window interactivity from `viewPlayerId` and `playerIndex` and owns local ephemeral state.

### 12.5 Browser-local playtest sandbox under `client/local-sandbox/`

With `VITE_SANDBOX_EXECUTOR=browser`, Workshop playtesting runs entirely in the browser without server participation. The default remains backend `POST /api/game/new-sandbox`.

- Startup: `WorkshopPage` assembles `LocalGameConfig`, including card JSON, source, and sandbox settings, and writes it to sessionStorage. An embedded iframe uses `?localSandbox=1`. `useTransportSetup` creates `LocalGameTransport`, which implements the complete `GameTransport` interface and enters `useGameSync` exactly like HTTP or WebSocket transport.
- Engine Worker: `LocalSandboxCore` assembles shared `GameCore`, registering custom implementation through `registerCustomCardImpl` and `registerBrowserBackedCustomCard`. Card code passes shared AST validation and local `ts.transpileModule`; TypeScript exists only in the Worker chunk. `new Function` invokes it synchronously. `server/__tests__/local-sandbox-parity.test.ts` locks behavior to the server isolated-vm executor. Snapshot assembly reuses `shared/session/sync-payload.ts`, the same function as `GameSession.buildSyncPayload`. Local mode defaults to a `debug` view, matching anonymous backend sandbox HTTP behavior.
- Infinite-loop recovery: after a ten-second request timeout, terminate and rebuild the Worker, restore the latest persisted snapshot including `engineStackCursor`, keep pending interaction alive, and tell the UI it rolled back.
- Persistence: one IndexedDB slot with debounced writes through `onPersist`. Entering playtest offers to continue the previous game. A mismatched schema or corrupt save is silently deleted; old-save compatibility is not maintained.
- Known boundary: a playtest pinned to the editor's exact draft version through `exactVersionId` still uses the backend sandbox because that card data is absent from Workshop frontend state.

`ActionBoard` calls `getBoardPlayerCount(players)` to set `action-board--{n}p`: 830 px for two players and 1,000 px for three or four.

### 12.6 Contexts

- `AuthContext`: site-login session by password, GitHub, or Google. It does not store Bug Issue write authorization.
- `LocaleContext`: locale switching.

### 12.7 Three-layer ESLint enforcement

Important rules in `eslint.config.js` are:

- `client/{app,components,services,hooks,contexts,utils}/**` cannot import `shared/session`, `shared/engine`, Card Sources, generated card catalog, or per-card implementations. UI metadata must use `public/cards-manifest.json` and `client/services/card-meta`.
- Privileged entries and Worker-side files are explicitly named in `scripts/architecture-policy.mjs`; ordinary pages and Replay Viewer have no rule-runtime exceptions.
- TypeScript resolution normalizes relative import paths; runtime graph checks reject nonliteral dependencies, production imports into excluded source files, missing source roots, parse errors, and stale permissions. Module URLs must name an authorized entry; Vite closure checks retain virtual-module edges.
- `package.json` declares `sideEffects` as the bundler tree-shaking baseline.
- A violation is a CI error.

### 12.8 Game Context, Replay Viewer, and Bug Report seam

Startup becomes:

```text
GameContextRouter
  ├─ active -> AuthProvider -> existing PageRouter / GameContainerApi plus optional read-only Anchor drawer
  ├─ completed -> ReplayShell -> credentialless Replay Viewer iframe
  ├─ expired with retained Anchor -> credentialless historical Viewer for one-frame evidence
  ├─ expired -> Expired Game Context page
  └─ removed -> Replay Tombstone page
```

- `?context=<roomId>` is parsed before the current card manifest and global login gate. Active unauthenticated flow preserves complete `returnTo`; completed, expired, and removed contexts load no authentication dependency.
- Active recovery keeps the existing WebSocket, but `joinRoom` carries `intent:'resume'`. The server restores only the original seat through persisted site `userId -> playerIndex`. During a save pause, every online seat sees the same status and new-command controls are disabled.
- `ReplayShell` validates the Replay header and content-addressed Viewer manifest, selects `viewerBuildId`, and creates a `credentialless`, `sandbox="allow-scripts"` iframe only after perspective selection. The historical Viewer is an independent read-only bundle with no login, cookies, WebSocket, or ClientCommand. It reads public JSON Segments and switches among `p1...pN | open` using filtering code compiled at archive time.
- For retained evidence, the parent authenticates with the site cookie and projects the original seat, then sends the single Frame and Replay-header custom-card snapshot through `postMessage` to a historical Viewer with a validated `viewerBuildId`. The Viewer does not call authenticated APIs.
- Opening a completed game without a perspective requires seat or open selection before any Frame is shown. Desktop automatic layout defaults to a timeline-first split; mobile defaults to board-first. The automatic breakpoint is 900 px. A manual layout writes to the URL and overrides the responsive default. The "Evidence for this step" panel always shows Step, round, actor, allowlisted intent, and Frame Hash.
- Playback starts at Step 0 and supports play or pause, previous and next, slider seeking, and keyboard control. A corrupt Segment marks an unavailable interval and can resume at the next checkpoint; it is never silently repaired.
- Bug Report uses the finalized three-step footer: required symptom, automatic context, and author identity. A server draft must be saved before starting GitHub OAuth. Cancelling authorization returns to the same `submissionId`; after submission, status is polled. If the submission response is lost, immediately reread authoritative status and resume polling. A successful report cannot be created twice.
- An active Reporter anchors the latest committed Step. A completed-game Reporter must be an original participant and anchors the currently displayed Step. The public Issue embeds no Frame, screenshot, log, or other player's hidden information.
- Issue Submission Connection is separate from `AuthContext`. The report footer owns initial connection; Settings shows status and disconnect only. An invalid connection never switches to Hosted Issue Identity automatically.

---

## 13. Testing strategy

### 13.1 Three layers

| Layer | Directory | Purpose | Required on a main PR |
|---|---|---|---|
| Unit | `shared/**/__tests__/*.test.ts` and `client/**/__tests__/*.test.ts` | Pure domain logic using mock state and direct function calls | Yes, in fast projects |
| Session | `server/__tests__/*.test.ts` | Instantiate `GameSession`, call `takeAction`, and assert `resp.state`, `pending`, `interaction`, and `ok` | Yes, in slow project; one card per `[A-E][0-9]*-session.test.ts` file |
| E2E | `e2e-tests/*.spec.ts` | Playwright with two browser windows for multiplayer paths | Manual or workflow |

#### Authoritative display projections

`serializeState` derives `lockedFarmTileKeys`, `playerPanelSummary`, and `moorSpecialActionAvailability` on each serialized player. Sync and persistence activate the owning Session context before executing hooks. Live UI, local-worker UI, and Replay read these snapshot-only values; rehydration removes them from authoritative PlayerState. Pure perspective filtering lives in `shared/projections/serialized-state.ts` and does not import rule runtime. Existing historical Replay Viewer builds and payloads remain immutable; new fields are additive and new Viewer builds consume them.

Action definitions are assembled once in `shared/actions/index.ts`. Seasonal internal actions capture the complete resolver during construction; recursive replacement, alternative and before-flow doability still resolve base, internal, and ad-hoc actions. Major metadata queries, gain configuration, navigation and LLM streaming have independent modules to avoid reverse imports.

#### Architecture fitness coverage

`pnpm run check:architecture` executes the architecture scripts, contract type checks, existing contract tests through `check:architecture-tests`, and strict sandbox prompt/documentation synchronization. The contract test selection covers effects, resource provenance, event mapping, interaction commands, Card Source, PromptKey, rendered LLM prompt contracts, CI wiring, and the listener purity guard (positive and negative cases plus a two-player Session). These tests retain their existing Vitest project ownership and also run under `pnpm test` / `pnpm test:fast`. Bundle size budgets remain a separate post-build check; browser dependency isolation is enforced by the architecture entry itself.

Architecture checks should stay as simple as possible. Their purpose is to catch common architecture mistakes in code written by agents and developers, not to defend against deliberately constructed bypasses or prove arbitrary JavaScript safe. Prefer source discovery, file lists, import boundaries, and small local syntax checks. Keep each diagnostic actionable and keep maintenance cost proportional to the real mistake it prevents. Runtime security boundaries and behavioral tests remain separate responsibilities.

For the legacy log and effect scanners, this means:

- Reuse `scripts/source-files.ts` to discover and parse every supported source extension. Each required log root (`shared`, `server`, `scripts`) must exist and contain source. Missing or empty roots, parse errors, and unsupported filesystem entries fail rather than appearing clean.
- Keep the existing log-write detection rules. Record the reason for each named production exemption and require it to match a write recognized by those rules. Removed files, renamed functions, or removed writes make an exemption stale. A hit is a maintenance check, not proof of the exempt function's semantics.
- Keep the effect allowlist limited to top-level production files and reuse the checker in the architecture test. Do not introduce fixed lists for `internal/` or test directories.
- Do not expand this coverage fix with symbol/dataflow engines, complex alias propagation, callback or subclass analysis, or a catalogue of `bind`/`call`/`apply` and dynamic-import bypasses. Tests cover the supported ordinary forms, real repository examples, and scanner failures; they are not an adversarial language-feature suite. Review findings outside this contract require a concrete common repository use case before expanding the checker.

| Invariant | Executable coverage | Boundary |
|---|---|---|
| Physical `shared` / `server` / `client` layering | ESLint `architecture/imports` errors | Tests have explicit exemptions; this checks imports, not runtime ownership. |
| Card Source scope and cross-card references | `pnpm run check:card-impl-boundaries` | TypeScript AST checks production Card Source files and same-file card-ID literals or top-level const aliases. `Major_*`, `reaches`, purchase candidates, and prerequisite candidates are explicit exceptions. It does not follow cross-file dataflow. Empty or mismatched source scope fails. |
| Runtime dependency cycles | `pnpm run check:dependencies` | Every runtime SCC, including self-cycles and literal dynamic-import cycles, fails. There is no cycle baseline. Explicit type-only declarations erase; inline type specifiers still load a module under verbatimModuleSyntax. Any other top-level directory holding sources is an `unclassified source root`, except untracked directories that `git check-ignore` reports as ignored (`.gitignore`, `.git/info/exclude`); tracked directories always count. |
| Browser and Replay isolation | `pnpm run check:browser-boundaries` | Checks transitive closures from both production entries using the source graph and real Vite module graphs. Metadata permissions are exact files with reasons; new Worker entries and unauthorized sandbox imports fail. Missing entry evidence fails. |
| Compile-time architecture contracts | `pnpm run check:architecture-types` | `tsconfig.architecture.json` runs a real no-emit TypeScript program over policy and checker tests, including positive and negative type assertions. Vitest alone is not type evidence. |
| Scan completeness | direct session log, effect-file list, no-DSL, test-project coverage, Card Source and field-boundary checks | Required roots and parseable sources are mandatory. Card declarations and all registered implementations are independently compared; major files may declare multiple cards. Parents use their separate metadata/runtime model. |
| Trailing listener snapshots | `pnpm run check:card-impl-boundaries` | Handlers are enumerated from resolved `ALL_CARD_IMPLS`, whose IDs must match every production Card Source declaring `impl`. Direct `improvements` / `minorPlayed` / `occupationPlayed` length reads fail in `immediatelyAfter` and `after`; non-trailing reads and membership checks remain valid. The check parses the resolved handler body only and does not follow helper calls or derived values. Empty, incomplete, or unparseable runtime scope fails. Runtime diagnostics identify the card and listener without claiming an original source line. |
| Listener state purity | Runtime guard installed by Vitest setup in every listener-dispatching project, plus `pnpm run check:card-impl-boundaries` | The guard wraps every `executeCardListener` / `invokeCardCostCandidateTransform` call, and every loaded Card Impl listener function in place, with deep read-only proxies (including descriptor and `eventQuery` results) and fails on any write or returned live reference; it proves only executed branches. The static scan parses every resolved handler and cost-candidate transform for explicit writes rooted in the context parameter, following same-function aliases only. Neither follows cross-file dataflow; no whole-program mutation proof is claimed. Contract tests: `shared/cards/__tests__/listener-purity-guard.test.ts`, `server/__tests__/listener-purity-gate-session.test.ts`. |
| Generated catalog matches Card Sources | `pnpm run check:generated-cards-sync` | Structural source/catalog equality without a hard-coded card count. |
| `GameSession` owns the server command boundary | `CONTEXT.md`, ADR-0014, review, and three-layer import errors | This is ownership, not a claim that only one source file contains assignments. No whole-program mutation proof is attempted. |
| Canonical architecture wiring | `pnpm run check:architecture` and `scripts/__tests__/ci-card-impl-boundaries.test.ts` | Both CI workflows call the aggregator once. Public main PR/push events run automatically; private automatic jobs are skipped and trusted local full CI remains required. Manual dispatch is preserved. Required GitHub checks follow the verified activation sequence in `docs/operations/ci-checks.md`. |

`vitest.config` has several fast subprojects, `fast-shared`, `fast-cards`, `fast-card-runtime`, `fast-client`, `fast-server`, `fast-scripts`, and `fast-tests`, plus `slow` and `llm`. `pnpm test:fast` first runs `check:test-project-coverage`, independently discovering repository tests and checking that each belongs to exactly one fast, slow, or LLM project. CI defaults to `pnpm test:fast`; use `pnpm test:slow` for per-card session tests, `pnpm run test:e2e` with frontend and backend running, and `pnpm exec vitest run <file>` for one file.

### 13.2 Backend-boundary test entry points

- Call `GameSession` methods directly; this is preferred.
- Call `/api/game/*` or send WebSocket messages for a black-box contract.
- Follow [`docs/CARD_TEST_TEMPLATE.md`](CARD_TEST_TEMPLATE.md), using a two-player game by default.

Recommended assertion targets are:

```text
state.players[n].resources
state.players[n].minorPlayed / occupationPlayed / improvements
state.players[n].cardStates
state.actionSpaces[*].takenBy / resources
pending / interaction
log
scores
```

Do not use DOM shape, button copy, or page structure as the primary proof of rules correctness. Test frontend rendering separately with E2E.
