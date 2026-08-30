# Open Agricola Architecture

[English](ARCHITECTURE.md) | [中文](ARCHITECTURE_zh.md)

> Canonical description of the architecture currently implemented on `main`.
> This document replaces the historical `ENGINE_ARCHITECTURE.md` and `ENGINE_NEW_ARCHITECTURE.md` files.

---

## 1. Design Goals and Invariants

The primary path is **WebSocket room gameplay + backend authority + passive frontend rendering**. HTTP is limited to startup, debugging, operations, and test support.

Violating any invariant below is an architecture bug:

- **Sole backend owner:** `GameSession` in `server/game/authoritative-session.ts` is the only server command entry and owns `GameState`; mutations execute in the `GameCore` and action leaves it drives.
- **Full snapshots:** every client in a room receives the same `stateUpdate`; the frontend does not apply partial patches.
- **Weak client:** the frontend renders, collects input, and manages temporary local UI state. It never adjudicates rules.
- **Command-driven:** the frontend sends intent. The backend validates, executes, commits state, produces logs, and broadcasts.
- **One domain implementation:** actions, engine, cards, rounds, harvest, and scoring live in `shared/` and are reused by both frontend and backend.
- **Physical three-layer boundary:** ESLint `no-restricted-imports` enforces `shared/` ⇄ `server/` ⇄ `client/` as CI errors.
- **Card-local closure:** card effects stay in their card files instead of spreading into core paths.
- **Supply tokens are payment resources:** player supply limits such as fences and stables must not be hard-coded as 15 or 4. Read them through supply-token helpers or the payment-resource pipeline.

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
  ├─ sqlite-adapter.ts   (PERSIST_ROOMS=sqlite, default, data/open-agricola.db)
  ├─ json-adapter.ts     (PERSIST_ROOMS=json, output/<roomId>.json)
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
│   └── persistence/     SQLite, JSON, and memory adapters
├── game-router.ts       HTTP /api/* routes
├── auth.ts              GitHub OAuth
├── workshop.ts          Workshop and Sandbox backend
├── workshop-pr/         Workshop pull-request integration
├── custom-code/         Isolated execution: compiler, runtime, executor-worker
├── payload-validation.ts  Pure validation; never writes state
└── db.ts                SQLite connection

client/        Browser React UI with two bundles
├── app/                 Top-level routing and pages: GameContainerApi, LobbyPage, ...
├── components/          board/, interaction/, common/, header/
├── contexts/            AuthContext, LocaleContext
├── hooks/               useGameSync, useFarmSelection, ...
├── services/            gameTransport, card-meta, rehydrate, llmPrompts
├── sandbox/             Offline hot-seat client in a separate bundle
└── types/, utils/, styles/, assets/, config.ts, main.tsx

e2e-tests/     Playwright browser tests
```

`eslint.config.js` enforces the three layers:

- `client/{app,components,services,hooks,contexts,utils}/**` cannot import `shared/session`, `shared/engine`, Card Source, generated card catalogs, or per-card implementation modules. UI metadata must come from `public/cards-manifest.json` through `client/services/card-meta`.
- `client/sandbox/**` has full access.
- Additional `no-restricted-syntax` rules prevent literal dynamic imports of `shared/session/...`, `shared/engine/...`, and card implementation bootstrap modules.
- Every violation is a CI error.

---

## 4. `shared/contract/`: Protocol Layer

Its only purpose is to centralize shapes needed by the frontend, backend, and sandbox. The main frontend bundle may read only `shared/contract/`, `shared/i18n/`, `shared/domain/`, and manifest-backed `client/services/card-meta`; other shared modules do not enter that bundle.

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
  gameSeed: number,
  availableMajorImprovements: string[],
  futureMeeples, pendingFutureMeeples,
  workPhaseObtainedResources: Record<string, Partial<Resource>>,
  completedFeedingPhases: number,
}
```

`actionSpaces[*].takenBy` is a `WorkerRef[]`. An ordinary reference contains only `playerId` and `workerId`. Linked occupancy created by a card may additionally contain `synthetic: { kind: 'linked-occupancy', sourceCard, linkedWorkerId }`. Cleanup can then use semantic metadata stored on the action-space state instead of reading another card's ID.

`workPhaseObtainedResources` supports cards such as A53 that inspect resources gained during the previous work phase. It is cleared after the returning-home phase resolves.

`completedFeedingPhases` increments in the feeding phase of `shared/session/phases/harvest.ts`. It matches the reference's global count. Cards such as A148 and B86 read it for completed-harvest-plus-one capacity instead of maintaining a per-card post-play counter.

`events` is the public structured rule-event stream beneath `GameState.log`. Backend rules first write `GameEvent`; mappers then derive UI logs, animation cues, audit reports, and future replay. `log` remains the visible text-log cache and is never a rule source. Rule code does not write `state.log` directly. The only writers are named cache boundaries: mapper output from `appendImmediateEvents()` and mapper output flushed from engine `LogStore` by `GameCore.flushEngineLog()`. `pnpm run check:direct-session-log` enforces this boundary.

The client incrementally consumes selected public events by `seq` to produce transient notifications, action, farm, and fence highlights, and resource animations. An initial snapshot initializes the cursor without replaying historical events. This cue layer serves UI feedback only. Legacy action-result detail also reaches the mapper through public events such as `action.detailLogged` instead of writing rule facts directly into `state.log`. `nextEventSeq` is the persisted event cursor. `normalizeState` drops old events that violate the public envelope, schema, JSON, or size guards, then continues from the greatest valid `seq`.

Every public `GameEvent['type']` must appear in `shared/events/event-mapping-policy.ts`. The policy marks Action Log, public notification, board or farm highlight, resource animation, and replay handling as mapped, conditionally mapped, or intentionally silent. `eventsToLogEntries()` never writes generic fallback rows into `GameState.log`; replay-only summaries remain in the client timeline layer. A pull request adding an event type must also add its policy, mapper fixtures, and documentation.

`buildLogPresentationPlan()` is the sole source for Action Log presentation relationships. `rows` are visible entries, `consumedEvents` are events absorbed into richer entries, and `suppressedEvents` are semantically excluded from the Action Log. The client timeline filters only by these structured event references; it must not infer relationships from player names, resource counts, card IDs, or events in another archive packet. A plain-resource `futureMeeple.resolved` is suppressed because a later `resource.moved(reason='receive')` shows the actual receipt. Resolutions with independent room, field, stable, forest, or moor effects retain a separate entry.

`publicEventArchive` is append-only public event metadata. A `publicEvents.committed` packet records committed public event IDs and sequences. A `publicEvents.canceled` packet records event IDs, sequences, and complete public payloads canceled by undo or provisional scope rollback for later replay and archive UI. Archive writes first validate packet-sequence and cursor invariants and reject private, malformed, non-JSON, or oversized payloads. If a corrupt event prevents writing a canceled packet, the runtime cancellation still returns without persisting the invalid payload. If live archive invariants are already corrupt, the restoration is not committed. Rules and card listeners read only current `GameState.events` or transaction events, never the archive.

The client Action Log consumes `publicEventArchive` as a read-only replay timeline. It combines the archive with current `events` to rebuild active, canceled, and missing rows. Canceled rows retain their packet payload and render with strikethrough. Selecting a replay row produces local notification, highlight, and resource-animation cues with `replay:` IDs. It never modifies `GameState`, sends a command, or advances the live public-event cursor.

Runtime `publicEventCancellations` for undo and provisional scope rollback is response metadata. It is not added to `GameState.events` and appears only in the current restoration response. When restoration removes committed public events, HTTP and WebSocket payloads include the cancellations. The client uses them to clear current transient feedback and align its public-event cursor with the restored snapshot. Reconnect and `getState` do not replay old cancellations. Persistent cancellation history remains in `publicEvents.canceled` packets. Before entering a per-viewer payload, runtime cancellation and that viewer's `publicEventArchive` use the same hidden-event filtering and sequence remapping.

Initially, only rules events with `visibility: 'public'` may enter `GameState.events`. Private prompts, hands, draft state, and living-hand information remain in snapshot, privacy, and pending channels. `privateEvents` is a separate per-viewer synchronization layer describing private prompts and hand or draft changes visible in the current snapshot, such as `private.promptShown`, `private.handChanged`, and `private.draftUpdated`. The client consumes them as transient UI notifications. They never enter the public replay stream or become rule sources. Card-driven hand changes emit through a runtime-only response buffer, not `ActionExecutionResult`, engine snapshots, history, or `GameState.events`.

`SerializedGameState` is the public network and Replay representation of `GameState`; its `engineStack` is always empty. `PersistedSessionSnapshot` separately stores authoritative `state`, public `frame`, and a server-private `sessionCursor`. The private cursor contains engine restoration data, history, and provisional continuation metadata for cross-process recovery, and never enters a player or spectator payload. Interaction requests use a separate viewer-safe pending protocol so another player's choice data cannot leak through the cursor. Synchronization versions and room connections do not belong in `GameState`.

### 4.3 PlayerState by Responsibility

- Identity: `id`, `name`, `color`
- Economy: `resources`, `familySize`, `workersAvailable`, `rooms`, `houseType`
- Farm: `fields` with multiple `CropStack[]`, `roomTiles`, `stableTiles`, `fenceSegments`, `pastures`, Farmers of the Moor `farmTerrain` with top `kind` and optional `covered`, `farmyardExtensions`, `farmyardSpaceStates`
- Animals: `houseAnimalType`, `houseAnimalCount`, `stableAnimals`, `newbornCount`
- Played cards: `improvements`, `minorPlayed`, `occupationPlayed`
- Hands: `minorHand`, `occupationHand`
- Persistent effects: `majorEffects`, `activeModifiers`
- Supply tokens: `supplyTokensConsumed` records permanently consumed fence or stable components; helpers calculate the remaining limit dynamically
- **Card-local state:** `cardStates`, described in section 8.3
- **Worker identity:** `workers: Worker[]`, with five fixed slots identified by `'1'..'5'` and marked by `isActive` and `isNewborn`

`Field.stacks: CropStack[]` stores the bottom stack at index 0 and the top stack last. Sow requires an empty field through `fieldIsEmpty`. Reap takes only the top stack and pops it when `remaining === 0`. A mixed field counts as both a grain and vegetable field. All access goes through helpers in `shared/domain/field.ts`.

### 4.4 ClientCommand

```ts
type ClientCommand = (
  | { type: 'auth'; token }
  | { type: 'createRoom'; maxPlayers?, name?, customCardIds?, enableCommunityDeck?,
      enableParentCards?, draftParents?, enableThroughTheSeasons?,
      enableFarmersOfTheMoor?, allowIncompleteFarmersOfTheMoorMinorDeal?,
      draftMode?, draftPoolSize? }
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

Important boundaries:

- There are no separate `reorg`, `feed`, `nextPlayer`, or `confirmPlayerSwitch` commands. Every such wait shape is sent through `choice`, with `payload` determined by `InteractionRequest.kind`.
- `commitSelection` remains separate only for structured targeted selections such as farm-position, occupation-hand, resource-quantity, and resource-batch-exchange. Farm-position may use `validPositionGroups` for server-validated coordinate sets, including the adjacent two-space Farmers of the Moor Farmyard Extension. A selectable position may also carry `sourceCard`, `cardFieldSlot`, and `groupKey`: selection limits count distinct groups, and the backend canonicalizes multiple submitted positions from one group to one position before applying the effect. The client renders card-sourced virtual positions on the matching played-card slot instead of extending the farm grid.
- `enableParentCards: true` enables Parent Cards. With `draftParents: false`, each player receives a parent pair directly without entering `parent-selection`. Room metadata persists this choice across `newGame` and backend restarts.
- Workshop cards use a two-dimensional state model from PRD #634 in `server/workshop-status.ts`: review state `unsubmitted / in_review / approved / stale / merged` and publication state `live`. `enterReview` atomically binds one eligible pull-request URL, pins its head as `review_commit_sha`, and pins the same Design Draft as `review_version_id`. A card branch reuses only a pull request that remains open, non-draft, and based on `main`. Closed or merged pull requests remain permanent history; a resubmission creates a new pull request. An open pull request that becomes a draft or changes base is closed before replacement.
- After binding, the server immediately refreshes the GraphQL snapshot to cover approval webhooks arriving before the local binding. A temporary refresh failure retains the successful binding, clears synchronization time, and lets the author retry through `refresh-pr-status`. A valid approval must match the current head and come from a reviewer with push permission. If `authorAssociation=OWNER` and there is no `CHANGES_REQUESTED`, the provider generates owner approval for that head because GitHub forbids self-approval. Both paths call `approveReviewedVersion` to set `approved_version_id`.
- Publish re-queries GraphQL and requires the head SHA, review SHA, `approved_commit_sha`, and pinned-version mapping to agree before setting the card live. A different head, a closed pull request, draft transition, base other than `main`, dismissed approval, or `CHANGES_REQUESTED` becomes `stale·offline`. Potentially out-of-order synchronize, dismissal, and qualification events reread GraphQL first. Late review events for an already merged pull request retain the same-head binding; comment-only reviews preserve state. Unbound or ambiguous Workshop events do not query GitHub. An asynchronous snapshot commits only if the review binding, lifecycle, and monotonic update time are unchanged before and after the query; publish likewise checks an unchanged live-state token. GraphQL failure records the delivery and conservatively moves the card to `stale·offline`. `github_webhook_events` deduplicates delivery IDs. Webhooks invalidate and advance state, but publish never treats cached state as final. Migration v26 removed the old draft/published `status` column and reset existing cards to `unsubmitted·offline` under #632.
- `customCardIds` affects a real room only with `enableCommunityDeck: true`. Otherwise the server ignores the IDs and stores no corresponding custom-card metadata. When enabled, only live Workshop cards that are approved and published are accepted, using the reviewed `approved_version_id` snapshot through `loadLiveDraft`. An author's unreviewed code may run only in the Workshop sandbox through `POST /api/game/new-sandbox` and the browser-local executor; it never enters real-time multiplayer.
- Both real room creation and room recovery use `loadCustomCards(..., { liveOnly: true })`. Loading evaluates each ID independently. The requesting author's own non-live card sets `hasNotLive` and makes `handleCreateRoom` reject room creation with guidance to review and publish. Every other unloadable ID, including another author's non-live card, an unauthenticated request, or a missing ID, is silently filtered so the room can start without it. This prevents disclosing whether an ID names another user's draft. In all cases, unreviewed code never reaches the `GameSession` executor; only author-facing error feedback differs.
- The former replay-snapshot consent round trip, `confirmReplayCardSnapshotPublic` and `REPLAY_CARD_SNAPSHOT_CONSENT_REQUIRED`, was removed because non-live cards can no longer enter real rooms.
- Graduation under #642 occurs when the review pull request is closed as merged into `main`. The card enters terminal `merged` state, becomes read-only in Workshop, and rejects edit or unpublish. A pull request merged into another base does not graduate and becomes `stale·offline`. If merge arrives before approval, `github_pr_status='merged'` persists the fact. A later approval webhook or `refresh-pr-status` can read an approved MERGED snapshot, validate the frozen head and SHA binding, graduate the card, and reconcile built-in status immediately. A live merged card continues serving its reviewed snapshot until release. On service startup, `markBuiltInMergedCards` compares the built-in registry, sets `built_in=1`, lets the built-in definition take over, and retires the Workshop snapshot.
- Takedown has two tracks under #631 and #641. Author `unpublish` is gentle: existing games finish with embedded snapshots while new rooms are blocked. Administrator `POST /api/admin/cards/:id/takedown` is a kill switch: it forces `stale·offline` and calls `lobby.endRoomsUsingCard` to terminate every active room embedding the card, broadcasting `roomDissolved` with reason `card_takedown`. Those games do not score, produce completed Replay, or retain partial recording rows. A dismissed GitHub review uses gentle invalidation and never kills active rooms automatically.

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

`stateUpdate`, `roomWaiting`, `gameStarted`, `playerJoined`, `playerDisconnected`, and `roomDissolved` are broadcasts. `roomCreated`, `roomJoined`, `authOk`, and request-level `error` are unicasts. WebSocket broadcasts build a per-viewer payload using the connection's `viewerPlayerId`: the target player receives real private prompts and `privateEvents`, while others receive `private-prompt` redaction. An HTTP sandbox without `X-Viewer-Player` keeps the unfiltered multi-seat development flow; with that header it uses the same viewer filtering and seat guard. `cardWarnings` appears only in HTTP debugging and sandbox payloads so Workshop confirmation gates can report runtime custom-card failures; it is never broadcast to WebSocket viewers.

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
| `choice` | `{ options: ActionChoiceOption[] }` |
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

WebSocket `ClientCommand.type` names do not exactly match `InteractionCommand`. The frontend determines what can be done from `allowedCommands`; online commands normalize to `choice`, `commitSelection`, `action`, and related protocol names.

`shared/session/interaction-state-adapter.ts` is the server projection boundary for `InteractionState`. `GameCore.buildInteraction()` passes only current `GameState` and `EngineStack`, anytime, undo, and score snapshots, and one `projectPendingRequest(PendingInteractionProjectionInput)`. Construction of animal-reorg zones, farm-select payloads, and selection payloads lives behind that projection request builder instead of being scattered among adapter closures. Viewer redaction through `redactInteractionForViewer` consumes an already-derived `InteractionState` and never participates in pending or request derivation.

When a private choice concerns one card already visible in the recipient's hand, the producer may set `promptParams.cardId`. Interaction Presentation localizes that card name for the prompt and highlights the matching hand card; non-recipients receive `private-prompt` without `promptParams`.

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

`effectPreview` has three variants: `resourceExchange`, `payment`, and `text`. The engine automatically aggregates previews for `seq(pay-resources, gain[, bonus-vp])` options. A card using handwritten `payLeaf` plus `gainLeaf` receives the same preview. Producers include `shared/cards/helpers/pay-gain-node.ts`, `shared/actions/effects/pay-helpers.ts`, and `shared/actions/effects/exchange.ts`.

`descriptionPreview` is a recursive description of `ActionFlow`. A leaf uses `ActionDefinition.nameKey` plus its `effectPreview`; composite nodes join child descriptions by type: `SeqNode` with `, `, `XorNode` with ` / `, `OrNode` with ` + `, and `ParallelNode` with ` | `. The frontend prefers `descriptionPreview`, allowing ordinary leaves, pay/gain compositions, and nested XOR or SEQ nodes to derive option text from the engine.

Generic helpers such as `pay-gain-node` no longer inject `choiceLabelKey: 'ui.interactionResourceExchange'` for mechanical pay/gain choices. Visible option text comes from `descriptionPreview` and `effectPreview`. Reserve `choiceLabelKey` and `choiceLabelParams` for semantic overrides such as field or quantity selection, `ui.interactionUseCard`, or `ui.interactionSeedResearcher`; do not duplicate i18n for plain resource exchanges. `special-effect` supplies semantic descriptions from `params.kind` so internal state synchronization is not exposed as a generic “Card Effect.” Display-only synchronization such as `set-infobox` is omitted from descriptions.

### 4.8 LogEntry

`LogEntry { key, params, playerId? }` carries a structured i18n key plus rendering parameters. The frontend renders it for the active locale. New-game bootstrap entries may carry stable `playerId`; when WebSocket seat display names change, the client refreshes identity-based caches instead of matching potentially duplicate display text.

---

## 5. `shared/engine/`: Node-Tree Engine

The node tree is the only state machine. `GameSession` no longer owns a `PendingAction` union; the engine cursor determines what input is awaited.

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

Architecture decision from 2026-05-13: domain `ActionFlow` follows the reference node algebra and exposes only `leaf`, `seq`, `parallel`, `xor`, and `or`. `optional`, `promptKey`, `sourceCard`, `choiceLabel*`, and `targetPlayerId` are metadata, not domain node types. Cards and listeners construct only this small set; new rules must not expose runtime-only nodes through `ActionFlow`.

Architecture decision from 2026-05-14: the runtime engine tree also has five concrete nodes: `ActionNode`, `SequenceNode`, `ParallelNode`, `XorNode`, and `OrNode`. Cross-player ownership, optional state, trigger selection, listener activation, and pending state are represented through node metadata, internal action leaves, pending envelopes, and frame state rather than wrapper nodes.

`targetPlayerId` executes an ordinary flow node from another player's perspective. Runtime compilation converts it into `ownerPlayerId` metadata on the target subtree; a child with an explicit owner keeps that owner. Top-level Session builders and dynamic insertion paths for hooks, listeners, action `result.flow`, and resolveChoice follow-ups must carry the current effective owner so later siblings can return to the frame or ancestor owner. Cursor restoration persists node-owner metadata instead of inferring it from global `currentPlayerIndex`.

Runtime nodes:

- `ActionNode` is equivalent to the reference `LeafNode(action)` and calls `ActionDefinition.execute` with `actionId` and `params`.
- `SequenceNode`, `ParallelNode`, `OrNode`, and `XorNode` correspond to the reference `SEQ`, `PARALLEL`, `OR`, and `XOR`. After choosing a composite branch, `XorNode` stores `selectedChildId` and traverses only that branch until completion so `xor(seq(...))` does not finish after its first successful leaf. `ParallelNode(mode='trigger-select')` implements reaction selection with pass and mandatory semantics for action listeners, phase card-effect activation, and extra-turn providers.

Shared runtime metadata:

- `ownerPlayerId`: cross-player execution owner, inherited from the ancestor or frame unless the child sets one explicitly.
- `optional`, `optionalActive`, `optionalPromptKey`: optional accept or skip state. `xor` and `or` retain a direct `__skip__` option.
- `mandatory`: an accepted mandatory continuation marks both its host node and descendant `ActionNode`s. If a later leaf cannot execute, it returns mandatory-blocked and Session enters undo-only `engine-blocked` instead of running only the first half of a composite.
- `selectedChildId`: runtime selection cursor for `XorNode` and trigger-select `ParallelNode`. Cursor restoration persists it so a chosen composite branch or provider resumes after pending state, undo, or WebSocket restoration.
- `resolveAfterSelection`: one-shot trigger-select mode. The parent resolves immediately after the selected child completes. Extra-turn provider selection uses this so sibling providers are not offered after one is chosen.
- `pending: PendingEnvelope | null`: input envelope. `InteractionRequest` is a WebSocket and Session protocol shape, not a tree node. Leaf requests, `xor`, `or`, optional nodes, trigger-select parallel, and synthetic confirm, feed, and farm-select all pause and restore through pending envelopes.

Listener activation is an internal leaf: `ActionNode(actionId='activate-card')`. Its parameters include `{ listenerId, cardId, phase, actionId, event, ownerPlayerId, ownerCardZone, triggerPlayerId }`. `event` retains the triggering action's `actionContext`, including `targetSpaceId`; activation resolves the listener's actual `space` from that context. It bypasses the ordinary public-action pipeline, executes only the listener body, and inserts returned flow or follow-up actions into the engine.

`BaseNode` implements shared metadata, pending state, and cursor round trips. `EngineTree` and the five concrete nodes implement traversal.

### 5.3 Engine Public API

`Engine` exposes this small interface to `GameCore`:

- `step(ctx)`: advance to the next unresolved node and stop at pending input.
- `resolveChoice(value, ctx, payload?)`: supply player input and continue.
- `peekPendingEnvelope()`: return the current `PendingEnvelope`, or null.
- `peekPendingHost()`: return the node hosting that envelope for `sourceCard`, `actionContext`, and owner lookup.
- `injectBeforeFlows(flows, ctx?)`: insert hook flows.
- `snapshot()` / `restore(snapshot)`: serialize and rebuild the tree, including `nodeStates`, pending envelope, owner, optional, and trigger metadata.
- `hasPendingChoiceCompositeAncestor()`: tell anytime handling whether execution is inside a branch ancestor.

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

Its API is `push`, `pop`, `current`, `depth`, `peekPendingEnvelope`, `peekPendingHost`, and `toCursor`.

`EngineStackCursor` is serialized into `PersistedSessionSnapshot.sessionCursor.engineStackCursor`. Restoration uses `engine.snapshot()` and each concrete node's cursor restoration to rebuild the tree and locate pending hosts and traversal state; public and Replay `SerializedGameState.engineStack` remains empty.

The post-Reap window uses `post-reap-anytime` in both `SubFlowReason` and `PendingSyntheticKind`, so Session can distinguish its root choice from nested card choices without a card-specific branch.

`SubFlowKind` is one of `choice`, `animal-reorg`, `confirm-next-player`, `confirm-player-switch`, `feed`, `farm-select`, `selection`, or `card-draft`.

---

## 6. `shared/session/`: Session Layer

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

`shared/session/phases/` contains phase-specific pure functions such as `startBreedPhase`, `continueAfterFeed`, and `startNewRound`. These are not mixin or trait classes; all coordination converges in the main `GameCore` class.

### 6.2 GameCore Entry Points

`GameCore` owns:

- `state: GameState`
- `engineStack: EngineStack`
- Step history and the action-start `actionStartSnapshot`
- End-game scoring cache

Commands wrapped by `GameSession` in `authoritative-session.ts` and exposed to the server:

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

`GameCore` is the domain engine. `GameSession` in `server/game/authoritative-session.ts` is a thin wrapper that injects the isolated custom-card executor and creates viewer-filtered or debug synchronization payloads. `server/connection/` and `server/game/` own connections, broadcasts, and persistence.

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

Tests assert this structure directly. WebSocket paths serialize it through `GameSession.buildSyncPayload()`, filter it for the viewer, and broadcast it. `InteractionState` remains the frontend interaction authority.

### 6.4 Extra-Turn Rotation Extension: `contributeExtraTurn` and `hasPendingExtraTurn`

A092 Adoptive Parents introduced the extra-turn mechanism at the rotation layer under #203 and #204. It runs after a player's ordinary workers are exhausted, the positive counterpart to `onBeforePlayerTurn` `skipTurn`, which skips before a turn starts.

- `contributeExtraTurn?: (state, player) => ActionFlow | void` is a `CardEffect` hook. It returns that card's provider flow when available and `void` otherwise. `runCardEffectHook` does not execute it automatically; rotation gating in `shared/session/phases/round.ts` consumes it explicitly.
- `collectExtraTurnContributions(state, player)` is the sole source. `hasPendingExtraTurn` checks for providers; `collectExtraTurnFlow` compiles the real interaction. One provider expands directly. Multiple providers use one-shot `ParallelNode(mode='trigger-select')`, with each child an internal `activate-extra-turn` leaf. The player first selects a source card; only then does its flow expand. Provider flow may contain nested interactions such as `xor(seq(...))`, and the selected branch must drain completely before the provider finishes.
- A repeatable provider may define internal adjunct `countExtraTurns`, allowing mandatory turn skipping or forced consumption to consume one opportunity. `_extraTurnSkipCountsByCard` and `_extraTurnConsumedCountsByCard` record per-card skipped and consumed counts. `countPendingExtraTurns` and `consumePendingExtraTurns` reuse provider aggregation instead of a global player counter. A noninteractive fallback consumes one source in stable card order only when automatic progression is required.
- Three round gates treat a player with a pending extra turn as eligible: next-active-player selection via `nextSeatedPlayerIdx`, whose predicate is `workersAvailable(state, p) > 0 || hasPendingExtraTurn(state, p)`; `roundWorkComplete`, requiring every player to have no available workers and no pending extra turn; and the rotation skip loop, which stops on a zero-worker player with a pending extra turn so the flow can be injected.
- `startPendingExtraTurnIfAny(core)` is the only injection path. Confirm-next-player rotation and history restoration after `undoStep` or `undoAction` reuse it. Undo rebuilds the pending flow only when the current player is already stopped at a zero-worker extra-turn seat and the engine stack is empty; it does not rerun the full seat walk.
- A92 contributes XOR use or forfeit. Choosing Forfeit exits later opportunities that round. It triggers when ordinary workers are exhausted while an inactive newborn remains, matching the reference `stLabor` supply-placement choices such as adoptive, Telegram, and Work Permit. M057 enters the card or board selection flow for a Moor special action and still invokes normal special-action before and after listeners.

`skipTurn`, used by cards such as D134 Oyster Eater through `{ skipTurn: true }`, mirrors the reference `Globals::setSkipNext` and makes rotation continue past the player before their turn starts. `contributeExtraTurn` instead prevents early skipping after the player's workers are exhausted and appends another placement. See *Extra Turn / Forfeit* in `CONTEXT.md`.

### 6.5 Turn Scope and Action-Execution Scope

Rotation opportunity, Turn Scope, and action-execution scope are separate lifetimes. Cards whose text says “on your turn” or “in the same turn” consume Turn Scope. Cards that inspect what was actually built, plowed, sown, or otherwise changed consume the current action's scope or transaction result.

| Rule situation | Rotation opportunity | Turn Scope | Action-execution scope |
|---|---|---|---|
| Ordinary worker placement or a Moor special action selected by rotation | Consume the current opportunity | Open a new scope | Open one scope for each complete Rule Action |
| A contributed Extra Turn | Open an additional opportunity | Open a new scope | Open one scope for each complete Rule Action |
| D051 Archway, or each worker moved by E010 Straw Hat | No new opportunity | Open a new scope for each moved worker | Open one scope for each complete Rule Action |
| An immediate Rule Action that remains part of the current Turn | No new opportunity | Inherit the current scope | Open a new scope |
| A phase or anytime Rule Action that does not count as a Turn, such as Iron Hoe | No new opportunity | None | Open a new scope |
| A raw gain, payment, choice, or listener activation | No new opportunity | Inherit a scope if one exists | Do not open a new scope; remain in the surrounding scope |

A Turn Scope begins before its worker placement, Moor special action, or equivalent card-driven action-space use. It remains active through every Rule Action, trailing effect, required animal reorganization, and end-of-turn hook belonging to that Turn, then clears. D051 Archway and each E010 Straw Hat movement carry the ordinary person-action trigger into those end-of-turn hooks. D051 closes its Turn Scope after the target action space and its hooks are fully resolved; E010 closes one scope before starting the next moved worker's choice. Idle or later stage processing must never observe a completed Turn's stale identity or start snapshot.

An action-execution scope begins before one Rule Action's lifecycle and remains active through its pending choices, continuations, listeners, and trailing effects. Multiple Rule Actions in one Turn use separate action scopes while sharing the Turn Scope. Per-action delta consumers use the action transaction, not the Turn's start snapshot.

`actionContext.trueAction` is independent of all three lifetimes. It says only whether an effect counts as taking its named action for action listeners. It neither creates a Turn nor replaces an action-execution scope: a free build may use `trueAction: false` while still exposing its actual build delta to generic “when you build” rules.

## 7. `shared/actions/`: Actions and Hooks

### 7.1 Directory

```text
shared/actions/
├── index.ts               actionDefinitionLookup Map; discovers 27 base plus internal actions
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
  costPreview?(...): CostPreview
  isDoable?(...): boolean
  isAutomatic?(...): boolean
  execute(state, player, params?): ActionExecutionResult
  resolveChoice?(state, player, value, payload?): ActionExecutionResult
  emitLeafActionDetail?: boolean
  flow?: ActionFlow
  getBaseChoiceOptions?(...): ActionChoiceOption[]
  choicePromptKey?: PromptKey
  noChoiceLogKey?: string
}
```

`descriptionKey` preserves the printed action-space text. Optional `rulesKey` points to separate localized supplemental rulings or implementation limits and has no effect on action legality or execution.

Hooks are not part of `ActionDefinition`; card files register them explicitly through `hooks.ts`.

The opt-in `getBaseChoiceOptions` path takes base options, injects `computeChoiceCandidates` results, deduplicates by `value`, and filters with `costPreview.canExecute`. Zero candidates fail, one candidate jumps directly to `resolveChoice`, and two or more candidates create the standard prompt. Current consumers are `renovate-house` and `A087_Conservator`. This path is mutually exclusive with the traditional `execute() -> choice -> computeArgs.extraOptions` path. Card-authored exact or free renovation costs use `actionContext.exactCost`, matching the reference `formatCost` semantics for construct, stables, and plow.

### 7.3 Automatic discovery under `effects/`

`scripts/check-effects-file-list.ts` is the single source of truth for the top-level production-effects allowlist. `shared/actions/effects/__tests__/architecture-guard.test.ts` reuses it and also protects the action-ID allowlist. `shared/actions/index.ts` imports only top-level base effects and internal effects under `effects/internal/` to build `actionDefinitionLookup`. **Do not add top-level effect files that accumulate logic for multiple cards.** Use `internalChildren` for host-action substeps, place internal effects under `shared/actions/effects/internal/`, and put pure helpers under `shared/actions/helpers/`.

`collect` is the unified entry point for partially taking an accumulation space. It accepts optional `actionContext: { spaceId?, resource?, amount? }`. `spaceId` can identify a space other than the current action space, such as a card-triggered theft. `resource` and `amount` support a partial take without emptying the space. The old `take-from-space` internal action and its i18n keys were removed after migration to `collect`. A card-provided action space that is itself an accumulation space declares `gainPerRound`, stores accumulated goods in `ActionSpace.resources`, and uses the standard `collect` flow so collect listeners and events remain uniform.

`place-farmer-on-space` is the internal action for placing an additional worker on a specified target. It takes an available worker from the current owner's home, places it on `params.spaceId`, and normally returns that target action's `expandFlow` leaf. `params.allowOccupied` bypasses only the occupied-space check; it does not bypass linked blocks, round availability, action executability, or worker supply. Cards that piggyback on or chain placement to a fixed target must use this internal action instead of mutating `ActionSpace.takenBy` in a listener handler.

`pass-minor-card-to-left` is the internal action for passing a played minor improvement between players. It removes the card from the current player's `minorPlayed` or `improvements`, clears that player's `cardStates` entry, adds the card to the player on the left's `minorHand`, emits a public `card.passed` event, and sends the target player a private `cardEffectHandChanged` event. Later triggers must consume the `card.passed` provenance rather than infer a pass by comparing hands.

Follow-up selection for an extra crop placement carries provenance in `actionContext.extraCropPlacement`. Pending and anytime construction must copy this marker from `contextSnapshot.actionContext`; subsequent cards read the semantic marker and must not branch on the source-card ID that created the pending interaction.

### 7.4 `payment/`

`shared/actions/payment/` contains:

- `solver.ts`: the production payment lifecycle and payment-facade entry point. It computes affordable solutions, checks affordability, builds payment choices, parses player choices, executes payment, and returns a structured receipt. Cost previews, typed-flat costs, room payment, simple resource or trade side effects, and card-cost candidate helpers also enter here.
- `internal/enumerate.ts`: `computeAllBuyableCombinations`, `keepOnlyOptimals`, and `sortPaymentSolutions`. Dominance pruning runs after resource-feasibility filtering and exempts fee identity, stateful bonus choices, and card payment. Card-provided payment resources participate under their own keys, as required by the ADR 0004 amendment.
- `internal/execute.ts`: `payResources` and `executePaymentSolution`.
- `internal/cost-modifiers.ts` and `internal/preview-cost.ts`: `computeCosts` integration and card-purchase cost-preview glue.
- `internal/room-payment.ts` and `internal/typed-flat.ts`: compatibility helpers for room and typed-flat costs.
- `internal/cache.ts`: the solution cache.

Production effects, helpers, and card runtime code enter the payment lifecycle or related facades through `PaymentSolver`. External tests use `PaymentSolver` or `shared/actions/payment/__tests__/test-helpers.ts`; only tests under `shared/actions/payment/internal/__tests__` retain white-box access to the algorithms. `payment/internal/*` is private to the payment package and algorithm-focused tests. Production code and other tests must not import it directly. Card-purchase costs use the `computeCosts` phase with `actions: ['improvement']` to distinguish action-space fees from card-purchase costs.

**Unified `ComplexCost` model.** Construct, renovation, fencing, plow, occupation, minor improvement, major improvement, and `pay` leaves all use the same `computeAllBuyableCombinations` pipeline. Its fields mean:

- `fees: Partial<Resource>[]`: total fixed fees per action. The raw total-cost delta in `computeCosts.costs` is written to `fees[0]`. Sourced the reference `addBonus` and `addBonusChoices` should normally become `bonuses`; sourced the reference `addCost` that retains the original candidate should normally become `trades`. After `mergeResources(fees[0], unitFee * nb)`, enumeration clamps negative values to zero so a discount cannot refund an unrelated resource.
- `unitFee: Partial<Resource>` plus `nb: number`: per-unit cost times quantity. A constructed room uses `{wood: rooms_cost, reed: 1_per_pile_or_room}`, renovation uses `{[material]: 1}`, and fencing uses `{wood: 1}`. `nb` is the number of units handled by the action: rooms, fence segments, and so on. Enumeration first expands ordered replacements for every unit-cost row, then combines the rows into total costs.
- Typed-flat fencing or stable payment passed as one `{fee:{wood:N}}` is normalized before cost-type modifiers: fencing becomes `{unitFee:{wood:1}, nb:N}`, while stables become `{fee:{wood:N%2}, unitFee:{wood:2}, nb:floor(N/2)}`. Stable farm-choice affordability and settlement retain `{unitFee, nb}` while appending payload-aware `computeCosts` trades, bonuses, and providers. A the reference `addCost` per-unit alternative such as A16 or C56 can therefore generate a cost row before a bonus choice such as D88 replaces it.
- `trades: Trade[]`: `from -> to` resource substitutions injected by a `TradeModifier` or `computeCosts` listener. `Trade.scope: 'action' | 'unit'` selects the substitution point. Action-scoped trades convert the player's resource pool once per action. Unit-scoped trades run candidate closure on each unit-cost row, with no ordering field, so reachable rows do not depend on registration order. `minCost` / `maxCost` constrain eligible rows, `replaceUpTo` replaces the available amount up to the declared target, and `groupMin` / `groupMax` bound total uses across all rows. Each unit-scoped `TradeUsage` retains the resources actually removed and added so partial `replaceUpTo` uses report exact cost attribution. An empty `from` with `to:{resource:n}` preserves the original row and adds a sourced discount candidate; C88 sets equal group bounds for the exact number of discounted stable rows.
- `bonuses: Bonus[]`: per-action discounts or discount choices. `{discount}` is a single discount and `{choices: BonusChoice[]}` is a multi-choice discount. `Bonus.optional` controls whether enumeration includes a branch that does not apply the bonus.
- `CostResourceRemovalModifier`: `type:'remove-resource'` structurally removes the named resource key from `fee`, `fees`, and `unitFee` before enumeration. `costResourceRemovals` retains the source and the actual reduction on every cost path. This models rules such as C014 that remove the need for a resource. The constraint is reapplied after each later bonus, so E123 cannot consume a removed cost and D013-style cost bonuses cannot reintroduce it. Final reductions are recorded in `PaymentSolution.bonusReductions` for Cost Attribution.
- `paymentResourceProviders`: virtual payment resources supplied by a card or hook. A provider declares a stable key, available amount, covered real-cost resources, and the source consumed on execution. It is not written into `fee`, `fees`, or `PlayerState.resources`; it appears under its own key in `PaymentSolution.resourcesPaid`, and the executor consumes the source state.
- `paymentBudget`: limits the resources in final `PaymentSolution.resourcesPaid`. It supplies no resources, changes no candidates, and must not restrict geometry or unit count early. It runs only after trades, bonuses, payment-resource providers, and cards have produced final payment solutions.
- `Bonus.capDiscountAtCost`: caps a variable discount at the current positive fee, but remains a post-processing bonus. A rule that removes the need for a resource must use `CostResourceRemovalModifier`, not simulate removal with an arbitrarily large capped discount. An ordinary bonus choice must apply its full discount and cannot rely on clamping to create a no-op or partial discount.
- `Bonus.trackChoiceIndex`: records `bonusChoiceIndex` for a multi-choice bonus by default. It indicates which choice the player selected but does not, by itself, exempt a solution from dominance pruning.
- `Bonus.choiceAffectsState`: marks a choice identity that an `after-pay` or similar listener consumes to mutate state. Only these solutions are mutually exempt from dominance pruning. E123 needs this flag; stateless replacements such as B145 and D88 do not.
- `bonuses[].conditions?: Record<string, number>`: `applyCostModifiers` carries `BonusModifier.conditions` into the generated bonus, and enumeration reevaluates quantity-aware constraints with `evaluateConditions(player, conditions, nb)`, such as C013 Wood Slide Hammer's `minNumRooms: 5`.

**Card-purchase `ComputeCardCosts` candidate pipeline: candidate closure, ADR 0004.** Before the payment solver sees a major or minor improvement purchase, the cost is normalized into a Cost Candidate List. Candidate closure then applies every `deriveCardCostCandidate` transform through `candidate-closure.ts` `closeCandidates()`: fixed-point enumeration followed by Mandatory Saturation filtering. Results do not depend on listener registration order or naming; `CardListenerRegistration.order` was removed and must not return. A card declares only a single-candidate transform, `candidate -> candidate(s) | null`, plus `cardCostCandidateMandatory`. Optional the reference "can pay instead" transforms naturally retain the original candidate. Mandatory the reference "costs less" or replacement transforms hide rows that can still undergo a mandatory transform after saturation. A fixed-price card is an input-independent optional or mandatory transform; closure deduplication produces one row without any precedence declaration. Discount clamping removes zero-valued resource keys from the candidate resource map. Candidate metadata stores only `sources`, `originalFeeIndex`, and Cost Attribution; sources are an unordered set in the deduplication key. After closure, each resources plus `originalFeeIndex` group keeps one representative row, choosing the fewest sources and then lexical key order, per the ADR 0004 amendment. Once payment is selected, improvement-payment glue writes the metadata to option `sourceCards`, `resource.paid.bonusSources`, and Card Resource Stats. A single-candidate row uses index-zero metadata by default.

**Fixed pipeline order as a domain rule, not a card precedence rule:** base candidates from `fee`, `fees`, `unitFee`, and dynamic `getBaseCosts`; structured resource removal by cost-type modifiers; candidate closure for card-purchase `deriveCardCostCandidate` or unit-trade transforms; action-scoped trade enumeration; bonuses, including capped and choice bonuses, evaluated last because their upper bound is the final cost; card-provided payment resources; cards; affordable-solution generation; `paymentBudget` filtering of final resources paid; then Pareto pruning and sorting.

**Two levels of condition evaluation in `cost-modifiers.ts`:**

- `evaluateStaticConditions(player, conditions)` handles conditions that depend only on current player state: `houseTypeWood`, `houseTypeClay`, and `houseTypeStone`.
- `evaluateConditions(player, conditions, nb)` adds quantity-aware constraints such as `minNumRooms`. Enumeration calls it while generating payment branches and applying bonuses.
- `getModifiersForCostType(player, costType)` applies only the static filter and no longer reads `player.rooms`. Quantity-aware decisions stay in enumeration so construct's `nb=rooms-to-build` and renovation's `nb=player.rooms` both drive `minNumRooms` correctly.

**`Trade.scope`:**

| Scope | Applied at | Default `max` | Typical use |
|---|---|---|---|
| `action` | The player's resource pool; each trade is independent up to `max` | `?? 1` | A028 Forest School for lesson costs; A088 Hedge Keeper replacing all three fence segments once; E060 Working Gloves grouped exchange, with a future `groupMax` if needed |
| `unit` | Each unit-cost row through candidate closure, without an ordering field | `?? 1` per row | A123 Frame Builder once per room; A016 Rammed Clay once per fence segment; C056 Feed Fence for at most one wood-only stable; C088 Carpenter's Apprentice for the exact discounted stable count |

A unit-scoped trade **must not** carry `conditions.minNumRooms`; a per-unit trade has no minimum-unit threshold. `validateTradeModifier` enforces this invariant at the `applyCostModifiers` boundary.

**Validation:**

- `validateComplexCost(cost)` throws in development and degrades to no affordable solutions in production. It rejects costs that combine `nb` with `cards`, and requires a unit-scoped trade to have `nb`.
- `validateTradeModifier(modifier)` rejects unit scope combined with `minNumRooms` and invalid grouped-use bounds.
- `validateBonus(bonus)` requires exactly one of `discount` or nonempty `choices`.
- Typed-cost payment post-processing drops any branch whose `resourcesPaid` contains a negative value. A the reference `addCost` alternative cannot mean producing surplus resources and refunding them.

**Renovation alignment in `shared/actions/effects/renovation.ts`.** `buildRenovationPlan` returns `ComplexCost` directly as `{fees:[{reed:1}], unitFee:{[material]:1}, nb:player.rooms}`. A `computeCosts` hook's `costs` merge into `fees[0]` through `mergeRenovationCost`; `trades`, `bonuses`, and `paymentResourceProviders` are appended to this payment child through `executionContext.costTrades`, `costBonuses`, and `paymentResourceProviders`. `canAffordTypedFlatCost`, `payTypedFlatCost`, and `payTypedFlatCostDetailed` in `typed-flat.ts` accept `Partial<Resource> | ComplexCost` and all use the single `computeAllBuyableCombinations` pipeline. The old `resolveSimpleTradeAdjustedCost` path was removed.

D015 Clay Supports' clay-to-reed trade applies only when `houseTypeClay > 0`. A123 Frame Builder represents construct with two unit-scoped `TradeModifier`s, wood to clay and wood to stone, gated by `houseTypeClay` and `houseTypeStone`. B145 Brushwood Collector uses `replaceUpTo` for one- or two-reed construct rows. Mandatory renovation discounts use `Bonus.optional=false`. Target-sensitive listeners such as B128 Plumber read the selected material from `params.selectedOption` and return sourced mandatory bonus choices.

### 7.5 Hook system: 11 action-lifecycle phases

```text
isDoable                 change whether an action is executable
computeReplace           replace an entire action
computeCosts             adjust costs, including fencing and card-purchase discounts
computeArgs              add options to a choice returned by execute()
computeChoiceCandidates  inject candidates into opt-in getBaseChoiceOptions
computeExchanges         inject runtime CardExchange values
before / during / immediatelyAfter / after
anytime                  register additional anytime actions
```

`ActionHookContext` is `{ state, player, space, actionId, phase, result?, choice?, doable? }`. During execution, `ActionMutationContext` also carries `eventSink`, through which an action or effect records `DraftGameEvent`s in the current transaction. `result.extraData` carries execution metadata such as fencing's `newPastures` and `newEdges`.

The engine's `EventStore` owns event transactions. A public action or internal leaf opens a frame. After the action advances successfully, the engine fills in `schemaVersion`, `id`, `seq`, `round`, `phase`, and `visibility`, commits to `state.events`, and appends a `publicEvents.committed` archive packet. Failures, cancellations, rollbacks, and optional skips append no events. Commit resequences against the current `state.nextEventSeq`, preventing duplicate sequences when other subflows commit while a parent action is pending. Before commit, events are checked for public visibility, JSON safety, size limits, and known event types and fields. The same checks run when restoring pending or engine snapshots so an unfinished frame cannot later write an invalid event.

Card listeners read current-frame events through `CardListenerContext.transactionEvents` and `eventQuery`. Ordinary listeners see events already emitted in the frame. Synthetic listeners such as `trade-applied` can read the exchange's current `DraftGameEvent`, but cannot depend on uncommitted global `state.events`. Listener handlers are state-pure flow builders: every mutation, including a write to the listener's own `cardStates[cardId]`, returns a flow or leaf to the engine. Trigger-select preview must execute only against cloned state and players, using the clone diff to decide whether an activation is selectable; real mutation occurs only after the player selects it.

The generic `ActionNode('place-farmer')` does not dispatch card `before` listeners when the wrapper starts, because its target action space is not known yet. Once the target is selected, every placement path dispatches both `before / <target-space-id>` and `before / place-farmer` with `context.space` set to that target, deduplicates listeners that match both identities, then expands the target action flow and cascades target-placement `after` listeners. This target-known boundary is shared by top-level placement, selectable or fixed-target extra placement, and card jumps. Cards such as A174 that listen to an extension-space ID and cards such as D090 that listen to the placement lifecycle therefore see the same target-space context.

**Architecture decision, 2026-05-29: freeze the trailing trigger frame when the host action succeeds.** A `during`, `immediatelyAfter`, or `after` listener may compile into an `activate-card` leaf that executes later. Before it runs, `afterHostCommitListeners` or an `onBuy` flow may play more occupations or improvements. To prevent the listener body from reading that later live state, the engine captures a trigger frame after host-action commit and before any `afterHostCommitListeners` mutation. The frame contains current `transactionEvents` and `actionEvents`, plus the matched card-listener set and order for the three trailing phases. A deferred host continuation must reuse that frame; it must not rematch or reorder listeners against later state. Trigger-frame v1 freezes only card listeners, not action-hook results. No production path currently registers trailing action hooks; extend them separately only when needed.

`CardListenerContext.triggerSnapshot` stores read-only trigger-time facts and exists only in successful-action trailing phases: `during`, `immediatelyAfter`, and `after`. It is absent from `before`, `isDoable`, `computeCosts`, `computeArgs`, `computeChoiceCandidates`, `computeReplace`, `anytime`, and `computeExchanges`, which continue to read live state. The first snapshot version stores each player's `occupation`, `minor`, `major`, `improvement`, and `played` card-type lists plus counts derived from their lengths. The lists use the card-type semantics immediately after host commit. Occupation, minor, and major each use `collectCardsAs(player, type)`; major includes played minors with `alsoCountsAs: ['major']`. Improvement is the unique union of minor and major; played is the unique union of occupation, minor, and major, without double-counting dual-type cards. Ordering follows `collectCardsAs`: `player.improvements`, then `player.minorPlayed`, then `player.occupationPlayed`, preserving first appearance in each union without additional sorting. A `card.played` event establishes whether this action played a card and its type or ID; it does not reconstruct historical counts.

Snapshot helpers may fall back to the live player only for direct-listener unit tests, legacy helper callers, or non-trailing compatibility. Normal engine execution of the three trailing phases must provide a snapshot. `CardListenerContext.player` and `ownerPlayer` remain live inputs; returned flows apply mutations only when their action leaves execute. A listener that asks whether this is the Nth occupation or improvement, or whether occupation and improvement counts are equal, must read trigger-snapshot helpers rather than live `context.player.*Played.length`. `check:card-impl-boundaries` enforces this: direct live count reads fail in trailing listeners, while non-trailing phases are not subject to the snapshot guard. Membership checks such as `context.player.*Played.includes(...)` remain allowed by this guard; the cross-card-ID guard handles references to other specific cards. Extend `triggerSnapshot` when a new trigger-time fact is needed instead of cloning all of `PlayerState`.

Once the matched listener set is frozen, activation does not recheck whether the owner card remains in its original zone. Trigger-time state determines eligibility; the listener body reads live `ownerPlayer` and `effectPlayer`, while returned flows target the appropriate player for gains, pending interactions, and writes.

The trigger frame persists with its trailing `activate-card` node. `ActivateCardActionParams` carries `triggerSnapshot`; `transactionEvents`, `actionEvents`, and `triggerSnapshot` serialize and restore with the node cursor. After pending restoration, execution must keep the cursor's frame and must not recalculate the snapshot, rematch listeners, or reorder them. Cursor round-trip tests protect this invariant.

A card must not use its host `onBuy` flow to compensate for another trailing listener's count test. A card such as E97 expresses only its own extra action in `onBuy`. Effects such as E89 or D42 that trigger on the Nth occupation stay in their own listeners and read trigger-time counts from the snapshot.

`ActionHookResult` is `{ doable?, actionId?, extraOptions?, followUpActions?, flow?, costs?, trades?, bonuses?, paymentResourceProviders?, costAttribution?, reserveResources?, sourceCard? }`. `applyComputeCostResults()` carries `computeCosts` values into this execution's `executionContext.costs`, `costTrades`, `costBonuses`, and `paymentResourceProviders`; construct, renovation, and fencing append them to `ComplexCost` before enumeration. The farm-choice commit pass uses `collectFarmChoiceCostAdjustments()` to preserve farm-payload-aware costs, trades, bonuses, payment-resource providers, and cost attribution. Fence settlement passes those adjustments into typed payment as well.

`costAttribution` attributes action-path `computeCosts` changes to Card Resource Stats. The listener declares the source card and cost delta; after real execution, construct, fencing, stables, and plow write saved and paid amounts from the clamped before-and-after cost difference. When construct records nonzero saved or paid amounts, it also projects the source ID into internal-payment candidate metadata and therefore into `resource.paid.bonusSources` and action detail. This means the card participated in the cost change, not that the card owns the action's entire payment. Option-level `isDoable` can use `reserveResources` to declare a minimum of real resources that must remain after this payment; the host passes it to the internal `pay` child to filter solutions. Rules facts belong in `GameState.events`, not new per-card log fields.

Current events cover the resource spine of collect, gain, pay, and exchange; the farm spine of sow, plow, construct, stables, fencing, reap, breed, and reorganize; worker placement, return home, and newborns; round, work, return-home, and harvest phases; action reveal and accumulation; future meeples; legacy action detail; and `special-effect` mutation branches. `state.log` remains a UI cache derived by the event mapper and session cache writer. Business code no longer records rules facts through legacy log fields.

As a `sourceCard` fallback, a top-level `ActionHookResult.flow.sourceCard` is recursively copied to child leaves that lack it. Compound pending requests and leaf requests write `PendingEnvelope.sourceCard`, and `GameCore` forwards it to `interaction`.

#### 7.5.1 Public `ActionNode` execution order

An ordinary public-action leaf enters the engine in this order: `computeReplace -> before -> strict isDoable -> computeCosts -> execute -> during -> immediatelyAfter -> after`.

Direct `cancel` is not a successful protected-atomic-action path. For `plow`, `sow`, `construct`, `stables`, `fence`, `reorganize`, and internal `selection`, direct cancellation is recoverably rejected before option validation, `resolveChoice`, and hooks. Pending remains active, so none of the four reaction phases runs. The parent `ActionFlow` optional metadata and `__skip__` express optionality; undo and the reference `actRestart`-style reversal use history rollback. Entry doability for construct and fence must reject a real state with no reachable room or no legal fence commit, avoiding a confirm-only pending interaction with no valid commit path. Exchange and bake-bread temporarily retain exceptions for their legacy windows.

1. `computeReplace` runs first, before `before`, strict `isDoable`, and `computeCosts`. Before it runs, `actionContext.targetSpaceId` resolves `context.space` to the target action space, so replacement and every later phase observe the same space rather than an outer flow's host space. `HookDispatcher.applyComputeReplace()` applies action-hook replacement, then matching card listeners with `phase='computeReplace'`.
2. If `computeReplace` changes only `actionId`, every later phase continues with the replaced ID.
3. Every matching card listener that returns `decline + alternativeFlow` contributes an alternative in deterministic listener-ID order; later listeners do not overwrite earlier ones. The current leaf resolves immediately, and the engine inserts `xor(all replacement branches..., original fallback)` after it. A top-level `xor` contributed by one listener is flattened into its ordered branches. The original action's `before` listeners have not run.
4. After the player selects a replacement branch, every branch leaf reenters this normal pipeline. It carries inherited `skipComputeReplaceListenerIds` plus only the listener that produced that branch, so another replacement listener may still replace a nested copy of the action. It does not carry `checkedReplaceAction`, and normal `before`, `during`, and `after` listeners still run. The original fallback carries `checkedReplaceAction=true`; the dispatcher treats that marker as replacement bookkeeping and skips replacement calculation globally. Other phases must not interpret the marker as action semantics or suppress ordinary listeners.
5. With no declined replacement, the engine dispatches `before` card listeners. Matching reaction listeners compile to internal `activate-card` leaves inserted before the original leaf. Multiple reaction listeners for the same card owner and phase normally become `ParallelNode(mode='trigger-select')`, letting that owner choose order. Same-timing reactions owned by different players produce separate activations and prompts for each owner. During trigger-select evaluation, a temporarily structurally inapplicable child is hidden for this iteration but not permanently resolved, so it is reevaluated after a sibling runs. A structurally applicable but currently unaffordable listener remains visible as disabled. For a global listener with no `cardIds` that guards on `context.sourceCard`, activation metadata inherits the event's `sourceCard` as its display and choice card ID instead of falling back to the listener ID.
6. After all `before` leaves finish, the original action resumes. `beforePhaseResolved` prevents the same leaf from inserting that listener set twice.
7. Strict `isDoable` then runs base `canBeExecutedByPlayer`, cost preview, action-hook `isDoable`, and card-listener `isDoable`. It must read the state after real `before` mutations. If the action is still unreachable, it cannot continue. Only an already-accepted mandatory continuation may then use `ActionDefinition.isAlreadySatisfied` against the current transaction events; at this point `before` has completed, and a match resolves the leaf without executing its body or dispatching `during` / `immediatelyAfter` / `after`. Fresh and optional actions never use this escape hatch. Occupation hand-option construction and forged-choice validation also run option-level listeners with `choice=<occupationId>`. This prefilters cards such as B93 whose `onBuy` requires a minimum later payment. A listener's `reserveResources` continues into the occupation payment leaf so the occupation choice cannot spend resources required by that mandatory follow-up.
8. `computeCosts` writes fee overrides, sourced trades, bonus choices, and payment-resource providers into `executionContext.costs`, `costTrades`, `costBonuses`, and `paymentResourceProviders`. A before-phase unlock, gain, or exchange may therefore change real state before strict doability and cost enumeration.
9. The action body runs next. An opt-in `getBaseChoiceOptions` path first applies `computeChoiceCandidates`; otherwise it calls `ActionDefinition.execute()`. A `resolveChoice` continuation resumes under the same public-action ordering, completes the pending choice, then continues host internal children and trailing phases. A request from `execute()` or `resolveChoice()` creates pending state; otherwise execution advances to the trailing phases.
10. `during`, `immediatelyAfter`, and `after` are successful-host-action trailing phases whose trigger frame freezes immediately after host commit. `beforeHostListeners` settlement must finish first. `afterHostCommitListeners` runs after commit but before trailing activations actually execute. `afterHostListeners` settlement intentionally stays in its the reference slot after host `after`.
11. Internal `activate-card` bypasses this public-action pipeline. It runs only the designated listener body and gives any returned `flow` or `followUpActions` back to the engine for insertion.

Listener scope is `player`, `opponent`, or `any`. Card-listener matching enumerates deterministically by listener ID. Trailing-node construction then groups by owner in global, active-player, other-player order. Within each owner group it sorts stably by card play order and match order; that owner executes the activation or prompt. Reaction listeners use trigger-select by default. Compute and query listeners still aggregate in deterministic order without a player choice.

By default, a card listener matches only played cards. Omitting `zones` is equivalent to `['played']`, scanning `improvements`, `minorPlayed`, and `occupationPlayed`. Only an explicit `zones: ['hand']` or `zones: ['hand', 'played']` scans `minorHand` and `occupationHand`. Matches carry `ownerCardId` and `ownerCardZone` through `activate-card` params, trigger-select preview, and `executeCardListener()`. A handler must not rescan hand and played arrays to infer its owner zone.

A hand listener is only for a card-local rule that must observe history while the card remains in hand. It still obeys the state-pure flow-builder boundary: it reads current transaction events and state, then returns a flow that writes its own `cardStates[cardId]`. While the card remains hidden in hand, per-viewer serialization must hide its `cardStates[cardId]`, public events sourced from that hand card, derived log entries, filtered event and archive sequence cursors, runtime `publicEventCancellations`, and hand-ID-keyed `cardAvailability` from nonowners. This prevents hidden-hand inference from local history or playability metadata. Do not add a top-level `PlayerState.stats` or `GameState` statistic for one card's history. Games without that card should not maintain its history.

#### 7.5.2 Pay-child architecture invariants

`pay` is an internal settlement child. The public host action owns business mutation, event facts, and completion. Do not move business mutation back into `pay`, and do not model one operation as `seq:[pay, apply-*]` or a top-level `apply-*` effect.

`beforeHostListeners`, `afterHostCommitListeners`, and `afterHostListeners` encode explicit differences in host actions' the reference payment slots:

- Renovation, improvement, occupation, construct, fencing, and stables complete mandatory payment in `beforeHostListeners` or the main action before trailing effects.
- Improvement and occupation `onBuy` use `afterHostCommitListeners`: mandatory payment completes, host `completeInternalChildren` commits the card, `onBuy` runs, and only then do host `during`, `immediatelyAfter`, and `after` begin.
- Stables preserve `farm.stableBuilt -> resource.paid(stables) -> after-stables effects`: the farm mutation remains the host action's fact, but mandatory payment settles before a reaction can spend those resources.
- Fencing explicitly uses `beforeHostListeners`, preventing an after-fencing effect such as A034 Loppers from consuming resources before mandatory fence payment settles.

Forbidden shapes are:

- `seq:[pay, apply-*]`;
- top-level `apply-*` effect files;
- a `PlayerState` payment scratchpad or cross-action temporary payment slot.

`activate-card-effect` is an internal child. It reads `paymentInfo` from the internal result map through `paymentInfoFrom`, then runs a card-effect hook such as `onBuy`. Stage reaction dispatchers use the same child for harvest-field and before-end activations. A stage activation may carry `ownerPlayerId`, `targetPlayerId`, and stage-hook metadata. In `ParallelNode(mode='trigger-select')` preview, cloned state and players determine applicability, doability, and mandatory-pass behavior. A handler that returns a flow is executable. A void direct-mutation handler is also executable if it changes the clone, but the real mutation occurs only after the player selects it. Later action leaves generate or validate the real maximum and options for a choice flow against live state.

The trigger-select pass gate uses the previewed result. An explicitly mandatory result, or an enabled non-before nonoptional result, disables pass; root `flow.optional === true` can allow it. A before-end activation continues to use `beforeEndGameMandatory`, including a no-flow direct mutation. A `before` trigger still lets the original action continuation decide whether pass is available. The `onBuy` `paymentInfo` path does not read stage-target metadata. `occupation-gate` is a no-op internal gate for a flow that must first display or execute other nodes while the OR branch remains gated by occupation doability. Card-purchase `onBuy` and multicard business logic stay in the card effect or host-action completion, never a top-level effect.

`PaymentResourceMap` covers real resources, supply tokens, and card-provided virtual payment resources. `fence` and `stable`, like `wood` and `food`, flow through `cost`, `payLeaf`, the payment solver, `resourcesPaid`, `PaymentInfo`, and `resource.paid`. A virtual payment resource does not enter `cost`, but uses a stable key in `PaymentSolution.resourcesPaid` and payment-choice labels. Paying a supply token increments only `player.supplyTokensConsumed`; it does not change built `fenceSegments` or `stableTiles`. Every query for remaining fence or stable capacity must use `getOwnOrdinaryFenceBuildLimit()`, `getOwnOrdinaryFenceReserveCount()`, or `getAvailableStableSupplyCount()` rather than fixed limits of 15 or 4.

### 7.6 Stage hooks in trigger order

```text
Round start: onBeforeStartOfTurn -> futureMeepleReceives -> futureActionAnytimeWindow -> futureMeepleActions -> onBeforeWork -> onRoundStart
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
Before game end: after round 14 onAfterRoundEnd completes and advances to round 15,
  onBeforeEndGame -> preScoringWindow -> gameover
```

A whole-Harvest skip is activated once after every `onBeforeHarvest` hook completes and before `harvestPrepWindow`. The pending card-state flag is consumed into a round-scoped marker. While that marker is active, the player is excluded from Harvest preparation, reaping, post-reap anytime actions, feeding and heating, breeding, Harvest stage hooks, and card listeners owned by that player. `onBeforeHarvest` still resolves before exclusion, and ordinary `onRoundEnd` resumes after the phase changes to `preparation`. A field-and-breeding-only skip such as E58 remains a separate, narrower mechanism.

After `onBeforeHarvest`, `harvestPrepWindow` walks players in seating order before any `onStartHarvest` or field-phase card resolves. A played card may declare `preHarvestGoodsWanted`; preparation compares the aggregate demand from all played consumers with current supply plus guaranteed reaping. A card that consumes the good before ordinary reaping instead declares `preHarvestGoodsWantedBeforeReap`; current supply must cover that aggregate before-reap demand without counting crops still in fields. A card such as E58 that can opt out of the field phase declares `maySkipHarvestFieldPhase`; its possible reap is not treated as guaranteed for any consumer. Players without a useful affordable limited `harvest` exchange are skipped. Harvest-exchange usage is recorded by source and round, so an exchange used here has only its remaining allowance in the later feeding prompt. A61/C29/C54/C98/C110/D70/E110 declare the currently supported grain or wood demand; providers are discovered from exchange metadata rather than a card-ID list.

An ordinary Harvest removes crops with `reap(..., { trigger: { phase: 'harvest' } })`; the event layer records `reason: 'reap'`. For each field, `computeHarvestCount(state, player, field)` first returns the crop amount moved by ordinary reap plus `sources`, `tags`, and `scope`. An individual card may alter `delta`, set `override`, add semantic `tags`, or elevate `scope` to `field` only through `registerHarvestCountModifier(cardId, modifier)`. It must not add a card-specific branch to the main `reap` path. Default `top-stack` scope harvests only the original top stack; only a full-field effect such as E73 uses `field` scope across stacks.

`HarvestReapSummary.harvestedCrops` records actual harvested amounts and sources by field and crop. `HarvestReapSummary.harvestCountApplications` records the count, sources, tags, and scope of every harvest-count application by field, crop, and scope, including zero-harvest supply-instead-of-field applications such as E112. A later card that asks how a harvest rule actually applied must read these applications, not inspect another card's `cardStates`. Thresholds for extra-harvest choices such as A112 and D72 extend through `registerHarvestSelectionThresholdModifier()` and `computeHarvestSelectionThreshold()`. The helper receives only current `state`, `player`, `field`, `sourceCard`, and `baseThreshold`; registered modifiers return lower-threshold sources, so callers never read a specific external-card ID. `grainFields` and `vegetableFields` count harvested fields, not crop amount. After each crop, `dispatchReapListener(state, player, crop, amount, ..., { trigger, sourceCard })` emits a synthetic `reap` event. Returned listener flows do not execute during dispatch; they accumulate into an ordinary parallel stage flow, all complete, and then `onAfterReap` begins.

After `onHarvest`, `postReapAnytimeWindow` walks players in Harvest order before the feeding phase starts. It creates a skippable synthetic choice only when `buildAnytimeEntries()` finds an executable registry action or card-listener flow. A completed anytime flow returns to the same player and rebuilds availability from live state; no remaining entry advances automatically, while Pass advances explicitly. Only after every player finishes does `executeFeedingLogic()` snapshot `remaining` and `foodUsed`, so resource changes in this window are included without unlocking the real `feed` or `heating` pending interactions.

`computeHarvestFeedingRequirement(state, player)` calculates feeding need using the default `familySize * 2 - newbornCount`. Cards such as E30 and E159 that change only required food extend the formula through `registerHarvestFeedingRequirementModifier(cardId, modifier)`. They do not add `BeforeFeed` or `AfterFeed` stage hooks or card-specific branches to the feeding path.

A Harvest outcome summary is a fact about this Harvest, not an intermediate log cache. `harvestReapSummary` accumulates crops actually reaped in the field phase; `harvestBreedSummary` accumulates newborn animals actually produced in breeding. Both remain until all `onEndHarvest` and `onAfterHarvest` hooks finish, allowing post-Harvest cards such as E134 to read actual results. Do not add top-level `state.harvestOutcomeSummary`; cards compose the existing summaries through `getHarvestOutcome(state, playerId)`.

During breeding, `getBreedThreshold(state, player, animalType, { sourceCard })` calculates each animal's threshold, defaulting to two. It enumerates only played cards' `CardImpl.effect.computeBreedThreshold`, taking the smallest threshold among modifiers for one animal type. Cards that change this Harvest's player processing order use `CardImpl.effect.computeHarvestBreedOrderPriority(state, player)`, default zero; larger numbers run later and ties preserve Harvest order. This hook affects only breeding. E84 returns a sheep threshold of one only for `sourceCard === 'harvest'`, allowing one sheep plus capacity to produce a newborn directly in Harvest breeding and recording it in `harvestBreedSummary.resources.sheep`. Cards must not infer newborn facts from specific card IDs, live animal counts, or virtual resources. A breeding modifier's effect must first appear in `harvestBreedSummary.resources` before a later card consumes it.

`reap` is an internal action executable by `ActionFlow`. A private-field harvest enters the same action through `trigger: { phase: 'private-field-phase', cardId: sourceCard }` without starting a complete Harvest: it reaps ordinary fields, then Card Fields, and omits Harvest-summary writes. `immediatelyAfter.reap` reactions from ordinary fields and Card Fields still combine into one ordinary parallel flow.

`onAllWorkersPlaced` runs after every player has placed all workers but before `performRoundEnd`. At this stage, `place-farmer` with `params.fromSupply` can activate a supply worker and place it immediately. It also accepts `actionContext.temporaryFromSupply + temporaryWorkerId` for a supply worker held by a card. That worker is not marked active and does not count toward family, housing, feeding, or scoring; the card clears its lifecycle in `onReturnHome`.

Stage hooks can return `ActionFlow`; `continueStageHook` and `continueAllWorkersPlacedHooks` route every hook-created subflow through `EngineStack.push`. Future meeple resolution uses three round-start steps. `futureMeepleReceives` first groups matured ordinary resources per player into one internal `receive` transaction with `resource.moved.reason='receive'`, preserving each entry's `sourceCardId`; Receive listeners therefore fire once, and Gain listeners do not fire implicitly. `futureActionAnytimeWindow` then walks only players with a matured action token, skips players without a currently executable standard `exchange`, and rebuilds that exchange from live state after each nested flow. Card-sourced anytime abilities are excluded so effects scheduled for future round starts cannot enter before the current round's `onRoundStart`. Only after that window does `futureMeepleActions` build action feasibility and `applyFutureMeeples` consume the token, turning `field` into optional `plow` and `stable` into optional free `stables`. An entry may carry `actionContext`, so paid actions such as D91 can use resources produced by the receive transaction or the exchange window. The next round freezes `roundFirstPlayerId` from the live start-player marker before `onBeforeStartOfTurn`. `onBeforeWork` then resolves cards whose text says "before the work phase"; a marker transfer there remains live but affects only the next round's freeze. After those flows complete, normal `onRoundStart`, the existing start-of-work timing, follows. Work entry and order consumers such as E56 Roman Pot derive the cyclic order from the frozen id; if before-work placements exhaust that player while another can still act, entry advances to the first eligible player in the same frozen order. If actual before-work placements exhaust every player, the normal all-workers-placed cascade starts immediately; a round with no placed workers remains idle. Both stages resume without repeating round-start initialization.

The three Harvest-field stage hooks run in player order. On entry for each player, every triggerable card effect compiles into an `activate-card-effect` activation and enters `ParallelNode(mode='trigger-select')`. Ordinary `reap` still occurs after `onHarvestFieldPhase` reactions finish. `onBeforePlayerTurn` is the non-flow skip-control exception: it synchronously returns `{ skipTurn?: true } | void` at labor-turn entry, never returns `ActionFlow`, never enters `continueStageHook`, and cannot create pending state.

`onBeforeEndGame?: FlowEffectHandler` is the stage hook before final scoring. After round 14, Before-End Player Dispatch creates `activate-card-effect` activations in target-player seating order. Default `beforeEndGameScope` is `owner`; a played card with `allPlayers` can run in every target step. `handHooks` do not support `onBeforeEndGame`. Multiple activations for one target normally enter trigger-select, and `beforeEndGameMandatory` determines the pass gate. The hook flow may create pending state and resumes at the next target through `stageResume.hook='onBeforeEndGame'`.

After every before-end target completes, `preScoringWindow` walks players in seating order and queries only `anytime` listeners marked `preScoring: true`. A player with no currently available marked flow is skipped without an empty interaction. Otherwise an optional XOR offers the available card flows; completing one flow rebuilds the same player's window against live state, while Pass advances to the next player. This ordering lets resources granted by `onBeforeEndGame` be spent. An anytime listener may declare `blockedAnytimeInteractionKinds`; entry construction and command revalidation both exclude it while the current pending request has one of those kinds. Only after every player passes or has no available marked flow does the engine set `gameOver` and enter the `gameover` interaction.

When a stage-hook subflow produces private events, nested `respond()` calls must not drain the outer response buffer early. A `stageResume` continuation preserves private events until the outermost response sends them together.

A stage-hook subflow may remove the card currently being resolved, for example by passing it. In addition to numeric `cardIndex`, `stageResume` stores `resumeAfterCardId`. On restoration, it continues after that card if it remains in the played-card list; if the card was removed, it resumes from one position before the old index so it does not skip the next card's same-stage hook.

A one-time optional offer in a future round does not belong in a `futureMeeples` resource token. The internal `scheduled-offer` action reads `player.cardStates[cardId].extraData.scheduledOffers`. An offer records `dueRound`, `kind`, cost, its target special action or animal, and `consumed` or `consumedRound`. `onRoundStart` passes due offers to the engine through `scheduledOffersRoundStartFlow()`. Execution consumes the token first, then decides from current state whether to prompt. Declining, lacking resources, or having an unavailable target never preserves the token. M056 reuses the Cut Peat special-action card's availability, cost, market or opponent face-up state, and flip rules through this action. M131 uses the same model to buy a reserved animal, then explicitly enters `reorganize`.

### 7.7 Listener activation purity and the reference alignment

**Architecture decision, 2026-05-13: `CardListenerRegistration.handler` must be a state-pure flow builder on listener-dispatch, preview, and doability paths.** It may read `GameState`, `PlayerState`, and events and return structured values such as `ActionHookResult`, `ActionFlow`, costs, doability, or extra options. It must not directly mutate `GameState`, `PlayerState`, `ActionSpace`, `player.cardStates`, resources, farmyard spaces, logs, or pending state.

The no-peek worktree changed `buildPhaseTrailingNodes` so it does not execute handlers. That was only the Phase 1 safety boundary. Later design must not depend on dispatch-time handler peeking or a one-shot `preComputedResult`.

The reference reference semantics are:

- `PlayerCards::getReaction($event)` only collects listening cards and creates `ACTIVATE_CARD` leaves; it does not execute card-listener bodies.
- `ActivateCard::getFlow()` invokes the card method when the leaf actually advances. `isDoable()`, `isIndependent()`, and `getDescription()` may also rebuild the flow, so a listener method must be repeatable and side-effect free.
- Real state mutation occurs in an action or `SPECIAL_EFFECT` leaf, never while constructing a reaction.

OA alignment rules are:

- A listener that changes resources, animals, the farm, `cardStates`, or logs must return a leaf or sequential flow so an action such as `gain`, `pay`, `special-effect`, or `exchange` performs the mutation.
- If no generic mutation leaf exists, add a reusable internal action. Do not mutate inside a single-card handler or add a single-card branch to a core path.
- Nonlistener execution such as `effect.onBuy` may keep its current form, but must become a state-pure flow builder if listener, preview, or doability code reuses it.
- Stage card-effect handlers execute against cloned state and players during trigger-select preview. A returned flow or detectable clone mutation can establish applicability and doability. Pure resource preview reads the activation player's resources and supply tokens. Real mutation occurs only after the activation leaf is selected.
- Dispatch must not execute a handler to manufacture one-shot `preComputedResult` semantics. It may collect registration metadata, build activation leaves, and issue pure doability or preview queries.
- A listener activation is an ordinary internal leaf: `actionId='activate-card'`, with `{ listenerId, cardId, event, ownerPlayerId, triggerPlayerId }` in params. `event.actionContext` must preserve the triggering leaf's target context, especially `targetSpaceId` written by card-granted placement, jump, or wrapper actions. Otherwise execution could fall back to the outer frame's space. The activation bypasses the public-action pipeline and does not run ordinary action hooks, costs, or generic logging. Returned `flow` or `followUpActions` goes back to the engine.
- Owner and trigger player must be explicit in events and params. An opponent-scoped activation executes as the owner. Runtime owns cross-player confirmation and undo boundaries; they are not exposed to cards as flow primitives.
- `confirm-player-switch` is owned and submitted by `fromPlayerIndex`: the outgoing player explicitly hands control to `toPlayerIndex`. Confirmation must immediately create an undo boundary. When the target player then enters the cross-player prompt, `allowedCommands` does not expose `undoStep` or `undoAction`. `SessionResponse.historyLength` and `hasActionStartSnapshot` describe currently executable undo, not raw internal history. After the target chooses, undo can go back only to the post-switch prompt and never across the triggering player's action state. Completed frames skip exhausted nested return points and switch directly to the frame owner; an intermediate responder is revisited only when another interaction actually targets that player. A direct foreign-response frame such as `animal-reorg` has no separate switch confirmation, so it blocks undo while pending and persists `undoBoundaryOnResolve`; every submitted response is itself a boundary and cannot restore the initiating player's state or reopen the foreign prompt.

**Wave 1 rule, 2026-05-13: a listener handler no longer bridges "mutate first, then return a flow."** For the migrated B48, E103, C148, A144, D82, and D27 cards, a handler only reads current state and returns a replayable flow or pure query:

- Counters, flags, infobox state, stack pops, and major-improvement swaps use `special-effect` leaves. This wave added `set-counter`, `pop-card-stack-top`, and `swap-improvement-with-board`.
- Cross-player rewards use `gain.recipientPlayerId` or `payerId`; handlers do not mutate the trigger player's resources.
- Flow expresses optional accept or decline. D27 Retraining first performs `set-flag false`, then places `swap-improvement-with-board` in an optional child. Declining only clears the flag and neither reserves nor rolls back the public major-improvement pool.
- A listener that affects only reachability or cost returns pure `doable`, `costs`, or `bonuses`. D82 Hunting Trophy models farm or house redevelopment through a space-ID-scoped `isDoable` and `computeCosts`, without before-or-after flags or a temporary `activeModifiers` bridge.

**Wave 2a synthetic-dispatch boundary, 2026-05-13:** listener dispatch without a full engine, such as `trade-applied`, `harvest-feed-conversion`, or `future-meeple-resolved`, executes only deterministic state-synchronization leaves through the immediate-special-effect helper. The helper traverses nonoptional `special-effect` leaves and deterministic sequential or parallel flows. It deliberately skips `gain`, `pay`, interactive and optional flows, `or`, `xor`, and cross-owner targeted flows. A richer synthetic-listener effect must enter a real engine-flow path, not expand this helper. This keeps Wave 2a card-state-only synthetic listeners pure without restoring dispatch-time mutation.

`reap` now uses a real engine-flow path: Harvest and private `reap` triggers collect listener flows and advance an ordinary parallel node. Round-start future-resource entries likewise use a real `receive` action. `harvest-feed-conversion` only places committed `harvest.feedConverted` events in listener `transactionEvents`; it does not synthesize `resource.exchanged`. `future-meeple-resolved` groups committed `futureMeeple.resolved` events by target player into listener `transactionEvents`. None of these synthetic dispatchers contains card-specific branches.

**Wave 2b/c rule, 2026-05-13: card-state and structural mutation inside listeners must also execute through action leaves.** Remaining handler mutations for A68, A73, A92, B18, B34, B76, C48, C53, C88, C93, C130, C150, D36, D56, D74, D158, E53, E74, E85, and E148 were moved out:

- `special-effect` became the generic listener-purity mutation dispatcher, adding `clear-pending-fence-bonus`, `consume-pending-extra-turns`, `remove-future-meeples`, `promote-first-newborn`, `add-resource-to-space`, `build-stable-on-first-empty-tile`, `record-scoring-reserve-bonus`, `add-farmyard-space-state`, `claim-farmyard-goods-tokens`, `claim-field-goods-tokens`, `grow-field-and-non-field-crops`, and `consume-supply-token`. `record-scoring-reserve-bonus` records only final Scoring Reserve and bonus VP; it does not deduct real resources. Server-side `actionContext.targetPlayerId` resolves the target, and `reserved` must contain nonnegative integers for real resources no greater than `target.resources - existing Scoring Reserve`. Shared-scoring cards may store `cardType` with the record so a target who does not own the source card still retains its category in the score entry.
- Future-meeple writes such as B18 use lazy flows. An after-pay listener no longer queues them immediately.
- C93 and C130 write action-space resources through `special-effect.add-resource-to-space`; extra placement remains optional.
- E148's opponent-scoped listener updates reserved action spaces or stables with an owner-targeted `special-effect`. A no-benefit synchronization such as removing a marker when no empty space exists may return `countCardUse: false`, avoiding a false card-use statistic.
- `countCardUse: false` is only for housekeeping flow that should not count as an effect firing. It must never conceal a real benefit or player choice.

**Multiple reactions in one phase use parallel trigger selection:**

- Action-reaction listeners, Harvest-field stage card effects, and before-end card effects for one owner and phase normally enter `ParallelNode(mode='trigger-select')`. Same-timing reactions for different owners become separate owner prompts. A single child may expand directly to reduce UI noise. Compute and query hooks continue to aggregate deterministically.
- Do not invert the default for `mandatory`. `mandatory: true` affects only trigger-select: a structurally applicable and executable mandatory child disables `__pass__`, preventing a guaranteed effect from being silently skipped. A temporarily structurally inapplicable child is hidden for this iteration without being resolved and is reevaluated after siblings change state. A structurally applicable but temporarily unaffordable child remains visible as disabled.
- If multiple optional or interactive triggers are available, the card owner explicitly chooses their order and may pass over the remaining optional triggers. The dispatcher no longer sorts automatic flows separately from interactive flows. Trigger-select preview and real action-leaf validation jointly decide whether execution can continue. A select-trigger option normally uses the card ID as `value`; if siblings repeat the same `sourceCard`, because one card has multiple listener children, `value` becomes the activation-node ID while `sourceCard` remains the display ID.
- Generic `ParallelNode` owns select, pass, mandatory, and independent semantics. There is no listener-specific runtime node.
- Trigger-select preview supports card-listener `activate-card`, stage-card-effect `activate-card-effect`, and extra-turn-provider `activate-extra-turn` children. Card-listener and stage-card-effect children create preview state and players for the child owner or target. Card-listener preview and activation both resolve `context.space` from the child event's `targetSpaceId`. Pure resource-flow preview uses that execution player's resources and fence or stable supply tokens. Select-trigger pending state preserves the host action's `targetSpaceId`, so the listener still sees the triggering space during activation. A stage-card-effect child executes the live hook against cloned state and players; a returned flow or clone mutation establishes applicability and doability and updates pass-disabled state. If a one-shot extra-turn provider no longer contributes a flow at real activation time, it fails instead of silently consuming the provider prompt.
- Do not add or revive an `order` field on `CardListenerRegistration`. Stable fallback ordering comes from `playOrderIndex`, with occupation before minor before improvement and array index within each. It serves only single-child expansion, display, and deterministic serialization. Use parallel trigger selection when the player must choose.

**Bake and trigger-select rule, 2026-05-14.** `bake-bread` is nonempty by default. An optional bake opportunity must use outer optional flow metadata. `ParallelNode(mode='trigger-select')` displays structurally applicable triggers, including currently unaffordable options as disabled; the server rejects a disabled choice and leaves it unresolved. For a before-action trigger-select, `__pass__` is disabled only when skipping the remaining triggers would make continuation impossible and at least one currently enabled trigger can make the action layer prove direct completion or reachability through the remaining before-select chain. Pure resource flows pass previewed resources into the continuation guard. Nonresource flows call the same guard with current resources, so cards such as D17 and C60 can express reachability through scoped `isDoable` listeners instead of engine simulation. The engine calls generic continuation guards and imports no bake-bread, D66, or oven rules; bake-specific direct continuation and before-chain reachability remain in the action and card layers. Compact structured choice values such as `bulk:` are allowed by `InteractionRequest.kind === 'choice'` metadata through `structuredChoicePrefixes`, never by engine action-ID special cases.

**Replacement-aware trigger pass, 2026-05-15.** A before-action trigger-select pass gate cannot inspect only base `canBeExecutedByPlayer`, and cannot apply complete `applyIsDoable`, because that would count a same-batch before unlocker as a reason it may itself be skipped. The current rule first checks whether the original action can continue with `skipBeforeTriggers=true`. If not, only generic `computeReplace` fallback participates in the continuation check, with `checkedReplaceAction=true` during startability preview to prevent replacement recursion. This covers paths such as B26 Agrarian Fences, where fencing replacement remains reachable after D66 is skipped, without hard-coding card IDs in the engine.

All declined `computeReplace` alternatives are preserved in deterministic listener-ID order. A contributed top-level `xor` expands into ordered replacement branches before the original-action branch is appended. Each runtime replacement branch skips only its own producer plus inherited guards, so sibling replacements remain available for nested actions; it does not carry `checkedReplaceAction`, and normal before and after listeners still run. The original fallback retains `checkedReplaceAction=true`, which only disables another replacement pass.

**Before-reachability decision, 2026-05-22.** Multiple same-time `before` listeners are not a chain that availability code may statically sort or preview. They are a real trigger flow whose order the player controls through `ParallelNode(mode='trigger-select')`. If a card can bring an initially unreachable action into the before flow, it opts in through a scoped `isDoable` listener returning `doable: true`, and exits for a continuation carrying `actionContext.skipBeforeTriggers === true`. After every before listener and its after, exchange, and optional branches really execute, the original action leaf reruns strict doability against real state. If still unreachable, the action cannot continue and uses existing blocked or undo-only semantics.

Do not add single-card payment preview for before-granted reachability, and do not have the dispatcher enumerate listener order or statically simulate resource and conversion chains. The reference model is C60 Small Potter's Oven, D66 Potter Ceramics, and `STUB_BeforeBakeGainClay`: allow entry to trigger-select, let the player run unlockers in the real order, recalculate remaining triggers and the pass gate against new state, then strictly check final continuation.

**Provisional continuation settlement, 2026-08-29.** Every public mutating `GameCore` command crosses one atomic settlement boundary with a normalized identity and a complete command-entry checkpoint. When an unresolved mandatory host first switches responder or produces a Protected Observation during its `before` chain, the session opens a Provisional Continuation Scope at that command checkpoint. Scopes follow the engine's mandatory-host ancestry: one host reuses one scope, a nested host creates a child, child abort restores only its checkpoint, and an unguarded parent abort restores its subtree. Every command boundary probes active hosts with `skipBeforeTriggers=true`; a successful probe establishes a guard, and a later command that breaks a guard is restored before publication. Undo history preserves the restored host frame's identity, so settlement retains its scope and atomically rejects an undo that would break an established guard. Activation descendants suppress only the `before` listener that produced them, so a different listener may still create a genuinely nested host.

Protected random and hidden-information primitives report observations to the active settlement. A dev command that moves a card from any hidden hand to a public zone reports the reveal before clearing the hand. The command publishes only if all still-active ancestors are guarded; a host completed in the same command is excluded from this gate, while any unguarded active ancestor still restores state, engine/session cursor, events, hidden zones, and RNG state to command entry. Strict replacement probes run each alternative leaf through the same `isDoable` hook and listener pipeline as a direct action. The normalized failed command remains unavailable until rule-relevant state changes. Set-valued command fields, including `commitSelection` farm elements and animal-reorganization `choice.payload.zones`, are normalized independently of array order. Automatically declining an exhausted optional flow uses a nested command settlement because resolving `__skip__` can execute further effects. Successful provisional commands and failed commands that persist this failure memory carry an internal durable-transition marker, so `RoomCommitter` records a Replay Step even when the public Frame hash is unchanged; independently, it hashes the private `sessionCursor`, so ordinary cursor-only transitions also persist without exposing that cursor in Replay Frames. A durable rejection sends its error only to the submitting socket while peers receive the committed version as an error-free snapshot. After restoration, a reason-specific public log distinguishes a guard-breaking choice from a blocked random or hidden-information observation, explains why it was rejected, and states that retry remains unavailable until rule-relevant state changes. Persistence keeps authoritative `state`, public/replay `frame`, and private `sessionCursor` separate: scope ancestry, rollback checkpoints, guards, and failure memory survive recovery but never enter Replay Frames. Only command keys matching the current rule state and pending interaction are projected to that interaction's recipient as `rejectedCommandKeys`, so the shared client submit path can disable an exact retry for every request kind. Scope abort appends its own explicit rollback log and a new restored Frame; it never rewrites earlier Steps. See ADR 0015.

### 7.8 Farm-type commit

All five farm types close their logic inside their own `ActionDef.resolveChoice` under `shared/actions/effects/`:

- **Room** in `construct.ts`: `room-payment.ts` expands per-room cost variants and appends this action's `computeCosts` `costTrades`, `costBonuses`, and `paymentResourceProviders` to construct `ComplexCost`. Farm selection uses the same adjusted construct cost for `maxSelections`. Multiple payment solutions create a second `pay:room:*` prompt before finalization. Doability checks both the affordable maximum and reachable room selection. The generic protected-action guard rejects direct cancellation.
- **Stable and plow** in `stables.ts` and `plow.ts`: typed-flat payment parsing.
- **Fence** in `fencing.ts`: validate selected edges, sources, connectivity, and closed regions; derive `newEdges`; calculate wood with `freeFences`, `extraWood`, and fence-cost-unification farm-choice computeCosts Pass 2; then pass that pass's trades, bonuses, payment-resource providers, and payment budget into `pay:fence:*`. Multiple solutions create a second `pay:fence:*` prompt.
- **Sow** in `sow.ts`: validation and finalization without a payment combination, including extra-field effects through `getPermittedExtraSowableFields` and `handleSowExtraField`.

The first-round farm-type payloads are `fence: {edges, palisadeEdges, extraWood, fenceSources?}`, `room: {rooms}`, `stable: {stables}`, `plow: {tile}`, and `sow: {crops}`. WebSocket `{type:'choice', value:'confirm', payload}` passes through `resolveChoice`. For a second round, `extraData.actionContextWrite: {farmPayload}` persists it to `pending.actionContext.farmPayload`, and the `ActionDef` reads it back from `ctx.actionContext.farmPayload` while parsing that prompt.

`plow.actionContext.allowedTiles` limits coordinates for this plow. `plow.actionContext.adjacencyPolicy` controls adjacency only for this action, using `ignore` or `notAdjacentToFields`; it does not change the default adjacency rule of later ordinary plow actions.

#### 7.8.1 Fence-segment and policy invariants

`FenceSegment.type` and `FenceSegment.source` are independent dimensions. Type describes the segment form, ordinary fence or B30 palisade. Source describes whose token created it. A default ordinary fence is treated as own ordinary source. B30 Wood Palisades is a different segment type. A borrowed fence is an ordinary segment with `type='fence'` and `source.kind='borrowed'`, not a new type.

The main fencing path must not branch on card IDs or card-specific flags. Do not add `C1`, `B30`, `E149`, `noWoodPalisades`, or `midnightFencer` branches to `fencing.ts` or farmyard validation. Card-specific behavior uses generic `fencePolicy`: `allowedSegmentTypes`, `sourcePolicy`, `segmentBounds`, `newPastureBounds`, `newRegionBounds`, `connectionPolicy`, `allowedNewRegionTiles`, `allowTerrainInNewRegions`, `suppressTerrainRegions`, `costPolicy`, `paymentBudget`, `cancelPolicy`, `preserveAnimalTotals`, and `promptHintKey`.

`sourcePolicy: { kind: 'borrowed', donorCaps }` means token source, build limit, and segment source for ordinary fences come from donor caps. The commit payload must use `fenceSources: Record<edgeId, donorPlayerId>` to identify a donor for every new ordinary fence. The server reclamps each cap against current donor reserve, then checks that source keys exactly cover new ordinary edges, no donor exceeds the cap, and no donor is the active player. A successful segment records its borrowed source and consumes donor supply through `supplyTokensConsumed.fence`. That donor's later `getOwnOrdinaryFenceReserveCount()` and own ordinary-fencing maximum naturally decrease. `farm.fenceBuilt.fences` must include complete new `FenceSegment[]` values, including source owner.

`segmentBounds.fence` and `.palisade` limit new segments of their respective types. `segmentBounds.total` limits the combined number of new ordinary fences and palisades. A the reference total-segment limit such as B149 Open Air Farmer's `max => 6` uses `total.max`, and B30 palisades count toward it. `canStartFencing` first estimates generic policy resource and supply feasibility. Against real state it also calls `validateFenceSelection()` to preflight at least one legal commit, avoiding confirm-only pending state that cannot finish. `validateFenceSelection()` remains the atomic final validator and payment does not occur when it fails.

`fencePolicy.costPolicy` expresses only this action's base unit cost from the reference `formatCost`. Entry guards and final validation must still apply `computeCosts.fence` discounts and surcharges, so a nested action such as B93 future fencing continues to benefit from E16, C16, and similar modifiers.

`fencePolicy.paymentBudget` restricts only final resources paid, for rules such as B15 Carpenter's Bench allowing only wood collected by this action. It is not the same as `segmentBounds.total.max`, so legal geometry must not be trimmed early by the number of budgeted resources. Filtering by `PaymentSolution.resourcesPaid` occurs only after discounts, free fences, virtual payment resources, and solver routing.

`fencePolicy.promptHintKey` forwards only an interaction-copy key and never decides rules. The card file supplies the specific key; the frontend generically renders `promptParams.hintKey`.

C1 Overhaul counts, returns, and rebuilds only the player's own ordinary fences. Its `onBuy` first returns them using `consume-fence` with `sourcePolicy: 'ownOnly'`, then a `fencePolicy` limits the rebuild to ordinary fences paid from own ordinary supply. The generic protected-action guard rejects direct cancellation and preserves animal totals.

---

## Anytime Window Policy

The set of card-listener anytime actions available in a given pending interaction is computed once per `buildInteraction()` by `computeAnytimePolicy()` in `shared/session/anytime-policy.ts`. The helper is **server-only**; `client/` never imports it.

Inputs come from `GameCore.getAnytimePolicyInput()` using the same node-plus-composite fallback as `buildInteraction`:

- `hasActiveContext`: whether `getActiveInteractionContext()` is nonnull;
- `stageResume`: the current frame's `stageResume`;
- `interactionKind`: `node?.request?.kind ?? composite?.request?.kind`;
- `promptKey`: `node?.promptKey ?? composite?.promptKey`.

Output is `{ allowed: false, reason }` or `{ allowed: true, blockedIds }`. Rules are priority ordered and first match wins: no context; feeding locked; `confirm-next-player` allowed with `exchange` blocked; `confirm-player-switch` blocked; animal reorganization; exchange or bake-bread prompt key; default stage-hook-chain block; otherwise allowed without blocked IDs.

Three consumers share the snapshot:

1. `buildAnytimeEntries()` filters the auto-discovered registry and card-listener entries. It returns `[]` when not allowed and otherwise removes IDs in `blockedIds`.
2. `buildInteraction()` includes `takeAnytimeAction` in `allowedCommands` strictly when `allowed && entries.length > 0`, keeping UI and server views synchronized.
3. `phases/round.ts::takeAnytimeAction()` enforces the policy before anytime injection. Entry guards for game over, draft phase, and active-owner mismatch remain in the function; the policy sees only pending-shape inputs.

Nested anytime flows are inserted ahead of the current pending tree. The parent remains on its original host as a `PendingEnvelope`. After the nested flow resolves, `EngineStack` resumes the parent frame and `buildInteraction()` exposes the parent envelope again rather than going idle.

An anytime flow whose terminal reaction must run only after its full injected sequence may mark its final leaf with `INJECTED_ANYTIME_COMPLETION_CONTEXT_KEY`. Completion listeners require both that marker and the engine-added injected-anytime marker, so an idle top-level anytime action is not mistaken for a suspended-flow completion.

OA versus the reference design notes:

- Reorganize is a system-driven subflow in OA, not a player-triggerable anytime action, so the policy never emits a `reorganize` entry.
- `postReapAnytimeWindow` is the generic unlocked opportunity after `onHarvest` and before feeding state is calculated. It uses the ordinary anytime registry/listener query, contains no card-ID branches, re-evaluates after every nested flow, and skips players with no executable entry.
- `futureActionAnytimeWindow` is the narrow standard-`exchange` opportunity after matured resources finish their real `receive` transaction and before future action feasibility is built. It is offered only to players with a matured action token, excludes card-sourced anytime abilities, and re-evaluates live state without card-ID branches.
- A `feed` pending interaction is locked because `executeFeedingLogic()` freezes `remaining` and `foodUsed` into `InteractionRequest`. The reference permits nested anytime actions in `ST_HARVEST_FEED` because its predecessor is an `EXCHANGE` state with no fixed budget.
- Idle work-phase turns and `confirm-next-player` are acting-player anytime windows. Legal anytime actions remain available before placement and before control passes. During `confirm-next-player`, `exchange` stays blocked to avoid recursive generic exchange prompts. `confirm-player-switch` stays blocked because it is a system-controlled cross-player transition inside another flow.
- Stage-hook chains carrying `stageResume` are blocked by default, preserving the invariant that system-driven hook chains do not yield to player anytime actions. Explicit exceptions are animal reorganization, exchange or bake-bread prompt keys, and D132's `ui.cards.D132_HideFarmer.optional` before-endgame choice prompt. D132's nested `resource-quantity-select` remains blocked because its maximum is frozen from current food and empty-space state and cannot safely resume after arbitrary anytime changes.

---

## 8. `shared/cards/`: Card Source closure

### 8.1 Card Source and projections

ADR 0002 defines the target state. A card author maintains one Card Source:

```ts
export const A123_FrameBuilder = defineOccupationCard({
  meta: { id, name, deck, number, category, desc, cost, players },
  impl: { modifiers, listeners, effect, prerequisiteCheck, reaches },
})
```

| Concept | Form | Readers |
|---|---|---|
| Card Source | `shared/cards/{A..E,major,community}/{Card}.ts`, containing `meta` and optional `impl` | Server, sandbox, and tests; forbidden from the main client bundle |
| Card Display | `public/cards-manifest.json`, built from Card Source `meta` | Main client bundle through `client/services/card-meta` |
| Card Impl | Card Source `impl`, projected into `shared/cards/catalog.generated.ts` and `CardRegistry` | Server and sandbox; forbidden from the main client bundle |

The target state removes `shared/cards-display/` and generates no shadow display directory. `shared/cards/community/*` uses the same single source as base and major cards. `shared/cards/community/auto-catalog.ts` no longer exists.

`meta` is the Card Definition. It contains only serializable, frontend-visible fields without runtime behavior. Declarative rules fields such as `cost`, `prerequisite`, `occupationPrerequisites`, `improvementPrerequisites`, `cardField`, and `isCookery` are allowed. `modifier`, `modifiers`, `listeners`, `effect`, and `prerequisiteCheck` are forbidden. `desc` preserves printed card text; optional localizable `rules` contains separate supplemental rulings or implementation limits and never changes runtime behavior. `prerequisite` is printed text, structured static conditions use the `*Prerequisites` fields, and dynamic conditions use `impl.prerequisiteCheck`.

`impl` is the Card Impl and contains `modifiers`, `listeners`, `effect`, `prerequisiteCheck`, helper calls, and `reaches`. Modifiers belong to the implementation, not Card Display. Builders may statically extract `reaches` and project it at the top level of the manifest, but it does not belong in `meta`.

`scripts/build-cards-manifest.ts` must statically extract `meta` with the TypeScript AST. It must not import a Card Source or generated catalog at runtime. `meta` may contain only JSON-like literals and simple same-file constant references; `impl` may contain arbitrary runtime code.

### 8.2 Generated catalog and registry

| File | Role |
|---|---|
| `shared/cards/catalog.generated.ts` | Generates `allCardSources`, `minorImprovementCards`, `occupationCards`, `implemented*`, and `ALL_CARD_IMPLS` from Card Sources |
| `shared/cards/active-registry.ts` | `CardRegistry` singleton |
| `shared/cards/registry.ts` | `CardRegistry` class with `loadByIds` and `unload` |
| `shared/cards/custom-registry.ts` | Server and sandbox runtime implementation, session context, effects, listeners, and modifiers for `CUSTOM_*` cards |
| `shared/cards/custom-card-metadata.ts` | Frontend `CUSTOM_*` Card Display, artwork URL, and O number |

Production paths access cards only through `catalog.generated.ts` and `CardRegistry`. Tests may import an individual Card Source for exact assertions. The target state removes `CardBase`, `MinorImprovement`, `Occupation`, and `PlayerActionCard` class semantics. It uses a plain Card Definition with `kind: 'minor' | 'occupation' | 'playerAction' | 'major'`, and replaces `instanceof` with `kind`.

`CardRegistry.loadByIds(ids, lookup)` and `unload(id)` support dynamic per-room card loading.

### 8.3 Local state in `cardStates`

- Persistent counters, one-time flags, and local state belong in `player.cardStates[cardId]`, not top-level `PlayerState`. Shared farmyard-space state across multiple FoM minor improvements is an exception stored in `player.farmyardSpaceStates`; it contains only authoritative blocked-space, farmyard-goods-token, field-goods-token, and non-field-crop-space metadata. Shared helpers distinguish placement lock from farmyard used or unused state. FoM Farmyard Extension geometry is another exception stored in `player.farmyardExtensions`, because it changes shared farmyard geometry rather than one card's local state.
- History used by one card or a small set of cards should live in `cardStates[cardId].extraData`. If the history must begin before a card is played, use an explicit hand-zone listener rather than a global statistic.
- A complex card interaction that waits for a later player choice uses an explicit continuation through `pending` and `EngineStack.push`, never a hidden shared slot.
- The recommended shape is `{ cardId, kind:'choice'|'delayedEffect', payload }`.
- A card may hold a worker in `cardStates[cardId].extraData.heldWorkerId`, where the worker is neither in `takenBy` nor at home. `shared/cards/helpers/card-held-workers.ts` supplies `holdWorkerOnCard`, `getWorkerHeldOnCard`, `releaseWorkerFromCard`, and `getCardHeldWorkerIds`; return-home releases all held workers. `family-growth` can use `actionContext.holdNewbornOnCard` to place a newborn directly on the card, avoiding action-space occupancy before return-home and preventing reuse as a capacity source.
- A card may write read-only UI markers to `cardStates[cardId].extraData.farmTerrainMarkers`. FarmBoard renders a marker inside its terrain tile, while backend card state remains authoritative for rules.
- A card may write cross-player public markers into the target's `cardStates[sourceCard].extraData.publicCardMarkers`. A helper aggregates them and scoring writes them to `cardBonusVp`. FarmBoard displays them in the source player's summary area, not outside the farm board.

### 8.4 Convenience helpers under `shared/cards/helpers/`

- `pay-gain-node.ts`: templates for gain after payment, an appended action after payment, or returning resources to the current space before gaining.
- `stage-effects.ts`: stage card-effect flags, immediate payment, bonus VP, and one-time Harvest exchanges.
- `card-state.ts` and `round-placement.ts`: one-time `flagged` or `extraData` state and placement order this round.
- `action-snapshot.ts`: the active Turn Scope identity and start snapshot described in section 6.5. Per-action deltas belong to action transactions, not this snapshot.
- `card-held-workers.ts`: worker holding described in section 8.3.
- `card-field.ts`: declarative card-as-field factory described below.

### 8.5 The generic `cardField` extension

`CardDefinition.cardField` declaratively configures a card as a field:

```ts
cardField?: {
  allowedCrops: readonly ('grain' | 'vegetable' | 'wood' | 'stone')[]
  capacity: number
}
```

`shared/cards/helpers/card-field.ts:makeCardFieldImpl(cardId, def, options?)` derives `onComputeSowableFields`, `onSowExtraField`, `onHarvestFieldPhase`, and a `sow-isDoable` listener from the definition. An individual card declares only the configuration and an optional `onReap` callback for side effects, keeping the file near or below its the reference counterpart's size.

Virtual tile columns derive from `deriveVirtualTileCol(cardId, slotIdx) = deckOrdinal*1000 + cardNumber + slotIdx`, preventing cross-deck collisions. Capacity slots for adjacent numbers in one deck require auditing; the current 11 cards all have capacity at most three, leaving ample margin.

Each occupied slot is projected as a virtual `Field` and uses the same `computeHarvestCount()` pipeline as an ordinary field. Multiple slots on one Card Field share the card id as `groupKey`, so they are one Logical Field for selection limits; a field-count modifier applies once to the canonical selected slot, while normal Reap still harvests every occupied slot.

The side-effect callback is:

```ts
onReap?: (ctx: {
  state: GameState
  player: PlayerState
  crop: ExtraSowableCrop
  amount: number
  isLast: boolean
  cardId: string
  trigger: ReapTrigger
  sourceCard?: string
}) => ActionFlow | void
```

The callback runs once per crop. Infrastructure wraps multiple returned flows in ordinary `parallel`. This matches the reference `$this->field = true`, `getFieldDetails()`, and `onPlayerAfterReap` semantics.

**Harvest reap-log ordering.** `harvestReapSummary` initialization moved from `continueHarvestReap` to the earlier `continueHarvestFieldStart`. Infrastructure accumulates `summary.resources[crop]` during `onHarvestFieldPhase`, so `log.reapDetail` contains both ordinary-field and Card Field production. Previously the Card Field accumulation happened before summary initialization and was discarded. The summary is not a field-phase local; it remains until `onAfterHarvest` finishes.

A private `reap` trigger reuses the same Card Field reaper registry with `updateHarvestSummary: false`, preventing a private-field phase from contaminating ordinary Harvest log summary.

The 11 cards currently migrated to this helper are B68, D75, E80, D25, E72, C70, E68, E69, E70, B113, and B141.

### 8.6 Naming and constraints

- Card files use `{Deck}_{Number}_{Name}.ts`, for example `A123_FrameBuilder.ts`, and export a constant with the same name.
- Keep a card's ability closed inside its card file wherever possible. Do not spread it into core files such as `shared/actions/effects/pay.ts`, `shared/actions/effects/improvement.ts`, `shared/session/session-core.ts`, or `server/game/authoritative-session.ts`.
- Prefer hooks, generic `CardDefinition` fields such as `cost`, `reward`, and `prerequisite`, and `cardStates`.
- Forbidden patterns are card-specific conditionals in core files, centralized card-effect registries, and frontend card-specific rules.

Runtime cross-card identity and capability queries must use typed `CardDefinition` metadata and played-card helpers: `getPlayedCardDefinitions(player)`, `collectCardDefinitionsAs(player, type)`, and `playerHasCardCapability(player, capability, { asType? })`. They inspect only `player.improvements`, `player.minorPlayed`, and `player.occupationPlayed`, never hands. `asType` reuses `cardCountsAs`, preserving existing identity semantics for dual-type cards.

Registered generic metadata currently includes `preventsHandDiscard`, `fireplaceIdentity`, `cookingHearthIdentity`, `ovenIdentity`, `firewoodBuildTrigger`, `potteryIdentity`, `animalHolder`, `blocksHouseAnimalZones`, and `waresSalesmanGains`. These fields belong to Card Source `meta` and may project into catalog and manifest, but add no frontend behavior. In OA, `ovenIdentity` represents oven-family identity and includes upgrades or minors such as Oven Installation for Oven Damper-style scoring. This intentional project abstraction does not require every such card to provide a baking exchange or trigger Firewood. An upgrade may retain scoring identity while opting out of build-trigger semantics with `firewoodBuildTrigger:false`. Migrated paths include B146 and C35 hand-discard prevention, B153 major-identity scoring, C75 and A27 fireplace, hearth, and oven triggers, B31 pottery identity, E144 wares-gain options, D86 animal-holder occupation filtering, D12 house-animal-zone blocking, and M72 oven-family scoring.

`check:card-impl-boundaries` is part of `pnpm run check:architecture`, the canonical local architecture verification command used by both manual CI workflows. Runtime reads of another non-Major card ID in production `shared/cards/A-E/M/*.ts` must migrate to a generic capability, action-context provenance, Harvest outcome, breeding-threshold modifier, synthetic occupancy, trigger snapshot, or another extension point. `Major_*`, `reaches`, `allowedPurchases`, and prerequisite candidate lists are explicit exceptions. `--warn-only` is available for an intentional temporary audit but is not an integration-validation path.

When printed card text names another ordinary card, the source card may declare it as a named printed target. Its ID must appear in `reaches` or equivalent declarative metadata, and runtime may inspect only public facts such as existence, owner, or played status. The source must not inspect the target's private implementation state in `cardStates`, `counters`, or `extraData`, or simulate branches of the target's ability. A checker exception must bind one exact source-target pair and allowed read shape; a broad allowlist cannot bypass this boundary.

### 8.7 Minor-improvement passing

OA marks the reference passing minor improvements with `CardDefinition.passing?: boolean`. The host action in `shared/actions/effects/improvement.ts` first completes purchase payment through an internal `pay` child, then reads its result map and commits the purchase during `completeInternalChildren`. For a passing card:

- it does not enter `buyer.minorPlayed`; it is pushed into `nextPlayer.minorHand`, wrapping from `state.currentPlayerIndex`;
- it does not increment `totalMinorBuilt`, add `activeModifiers`, or enter `providesOccupation` or `isField` paths;
- it emits `card.passed` with `fromPlayerId`, `toPlayerId`, and `cardId` instead of `card.played`;
- `onBuy` still runs through internal `activate-card-effect` in `afterHostCommitListeners`, so the buyer receives the effect while the next player receives the card in hand for a later `actBuy`.

Listener isolation follows naturally: a passing card never enters `minorPlayed`, so `getPlayerCardIds` omits it and card-entered-play reactions skip it. No `apply-improvement` effect or `extraData.passing` scratchpad is needed. The improvement host action, pay child, and `activate-card-effect` jointly implement the reference passing behavior.

On the client, `PublicEventCardPassAnimation` subscribes to the `card.passed` event stream and animates the card between `data-card-anchor` and `data-hand-anchor` DOM anchors. LogPanel derives a `log.cardPassed` i18n entry through the existing `mapCardPassed` mapper.

---

## 9. `shared/domain/`: Domain aggregation

Derived views and invariant checks live here. `PlayerState` remains plain JSON-serializable data; every "can I do X?" query belongs to `PlayerBoard`.

```text
shared/domain/
├── player-board.ts          PlayerBoard and the playerBoard factory
├── farmyard.ts             farm-rule validation and normalizePlayerFarm
├── farmyard-interaction.ts interaction payload projections for farm-select and farm-position
├── pasture.ts              fence validation and computePasturesFromFences
├── animal-zones.ts         animal-zone capacity and accommodation
├── animals.ts              animal model
├── scoring.ts              scoring and PlayerScoreSummary
├── scoring-reserve.ts      final Scoring Reserve reads, aggregation, and scoring-clone deduction
├── farm.ts, field.ts, space.ts, farmyard-space-states.ts
└── index.ts
```

`PlayerBoard(player, state)` exposes three sub-boundaries: `farmyard`, `farmInteraction`, and `animals`. `farmyard` only validates and queries farm rules, such as `canPlow`, `canSow`, `canBuildFence`, `canBuildRoom`, and `canBuildStable`. `farmInteraction` only derives `farm-select` or `farm-position` `InteractionRequest` payloads from the current farm, action context, and payment feasibility. `animals` owns zone capacity and accommodation. A frontend local farm draft consumes only the server-provided interaction payload; it does not call these rule boundaries.

Domain aggregation is shared by the main client, sandbox, and server and therefore belongs to bundle-safe layer `[A]`.

Scoring Reserve is a final-scoring choice reservation, not part of the Payment Pipeline. A card writes `{ reserved, score, cardType? }` to the target player's `cardStates[sourceCard].extraData.scoringReserveBonus` through `special-effect.record-scoring-reserve-bonus`. `computeScores()` aggregates every selected reserve and deducts it from a scoring clone before running the existing automatic costed-bonus solver. If later pre-scoring actions leave the player unable to cover the combined selection, the reserve bundle and its bonus entries are invalidated instead. Resource-based major scoring also reads remaining resources from the resulting clone. `ScoreEntry.type='bonus'` must carry `cardId` and may carry `cardType` and `reserved` attribution. If the target has not played the source card, the Scoring Reserve record supplies `cardType` explicitly.

`cardBonusVp` is the single score category for nonprinted bonus VP produced by cards. Preserve `cardId` and `cardType` attribution on `ScoreEntry.type='bonus'` wherever possible. Printed VP on the card itself remains in `cards`; compact and live scoring must keep `cards` separate from `cardBonusVp`. Legacy `cardsBonus`, `cardStateBonusVp`, and `cardBonus` shapes are removed and must not be read, merged, or supported by clients or documentation.

Public card markers also score under `cardBonusVp`. A `publicCardMarkers` entry may contribute positive or negative points, and its bonus score entry uses `sourceCardId` attribution without introducing another category.

`computePastureCapacityModifiers(player, state)` returns pasture-capacity modifiers for `computeAnimalZones` to apply while creating pasture zones. Modifiers are `replacement` or `additive`. All replacements run in play order, followed by all additives in play order. A size-one-pasture replacement such as D011 Lawn Fertilizer therefore always precedes additives such as A012 Drinking Trough or B072 Love for Agriculture, without cross-card ID reads or scratch markers. With no modifier, capacity remains `size * 2 * 2^stables`.

`AnimalZone.houseAnimalZone?: boolean` marks a non-house zone that counts as a house animal zone. After all `onComputeAnimalZones` calls, `computeAnimalZones` removes both ordinary `zoneType === 'house'` zones and zones with `houseAnimalZone === true` when the player has the `blocksHouseAnimalZones` capability. House-zone rules use `isHouseAnimalZone()` and `countHouseAnimals()`, not direct `player.houseAnimalCount`, which would miss tagged zones such as D148 Domestician Expert.

Every "can accommodate" question uses `canAccommodateAnimalTotals(state, player, targetCounts)` or the add-only wrapper `canAccommodateAllAnimals(state, player, animals)`. These search for a legal assignment of final animal totals and allow later system `reorganize`. A card must not substitute a local test of whether any current zone can accept one more animal; that incorrectly rejects states made legal by reorganization. The search memoizes failed workspace assignments to avoid repeatedly enumerating equivalent branches for multicandidate exchanges such as M031 on an impossible late-game farm. `exclusiveCardZoneLimit` applies during search, preventing false accommodation across multiple zones of the same card. If a candidate permanently reduces holder capacity, such as paying C148's held animal, candidate filtering uses postpayment capacity.

The `onComputeAnimalZones` card-effect signature is `(player: PlayerState, zones: AnimalZone[], state: GameState) => AnimalZone[] | void`. The third argument allows global facts, such as A148 Woolgrower and B086 Truffle Searcher reading `state.completedFeedingPhases`, without per-card postplay counters. Cards that do not need it may name it `_state`.

`onComputeSharedAnimalZones(owner, animalOwner, zones, state)` lets a card owner contribute a borrowed played-card zone for another animal owner. A shared zone carries, or receives from `computeAnimalZones`, `cardId`, `ownerPlayerId`, `animalOwnerPlayerId`, `displayOwnerName`, and `displaySource:'borrowed-played-card'`. If breeding belongs to someone else, it sets `breedingOwnerPlayerId`. When a card effect adds `zoneType:'card'` without `cardId`, `computeAnimalZones` fills in the current card ID so reorganization writes and accommodation queries use the same persistent identity. A fixed animal type must use `allowedAnimalType`; `animalType` is current visible occupancy, not a printed restriction for final-total search. Pasture replacement and additive modifiers no longer belong here and instead use `computePastureCapacityModifiers`.

Farm-position-backed and hosted card zones may store animals in `cardStates[cardId].extraData.animalCountsByZone`. A Hosted Card Animal Zone writes into the card owner's state, while statistics, payment, capacity search, pending-animal detection, and reorganization assign it to `animalOwnerPlayerId`. Breeding includes a zone with `breedingOwnerPlayerId` for that breeding owner and subtracts it from the Animal Owner's temporary breeding count. Reorganization and capacity rewrites route by `ownerPlayerId` to the card owner and replace only entries for the current Animal Owner; they must not erase another player's use of the same shared card.

Every ordinary holder writer persists `cardId`, `ownerPlayerId`, and `animalOwnerPlayerId` on each `animalCountsByZone` entry. A cross-player deduction consumes only entries explicitly owned by that Animal Owner. `serializeState` derives `SerializedPlayerState.playedCardAnimalZones`, `farmCardAnimalZones`, and `borrowedPlayedCardAnimalZones`, letting the frontend display 0/N zones for owner Played Cards, FarmBoard positions, and Played Cards "by others" outside active reorganization. An active `InteractionAnimalReorgZone` draft forwards owner metadata, overrides that read-only projection, and enables controls.

Animal statistics and consumption helpers such as `getAssignedAnimalsByType()` and `subtractAnimalsFromBoard()` must read and write legacy `animalCounts` or `held` together with per-zone `animalCountsByZone`; otherwise a later reorganization can rehydrate consumed animals from stale per-zone state. Server-derived `exclusiveCardZoneLimit` and `allowedAnimalTypes` travel with `InteractionAnimalReorgZone`. The unified reorganization helper enforces the first, while the second lets the UI disable animal types the backend will reject. The frontend contains no card-ID-specific rules.

A farm-position-backed animal zone enters `InteractionAnimalReorgZone` through `AnimalZone.farmPosition`, `countsFarmyardSpaceAsUnused`, and `displaySource:'farm-position'`. FarmBoard renders only server-provided zones at those farm positions and never decides legal spaces. An ordinary single-zone holder continues to use `cardStates[cardId].extraData.animalCounts`. Multiple farm-position zones for one card use `animalCountsByZone[zoneId]` and persist `capacity`, `allowedAnimalType`, `allowedAnimalTypes`, and `farmPosition` with each nonempty zone for display outside active reorganization. Reorganization cleanup removes vanished zones. A card offering multiple candidate positions but allowing only one uses `exclusiveCardZoneLimit`.

Animal payment is centralized in `shared/domain/animal-payment.ts`. During an ordinary exchange, played cards first consume local markers or holders through the `consumeAnimalPayment` card effect. `subtractAnimalsFromBoard()` then deducts from the farm board, ordinary `extraData.animalCounts` holders, and `animalCountsByZone` farm-position holders. Counter-backed holders whose consumption permanently reduces capacity come last. `AnimalZone.capacityCounterKey` plus `capacityLossOnPayment` describes that source and its postpayment loss. When `animalPaymentPreference.prefer` names a card counter, only that source is consumed; no match does not fall back to another counter-backed holder. System removals from reorganization or capacity enforcement notify cards through `onAnimalRemoved` so they can synchronize local markers without card-specific state in the main path. C148 Mud Wallower exposes its `held` counter through this metadata. Candidate filtering for M031 Livestock Market and similar cards simulates the shared payment helper and never reads C148's private `cardStates`. Card-specific breeding amounts and animal-score adjustments use `computeBreedableAnimalCount` and `computeAnimalScoreAdjustment`, so core breeding and scoring never inspect a particular card's state.

**Special-stable card-effect extension.** The parallel methods are `getSpecialStablePositions?(state, player) => FarmTilePosition[]`, `applySpecialStable?(state, player, position) => boolean`, and `getBuiltSpecialStables?(player) => FarmTilePosition[]`. In Farm Expansion's Build Stables `farm-select`, core `shared/actions/effects/stables.ts` uses `collectSpecialStablePositions(state, player)` from `card-effects.ts` to aggregate candidates with `sourceCardId`, and `applySpecialStableAt(state, player, position)` to delegate settlement to the accepting card and return its source. Candidates enter protocol field `farmHandPositions`, whose name is retained for frontend compatibility. Settlement writes `kind:'special'` and `sourceCardId` into the `farm.stableBuilt` item. The generic gate is `actionContext.farmHand === true`, set only by the Farm Expansion stables-leaf wrapper. Other stable-building entry points such as E148, A089, and C94 do not expose special stables. B085 Farm Hand, at a two-by-two field center, is currently the only implementation; core stables code imports no card.

The third method, added under #200, returns currently standing special-stable positions: empty before construction and empty again after D102 or E76 returns it. `collectBuiltSpecialStables(player)` aggregates `{ position, sourceCardId }[]` across cards. `serializeState` derives the display-only `SerializedPlayerState.specialStables` array for every serialized player, alongside the three persistent card-animal-zone projections. Domain truth remains in `cardStates` and card-effect results. These fields exist only in snapshots, not top-level `PlayerState` or `GameState`; `rehydrateState` strips them explicitly to prevent leakage into authoritative state. `GameContainerApi` derives the set of built-special-stable top-left positions from `displayPlayer.specialStables` and passes it to FarmBoard, which renders a persistent filled `.farmhand-center-built` overlay without reading card-specific `cardStates`.

---

## 10. Other `shared/` modules

### 10.1 `shared/draft/`

`draft-manager.ts` contains pure functions for simultaneous card selection: `initDraftState`, `processSubmit`, `tryAdvanceRound`, and `finalizeDraft`. `types.ts` defines `DraftState`, `DraftPool`, and `DraftPickPayload`. Set `draftMode: 'simultaneous'` and `draftPoolSize: 7..10` in `createRoom` to enable it.

### 10.2 `shared/i18n/`

UI copy keys and localized resources. `PromptKey` is centralized in `shared/contract/prompt-keys.ts`.

### 10.3 `shared/custom-code/`

`ast-validator.ts` validates custom-card TypeScript with an AST, allowing only approved imports and blocking forbidden APIs, network, and I/O. `sandbox-listener-actions.ts` is the single source for listener actions used by prompts, the validator, and server and browser manifests. Runtime isolation lives under `server/custom-code/`.

### 10.4 `shared/utils/`

Generic helpers such as deep cloning, IDs, and math. It contains no business rules.

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

- One Room owns exactly one `GameSession`. The current WebSocket message handler calls `dispatch()` synchronously, so commands within one Node process are naturally serialized.
- `room-router` validates commands, authorizes seats, and calls `GameSession`; it never writes `GameState` directly.
- `payload-validation.ts` is pure validation through `validateResourcePayload`, `validateSingleTilePayload`, and `validateMultiTilePayload`. It returns legal normalized values and never writes `GameSession`.
- Under ADR 0014, the Room's `ready | blocked` write gate must be at command entry. Do not add a generic asynchronous command queue. Durable Room Commit completes synchronously, and save retries run only while the Room is blocked.
- A rules command returning `resp.ok=false` responds only to its origin connection. It neither increments `roomVersion` nor creates a Replay Step and does not broadcast the error to other seats.

### 11.2 `server/game/`: Room and GameSession

```text
server/game/
├── room.ts                    Room { id, session, players, maxPlayers, startedAt }
├── room-registry.ts           RoomRegistry
├── lobby.ts                   lobby, room list, and automatic join
├── room-persistence-checkpoint.ts  one-second coalesced writes and completion/discard lifecycle
├── authoritative-session.ts   GameSession extends GameCore; command-execution center
└── persistence/
    ├── room-persistence.ts    abstract persistence contract
    ├── sqlite-adapter.ts      data/open-agricola.db and rooms.state_json
    ├── json-adapter.ts        output/<roomId>.json
    └── memory-adapter.ts      test injection
```

`RoomPlayer { ws, playerIndex, name, userId? }` represents a connection, not domain `PlayerState`. `GameSession` is a thin server wrapper around `GameCore` that injects the server custom-code executor. Connection binding, broadcasting, and persistence are outside it.

The fixed persistent development rooms are `dev2` through `dev6`. `PERSIST_ROOMS=sqlite`, the default, or `json` chooses the adapter. After every player disconnects, an ordinary SQLite Room is retained for 30 minutes when `waiting` and seven days when `playing`. Startup restores either unexpired state and its `custom_card_ids`. Reconnection may replace the previous connection for one seat.

`roomId` uniquely identifies one game. `newGame` first creates a new `GameSession` and UUID, then switches online seats, player count, custom cards, persisted variant flags, and all connection references to the new Room record. It never reuses the old ID. The first `waiting -> playing` transition writes immutable `started_at`. Only authoritative `gameOver` writes scalar summaries to `game_results` and `game_result_players` and deletes `rooms.state_json` in one SQLite transaction. TTL expiry, room dissolution, account deletion, and restart of an unfinished game delete only the recoverable snapshot and mark permanent Game Context as `expired`; they produce no result. An archive-write failure rolls back and retains the full final state for recovery or retry.

`RoomPersistenceCheckpoint` continues to serve waiting rooms, rooms without Replay, and non-SQLite adapters. A successful command in a SQLite Replay Room uses Durable Room Commit, writing the Room snapshot and Replay Step in one transaction before broadcast. WebSocket close no longer performs an old checkpoint write for such a Room.

### 11.3 Game Context, Replay, and Bug Report

This section is a cross-task implementation contract. `room-committer.ts`, `replay-codec.ts`, the seven-table migration, atomic SQLite writes, the Game Context resolver, original-seat active-game recovery, public Replay and Anchor reads, and the immutable Replay Viewer are implemented. A later task supplies the Bug Report module.

```text
server/game/
├── room-committer.ts          only external seam for Durable Room Commit
├── replay-codec.ts            canonical JSON, delta, gzip, and Frame Hash
├── game-context-store.ts      lifecycle resolver
├── replay-store.ts            public manifest, Segment, and Anchor read model
├── replay-viewer-build.ts     Viewer Build integrity checks
└── persistence/
    └── sqlite-adapter.ts      atomic Room, Replay, and Result transaction
server/game-context-routes.ts  lifecycle resolver
server/replay-routes.ts        manifest, Segment, Anchor, and Viewer/Asset static reads
server/bug-report-routes.ts    draft, GitHub connection, submit/status, and audit
server/bug-report/
├── bug-report-store.ts        SQLite draft/attempt/claim state machine
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

- `resp.ok=false` bypasses commit and responds only to the caller. A successful command returns `unchanged` only when both its public Frame Hash and private authoritative session-cursor hash are unchanged; a cursor-only transition still persists the Room snapshot and records a Step with a repeated public Frame. Reconnect and snapshot refetch create no Step.
- Replay Step has a Room-global monotonic `stepNo`, independent of `roomVersion`. Concurrent players submitting in one interaction still serialize into consecutive Steps. Automatic engine settlement caused by the last submission belongs to that Step. Rule results must not depend on arrival order.
- Step 0 is established before the first interactive command. The classic deal is already in the Frame. Interactive draft, Parent Selection, and explicit multiplayer submissions start at Step 1.
- A terminal Frame also archives authoritative `PlayerScoreSummary[]`. At a `gameOver` Step, historical Viewer reuses the read-only `ScoringPad` to show categories, card bonuses, and totals.
- An exhaustive protocol-boundary switch allowlists Replay Intent. Never store `requestId`, tokens, site `userId`, arbitrary raw WebSocket messages, or unvalidated payloads.
- A write failure freezes the same Frame and Intent, marks the Room blocked, and rejects new game commands. Retry after 1, 2, 5, 10, and 30 seconds, then every 30 seconds. Reconnecting clients wait during the pause and never read uncommitted memory state. The same idempotency key with a different hash permanently blocks and alerts.
- One instance allows at most 30 ordinary in-memory Rooms, counting both waiting and playing but excluding fixed development Rooms. An executable Workshop Room uses a session Worker plus a code Worker and has a separate limit of 15. The process-wide 15-slot accounting includes Worker reservations for WebSocket Rooms, restored Rooms, and HTTP sandboxes. A per-Room FIFO spans session execution through Durable Commit. Room or seat changes on the same connection wait for the in-flight command. Reaching a limit rejects only operations that need another corresponding Room or `newGame`. Built-in-card Rooms create no session Worker. Do not add Room sharding, Redis, or an external queue.

Completed Replay and Bug Report behavior uses ADR 0013's public and private read contract. GitHub submission is recoverable through SQLite drafts, stable `submissionId`, attempt rows, and atomic claims. The production GitHub App client and test fake are the two adapters at the true external seam.

### 11.4 `server/custom-code/`: Isolated execution

```text
server/custom-code/
├── compiler.ts          TypeScript to JavaScript through ts-blank-space and esbuild
├── runtime.ts           sandbox runtime
├── engine.ts            hook, phase, and scope validation plus dispatch
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
- `GET /cards-manifest.json`: card metadata fetched by the main bundle at startup.

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

Public Replay APIs return versioned JSON and never expose SQLite gzip or BLOB encoding. A Segment expands at most one checkpoint chain and verifies every frame hash on the server. An Anchor must exactly match `stepNo + frameHash`. Completed, expired, and removed resolution and public Replay remain outside login. Active descriptors, recovery, Bug Report, temporary evidence, and maintainer forensics enforce ADR 0013's seat or administrator authorization independently. External errors retain ADR 0013's discriminated `{ ok:false, code, lifecycle?, message }` form.

### 11.6 `server/workshop.ts` and `server/workshop-pr/`

These modules provide the Workshop and Sandbox backend for custom-card upload, compilation, and pull-request integration. SQLite tables `sandbox_settings` and `sandbox_cards` persist sandbox configuration: `playerCount`, `deckIds`, Through the Seasons, Farmers of the Moor, and whether a game may start with too few FoM minor improvements. `POST /api/game/new-sandbox` reads these settings and passes `playerCount`, `deckIds`, `customCardIds`, and variant flags to `createInitialState()` for unified handling.

### 11.7 Database

`server/db.ts` owns the SQLite connection through `better-sqlite3`, built for the Node 24 ABI. Existing tables include `rooms`, `users`, `sandbox_settings`, `sandbox_cards`, `custom_cards`, and `pr_proposals`.

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
- `oauth_states`, extended with an encrypted PKCE verifier under its existing short-lived state and `returnTo` lifecycle.

Do not add Replay Segment, Reported Evidence payload, quota-counter, or webhook-delivery tables. `checkpointStepNo` represents Segments. `bug_reports.evidence_expires_at` protects a shared Segment only while the Context is incomplete; normal completion switches to the permanent Replay Archive. Report and attempt rows answer quotas and the sitewide GitHub sending window of 20 requests per minute. Revocation webhook operations are intrinsically idempotent.

Migration must idempotently backfill existing data. `rooms` become active `game_contexts`; `game_results` become completed contexts; if one `roomId` exists in both, completed wins. A game completed before launch is marked `legacy_no_replay` and gets no `game_replays` header, Replay Frame, `schemaVersion`, or `viewerBuildId`. Its completed descriptor still returns the Game Result Archive summary; manifest and Segment exist only when `replayStatus=available`. Therefore an ID is `unknown_context` only when absent from both existing sources.

### 11.8 GitHub delivery, security, and deletion

- On draft creation, the server confirms that Reporter owns an original seat in active `room_players` or completed `game_result_players`, and freezes `roomId + stepNo + frameHash`. The trimmed symptom must contain 1 to 2,000 Unicode characters; there is no grammar or sentence-ending test. One user may retain at most five reports that are not discarded and have no known Issue number.
- The production `github-issue-client` accepts only server-configured Repository ID and Installation ID, never client owner, repository, labels, or URL. Every GitHub request has a 15-second timeout. Marker reconciliation accepts only an Issue created by the configured GitHub App, no earlier than its delivery attempt, and ending uniquely with the expected marker. The fake adapter covers success, 401, permission 403, rate-limit 403 or 429, 410 or 422, network errors, 5xx, and reconciliation after an uncertain response.
- Self-authored submission uses an encrypted GitHub App user token and requires confirmation that the public GitHub author identity cannot be anonymized by deleting the site account. The report persists the confirmed numeric GitHub user ID. Queueing and delivery reject silent account switching; the user must reconfirm after a change. Hosted Issue Identity uses an in-memory installation token. An invalid connection never changes author automatically. Token and refresh token use AES-256-GCM with per-row nonce and tag plus `keyId`. The PKCE verifier is encrypted and lives only until OAuth-state expiry. Each user retains one live Bug Report state. GitHub callback puts only state and code in the frontend URL fragment. After returning to the original top-level context, the frontend calls complete with a partitioned session; only then does the server consume state for the current site user and exchange the token.
- The SQLite executor atomically claims one `submissionId`. After an uncertain response, it reconciles by the stable body marker before retrying. Retry and rate limiting follow ADR 0012. The client polls only site status and never GitHub directly.
- The Bug Report footer requests connection status for the current `roomId`. New-report entry is enabled only when the user is an original participant and the Room has at least one Replay Step. From an unauthenticated completed game, login preserves the current Replay Anchor. A saved draft remains recoverable or discardable after its associated active game expires or is removed. Waiting, unrecorded, and legacy-no-replay games return explicit anchor-unavailable states rather than pretending the user is not a participant.
- Issue title is a sanitized and truncated `Game bug: <first symptom line>`. Body contains no screenshot, log, Frame payload, other-player identity, or hidden information. Issues-only repository automation adds `needs-triage`; notifications rely on native GitHub watching.
- Explicit disconnect deletes tokens immediately. An account with only local unsubmitted drafts may delete those drafts and the account directly. If it has a connection, public Issue, or report already in delivery, account deletion first persists `deletion_pending`, signs out every session, and disables the local connection; the same installation adapter then edits known Issue bodies, retrying in background on failure. A discarded but previously submitted report with unknown Issue number reconciles by marker first. A GitHub `issues.deleted` webhook completes cleanup for a deleted Issue. Final internal association is cleared only after GitHub confirms that the body no longer contains the site user ID.
- Full maintainer evidence reads require a nonempty reason and append `bug_report_evidence_audit`; the audit stores a maintainer identity snapshot unaffected by account-foreign-key deletion. Each maintainer may read at most 30 times per hour. Before returning evidence, the server reapplies the current Participant tombstone projection. Evidence that expired before launch without a seat snapshot treats every seat as anonymized.
- Before `server/game/replay-removal.ts` deletes Step payloads, anonymizes or explicitly deletes Results, and marks the Context removed, it appends and fsyncs the entire operation as one versioned batch record in an out-of-database ledger. Each game entry independently records `eraseResult` and permanent-asset removal rules. A trailing fragment without a newline rolls back; a committed malformed line remains fail-closed. Before the backend listens, and from the recovery CLI, ledger replay is idempotent and records newly discovered forbidden asset references from old backups. A hash may never be archived again. Corrupt unrelated Replay metadata does not block Tombstone replay; if the system cannot prove an ordinary asset is unreferenced, it conservatively keeps it. Shared content is deleted only when no other available Replay references it. If the resource itself is forbidden, all identifiable referencing games are removed first and the asset is forcibly deleted. Version one has no administration UI.
- Public resolver, manifest, and Segment endpoints have independent per-IP read quotas and response-size caps. Active evidence, Bug Report, and maintainer endpoints are rate-limited by account. Logs must never contain tokens, Frame payloads, symptom text, or raw GitHub responses.

### 11.9 Deployment, rollback, and observability

In addition to the existing SQLite persistent volume, production requires three locations that image deployment never overwrites:

```text
replay-viewers/<viewerBuildId>/  immutable historical Viewer code Build
replay-assets/<sha256>           content-addressed Replay Card Snapshot assets
replay-removals.jsonl            out-of-database deletion ledger
```

The complete target configuration is:

```text
REPLAY_NEW_ROOMS_ENABLED
REPLAY_VIEWER_BUILD_ID
REPLAY_VIEWER_ROOT
REPLAY_ASSET_ROOT
REPLAY_TRUST_PROXY
REPLAY_REMOVAL_LEDGER_PATH
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

Durable Room Commit currently reads `REPLAY_NEW_ROOMS_ENABLED`, `REPLAY_VIEWER_BUILD_ID`, `REPLAY_VIEWER_ROOT`, `REPLAY_ASSET_ROOT`, and `GAME_BUILD_ID`. Recording requires SQLite persistence. Room creation freezes the recording decision, both Build IDs, and custom-card runtime snapshot. An unpublished custom card requires explicit player consent to permanent publication. Viewer Build ID is the SHA-256 of the complete `manifest.json`, which fixes the `index.html` entry and every file's SHA-256. A Build stores only Viewer code, styles, and card manifest. Board art, card art, and fonts share the main site's pinned asset-repository commit and are not archived. Room creation fails when Build validation fails.

Before Step 0, custom-card artwork is copied into the content-addressed asset root and the Replay header is rewritten to an immutable URL. A recording-enabled waiting Room rejects game writes until Step 0 exists. When an unfinished game expires, unprotected Replay payload is deleted unless a valid Bug Report Anchor retains it. Hourly cleanup trims Segments, empty headers, and unreferenced assets after evidence expiry. Later configuration changes do not alter an existing Replay header, which continues recording. If recording is later enabled, a restored older active Room starts with a `missingPrefix=true` Step 0.

Deployment order is fixed:

1. Append and validate a content-addressed Viewer Build. Never remove old directories.
2. Back up SQLite, Replay assets, and the deletion ledger. Run database migration and reconcile Context-backfill counts from existing `rooms` and `game_results`. Deploy the recorder-compatible backend with both feature switches disabled.
3. At startup, create `missingPrefix=true` Step 0 for restored old active Rooms before accepting commands.
4. Set an existing `REPLAY_VIEWER_BUILD_ID` and enable new-Room recording. Every Room with an existing Replay header continues recording unconditionally.
5. Deploy the top-level Game Context Router and public Replay UI.
6. Configure and exercise the GitHub App before enabling Bug Report.

After recording is enabled, the application may roll back only to a recorder-compatible build supporting every active Room `schemaVersion`; it cannot roll back to a backend predating the feature. The Viewer Build must exist before the backend freezes its ID into a new Room. Missing Viewer, unwritable persistence, or the 30-Room capacity limit makes readiness degraded and rejects new Rooms without sacrificing existing ones.

Version one adds no metrics backend. Structured logs and health state must expose at least ordinary Room count, capacity rejection, Durable Room Commit latency, errors, and retries, blocked Room count, hash collisions, Replay payload size and corruption, GitHub queue, attempts, and rate limits, and missing Viewer Build. Log fields contain only stable IDs and numbers, never protected payloads.

---

## 12. `client/`: Frontend

### 12.1 Client bundle boundaries

| Bundle | Entry | Paths | Constraint |
|---|---|---|---|
| `client-app` | `client/main.tsx` | `client/{app,components,services,hooks,contexts,utils}/` | Uses WebSocket. From `shared/*`, imports only `contract`, `domain`, and `i18n`. Card display uses manifest-backed `card-meta` plus `custom-card-metadata`. |
| `client-sandbox` | `client/sandbox/index.tsx` | `client/sandbox/` | Lazy-loads Workshop sandbox UI; rules still execute through the backend sandbox path. This is the only frontend directory allowed to import complete `shared/*`. |
| `local-sandbox-worker` | lazily created `client/local-sandbox/worker.ts` | `client/local-sandbox/` | Browser-mode engine Worker for Workshop playtesting. Its four Worker-side files may import complete `shared/*` under ESLint S6c. Main-bundle `local-transport`, `persistence`, and `workshop-launch` use type-only shared imports, keeping the engine out of the main bundle. |
| `replay-viewer` | `replay-viewer/src/main.tsx` | `replay-viewer/` | Has no login, cookies, WebSocket, or command sending. It reads only public Replay JSON and reuses display filtering and board projection compiled at archive time. |

Strict main-bundle budgets in `scripts/check-bundle-size.ts` are 550 KB raw and 170 KB gzip.

### 12.2 Service layer under `client/services/`

- `gameTransport.ts`: `WsGameTransport` manages the WebSocket connection in the service layer, not React Context. URL switches include `?transport=ws`, `?player=p1|p2`, and `?room=devN`.
- `card-meta.ts`: fetches card metadata from `GET /cards-manifest.json` at startup. The `CUSTOM_*` overlay reads only `shared/cards/custom-card-metadata.ts`.
- `rehydrate.ts`: a lightweight rehydrator that skips `ActionSpace.onTaken` callbacks and breaks dependency chains into `shared/actions` and `shared/cards/catalog`.
- `llmPrompts.ts`: Workshop card-designer system prompts. Hook, phase, scope, and action-ID tables render at runtime from shared truth sources and descriptive metadata such as `sandbox-hook-meta.ts`; no manual mirror remains.

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
- `client/sandbox/**` has complete access.
- `no-restricted-syntax` blocks dynamic string imports of `shared/session/...`, `shared/engine/...`, and card implementation-bootstrap literals.
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

#### Architecture fitness coverage

| Invariant | Executable coverage | Boundary |
|---|---|---|
| Physical `shared` / `server` / `client` layering | ESLint `no-restricted-imports` errors | Tests have explicit exemptions; this checks imports, not runtime ownership. |
| Card Source scope and cross-card references | `pnpm run check:card-impl-boundaries` | TypeScript AST checks production Card Source files and same-file card-ID literals or top-level const aliases. `Major_*`, `reaches`, purchase candidates, and prerequisite candidates are explicit exceptions. It does not follow cross-file dataflow. Empty or mismatched source scope fails. |
| Trailing listener snapshots | `pnpm run check:card-impl-boundaries` | Handlers are enumerated from resolved `ALL_CARD_IMPLS`, whose IDs must match every production Card Source declaring `impl`. Direct `improvements` / `minorPlayed` / `occupationPlayed` length reads fail in `during`, `immediatelyAfter`, and `after`; non-trailing reads and membership checks remain valid. The check parses the resolved handler body only and does not follow helper calls or derived values. Empty, incomplete, or unparseable runtime scope fails. Runtime diagnostics identify the card and listener without claiming an original source line. |
| Listener state purity | Behavior tests and code review | Handlers must remain state-pure flow builders, but no whole-program TypeScript mutation proof is claimed. `check:card-impl-boundaries` does not enforce this invariant. |
| Generated catalog matches Card Sources | `pnpm run check:generated-cards-sync` | Structural source/catalog equality without a hard-coded card count. |
| `GameSession` owns the server command boundary | `CONTEXT.md`, ADR-0014, review, and three-layer import errors | This is ownership, not a claim that only one source file contains assignments. No whole-program mutation proof is attempted. |
| Canonical architecture wiring | `pnpm run check:architecture` and `scripts/__tests__/ci-card-impl-boundaries.test.ts` | Both CI workflows are manual-only and call the aggregator once; trusted local full CI is the current merge evidence. |

`vitest.config` has several fast subprojects, `fast-shared`, `fast-cards`, `fast-card-runtime`, `fast-client`, `fast-server`, `fast-scripts`, and `fast-tests`, plus `slow` and `llm`. `pnpm test:fast` first runs `check:test-project-coverage`, ensuring new fast projects cover the former fast-file set without duplication. CI defaults to `pnpm test:fast`; use `pnpm test:slow` for per-card session tests, `pnpm run test:e2e` with frontend and backend running, and `pnpm exec vitest run <file>` for one file.

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

### 13.3 Engineering commands

```bash
pnpm install                # canvas needs libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev
./restart-local.sh       # unified local development, runtime, and test entry; absolute tsx/vite paths avoid cross-worktree pkill
pnpm test                   # all Vitest projects, fast and slow
pnpm test:fast              # fast projects only; CI default
pnpm test:slow              # slow per-card session tests
pnpm run test:e2e           # Playwright E2E; frontend and backend must be running
pnpm exec vitest run <file> # one file
pnpm run lint               # ESLint; zero errors required
pnpm run build              # TypeScript plus Vite build
```

Local development standardizes on Node.js 24.15 or newer, excluding the Node 25 line (`engines`: `^24.15.0 || >=26.0.0`). Native dependencies such as `better-sqlite3` are built for its ABI.

### 13.4 Replay, recovery, and Bug Report launch gates

Implementation advances through independently verifiable slices:

1. Database migration and canonical JSON, delta, gzip, and hash codec.
2. Durable Room Commit, failure pause and retry, and the 30-Room limit.
3. Game Context resolver, original-seat active recovery, and evidence authorization.
4. Replay manifest and Segment, historical Viewer Build, and desktop and mobile playback UI.
5. Bug Report draft, GitHub App connection and queue, and three-step reporting UI.
6. Anonymization, Tombstone, deletion ledger, deployment, and production acceptance.

Automation must cover:

- codec round trip, at most 15 deltas, early checkpoints, hash mismatch, and recovery after a corrupt Segment;
- atomic snapshot-plus-Step transaction, atomic game-over completion, same-hash idempotency, different-hash blocking, database-failure pause, and restart recovery;
- consecutive `stepNo` for two simultaneous submitters, settlement triggered by the last submission, and results independent of arrival order;
- `ok=false` and unchanged responses only to the caller, and no seat receiving unpersisted state before commit;
- two-seat active-Room recovery, connection replacement, hidden-information filtering, and reconnect waiting during persistence pause;
- completed, expired, removed, and unknown resolution; public Replay without login; Anchor mismatch; caching; and error codes;
- desktop timeline-first auto layout, mobile board-first auto layout, manual URL override, perspective selection, play or pause, stepping, seeking, keyboard, and axe;
- retained draft after OAuth cancellation, self and Hosted authors, stable-marker reconciliation, rate limits and three failures, duplicate clicks, disconnect, and revocation;
- account-deletion Issue redaction, Replay Participant anonymization, Tombstone, and permanent audited maintainer access with a reason.

The final performance probe runs under 2 CPU and 2 GiB with real commands and Replay-write load at 25, 30, and 35 Rooms, plus a late-state run at 30 Rooms. Thirty Rooms must satisfy action p99 no more than 250 ms, event-loop p99 no more than 100 ms, and RSS no more than 1.8 GiB. Thirty-five Rooms identifies the first failure point.

Production acceptance requires two real site accounts to complete one game. During play, each restores independently and sees only its own hidden information. After completion, an unauthenticated browser selects both seat perspectives and open view. The two users then create smoke Issues using self GitHub identity and Hosted Issue Identity, verify Anchor and Reporter fields, and close them. Do not close the milestone until CI, frontend and backend deployment, these online steps, and deletion and rollback drills all pass.

---

## 14. Key invariants

1. **Backend authority:** rules live in `shared/` and `server/`; the frontend does not adjudicate.
2. **Physical three-layer boundary:** `shared/` to `server/` to `client/`, enforced as an ESLint CI error.
3. **Two client bundles:** `client-app` does not import `shared/{engine,session,actions,cards,custom-code,draft}`; `client/sandbox` has complete access.
4. **WebSocket game path:** `/ws` receives `ClientCommand` and emits `StateUpdateEnvelope`; Game Context, Replay, and Bug Report use versioned HTTP product APIs.
5. **`InteractionState` is the only frontend interaction truth:** `stateId` is `idle`, `wait`, or `gameover`; `wait` branches on `request.kind`.
6. **The node tree is the only state machine:** the `PendingAction` union is gone. `engine.peekPendingEnvelope()` and the pending host derive what execution is waiting for.
7. **`EngineStack.push` and `pop`:** the only injection path for hooks, anytime actions, and nested subflows. Never mutate `pending` directly.
8. **Card-local closure:** finish a card inside `shared/cards/{Deck}/{Card}.ts`. Do not change core files such as `shared/actions/effects/pay.ts`, `shared/actions/effects/improvement.ts`, `shared/session/session-core.ts`, or `server/game/authoritative-session.ts`. A new hook point requires tests and documentation in the same change.
9. **Local `cardStates`:** persistent counters and markers use `player.cardStates[cardId]`; later choices use explicit pending state and continuations.
10. **No circular dependencies.**
11. **Do not change a main path for one card.**
12. **Tests default to two players.** Prove rules at the backend boundary, never infer them from the DOM.
13. **No optimistic frontend commit:** wait for `stateUpdate` before changing game UI.
14. **`ActionFlow` matches the reference's small algebra:** the card DSL exposes only `leaf`, `seq`, `parallel`, `xor`, and `or` plus metadata. Runtime-only nodes do not enter card flows.
15. **Listener handlers do not mutate state:** listener, preview, and doability paths build flows or return structured values. Mutation occurs only while an action leaf executes.
16. **Durable Room Commit:** a successful command that changes the public Frame or private authoritative session cursor atomically writes Room snapshot and Replay Step before sending viewer-filtered state.
17. **Global Replay Steps:** simultaneous submissions still receive consecutive `stepNo`; automatic settlement belongs to the last triggering input and results do not depend on arrival order.
18. **Failures do not spread:** `resp.ok=false` responds only to the caller. Persistence failure freezes the same Frame and blocks the Room instead of overwriting or advancing.
19. **Thirty-Room limit:** one instance counts ordinary waiting and playing Rooms. Only new creation is rejected; recovery is unaffected.
20. **Immutable historical Viewer:** a Room freezes schema and Build. Completed playback uses a credentialless read-only Viewer and never executes historical rules code.

---

## 15. Documentation map

| Topic | Document |
|---|---|
| Card test template | [`docs/CARD_TEST_TEMPLATE.md`](CARD_TEST_TEMPLATE.md) |
| Card implementation status, description alignment, and plan | [`docs/card_implementation_status.md`](card_implementation_status.md) |
| Platform and Workshop | [`docs/PLATFORM_DESIGN.md`](PLATFORM_DESIGN.md) |
| Deployment | [`docs/HOW_TO_DEPLOY.md`](HOW_TO_DEPLOY.md) |
| Custom-card sandbox constraints | [`docs/CUSTOM_CARD_SANDBOX.md`](CUSTOM_CARD_SANDBOX.md) |
| CI checks | [`docs/operations/ci-checks.md`](operations/ci-checks.md) |
| GitHub OAuth | [`docs/operations/github-oauth-app-setup.md`](operations/github-oauth-app-setup.md) |
| Known card-architecture debt | [`docs/card_implementation_status.md`](card_implementation_status.md) |
