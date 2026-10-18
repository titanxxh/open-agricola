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
- **`EngineStack.push` and `pop`** are the only injection path for hooks, anytime actions, and nested subflows. Never mutate `pending` directly.
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
  gameSeed: number | string,          // Explicit Seed | wide seed, never sent to viewers
  availableMajorImprovements: string[],
  futureMeeples, pendingFutureMeeples,
  workPhaseObtainedResources: Record<string, Partial<Resource>>,
  completedFeedingPhases: number,
}
```

`actionSpaces[*].takenBy` is a `WorkerRef[]`. An ordinary reference contains only `playerId` and `workerId`. Linked occupancy created by a card may additionally contain `synthetic: { kind: 'linked-occupancy', sourceCard, linkedWorkerId }`. Cleanup can then use semantic metadata stored on the action-space state instead of reading another card's ID.

`spend-worker` records a Card-held Person on a noninteractive `card-worker:<sourceCard>` holder. Its WorkerRefs are authoritative placement facts: worker availability, undo and recovery retain them until normal return-home cleanup. Creation and Core-owned state normalization share the pure factory in `shared/domain/card-worker-space.ts`. JSON rehydration only decodes data; Core restores the holder after initializing its rule environment. Recovery recognizes the reserved prefix with a nonempty complete source ID, recreates the nonexecutable definition from code, and restores occupancy without accepting stored callbacks or arbitrary unknown executable spaces. The source card need not remain in the played zone for an already placed person to stay unavailable.

`workPhaseObtainedResources` supports cards such as A53 that inspect resources gained during the previous work phase. It is cleared after the returning-home phase resolves.

`completedFeedingPhases` increments in the feeding phase of `shared/session/phases/harvest.ts`. It matches the reference's global count. Cards such as A148 and B86 read it for completed-harvest-plus-one capacity instead of maintaining a per-card post-play counter.

`events` is the public structured rule-event stream beneath `GameState.log`. Backend rules first write `GameEvent`; mappers then derive UI logs, animation cues, audit reports, and future replay. `log` remains the visible text-log cache and is never a rule source. Rule code does not write `state.log` directly. The only writers are named cache boundaries: mapper output from `appendImmediateEvents()` and mapper output flushed from engine `LogStore` by `GameCore.flushEngineLog()`. `pnpm run check:direct-session-log` enforces this boundary.

The client incrementally consumes selected public events by stable `occurrenceId` to produce transient notifications, action, farm, and fence highlights, and resource animations. Its room-scoped seen set survives sliding windows and viewer sequence remapping; a new occurrence still produces feedback when it reuses a display sequence. An initial snapshot initializes the cursor without replaying historical events. Cancellation clears transient feedback and adds the restored snapshot to the seen set; local replay does not advance it. This cue layer serves UI feedback only. Legacy action-result detail also reaches the mapper through public events such as `action.detailLogged` instead of writing rule facts directly into `state.log`. `nextEventSeq` is the persisted event cursor. `normalizeState` drops old events that violate the public envelope, schema, JSON, or size guards, then continues from the greatest valid `seq`.

`farm.animalMoved.newlyPlacedOnFarmyard` records newly placed reserve animals in physical farmyard zones. The reorganization commit compares per-zone counts, subtracts decreases in all existing zones from positive farmyard changes, and clamps at zero. Existing relocations fill farmyard increases before reserve animals; card-only storage and old animals changing zones do not count. Card zones with `farmPosition` on the animal owner's farm, such as Home Wood and Horse Trough, count as physical farmyard zones. This is an aggregate placement fact, not persistent animal identity. `addFarmyardSpaceState(..., eventSink)` emits positive goods additions as `resource.moved` to a physical field; logical card fields remain separate locations.

Every public `GameEvent['type']` must appear in `shared/events/event-mapping-policy.ts`. The policy marks Action Log, public notification, board or farm highlight, resource animation, and replay handling as mapped, conditionally mapped, or intentionally silent. `eventsToLogEntries()` never writes generic fallback rows into `GameState.log`; replay-only summaries remain in the client timeline layer. A pull request adding an event type must also add its policy, mapper fixtures, and documentation.

`buildLogPresentationPlan()` is the sole source for Action Log presentation relationships. `rows` are visible entries, `consumedEvents` are events absorbed into richer entries, and `suppressedEvents` are semantically excluded from the Action Log. The client timeline filters only by these structured event references; it must not infer relationships from player names, resource counts, card IDs, or events in another archive packet. A plain-resource `futureMeeple.resolved` is suppressed because a later `resource.moved(reason='receive')` shows the actual receipt. Resolutions with independent room, field, stable, forest, or moor effects retain a separate entry.

Card purchases carry `PaymentInfo.publicPayment` from the pay child into `card.played.payment`: actual resources, bonus sources, returned card, and an opaque `paymentId` shared with the exact `resource.paid` event. A free play carries an explicit empty resource receipt without inventing a zero-payment event. The mapper renders that receipt even when the payment is in another packet/page; consumed relations use the explicit ID, not nearest-payment inference. Synthetic events without receipts have a bounded fallback that cannot reuse a payment preceding another play or sourced from another card. New receipt fields remain in newly recorded Replay Frames; existing Frames are not rewritten.

New events receive an opaque `occurrenceId` when `EventStore` completes the draft. It identifies a Public Event Occurrence independently of reusable `id`/`seq`, archive numbering, player names and translations; transaction snapshots, commit rebasing, cancellation and viewer projection retain it. The mapper attaches `LogEntry.sourceEvent = { occurrenceId, rowIndex }` to each derived row. Snapshot-cache/event-timeline matching uses this association plus the log key, not display parameters, so separate identical triggers remain separate and canceled attempts cannot consume a later occurrence's cache row. Unmatched logs remain visible.

Occurrence identity and log source association are JSON fields in newly written rule-event/log records, not only Room History presentation metadata: new Replay Frames therefore retain the association without depending on a Room or re-running rules. This does not change rule outcomes or rewrite existing Frames/hashes. Existing records without occurrence/source fields keep their original parameter-count matching; no backfill or migration is performed. New identified rows do not participate in that legacy matching pool.

`publicEventArchive` is append-only public event metadata. A `publicEvents.committed` packet records committed public event IDs and sequences. A `publicEvents.canceled` packet records event IDs, sequences, and complete public payloads canceled by undo or provisional scope rollback for later replay and archive UI. Archive writes first validate packet-sequence and cursor invariants and reject private, malformed, non-JSON, or oversized payloads. If a corrupt event prevents writing a canceled packet, the runtime cancellation still returns without persisting the invalid payload. If live archive invariants are already corrupt, the restoration is not committed. Rules and card listeners read only current `GameState.events` or transaction events, never the archive.

The client Action Log consumes `publicEventArchive` as a read-only replay timeline. It combines the archive with current `events` to rebuild active, canceled, and missing rows. Canceled rows retain their packet payload and render with strikethrough. Selecting a replay row produces local notification, highlight, and resource-animation cues with `replay:` IDs. It never modifies `GameState`, sends a command, or advances the live public-event cursor.

Runtime `publicEventCancellations` for undo and provisional scope rollback is response metadata. It is not added to `GameState.events` and appears only in the current restoration response. When restoration removes committed public events, HTTP and WebSocket payloads include the cancellations. The client uses them to clear current transient feedback and align its public-event cursor with the restored snapshot. Reconnect and `getState` do not replay old cancellations. Persistent cancellation history remains in `publicEvents.canceled` packets. Before entering a per-viewer payload, runtime cancellation and that viewer's `publicEventArchive` use the same hidden-event filtering and sequence remapping.

Initially, only rules events with `visibility: 'public'` may enter `GameState.events`. Private prompts, hands, draft state, and living-hand information remain in snapshot, privacy, and pending channels. `privateEvents` is a separate per-viewer synchronization layer describing private prompts and hand or draft changes visible in the current snapshot, such as `private.promptShown`, `private.handChanged`, and `private.draftUpdated`. The client consumes them as transient UI notifications. They never enter the public replay stream or become rule sources. Card-driven hand changes emit through a runtime-only response buffer, not `ActionExecutionResult`, engine snapshots, history, or `GameState.events`.

Game Seed is server-private (ADR-0020). When no seed is given, `gameSeed` is a wide seed: a 128-bit random hex string whose random streams come from HMAC-SHA256 in counter mode, one labelled stream per use. An Explicit Seed is a number that keeps the original generator, so tests, dev rooms, and debug endpoints stay reproducible; it protects nothing. The ordinary-deck and parent-selection seeds are independent of `gameSeed` and equally wide. `shared/utils/rng.ts` owns both paths.

The viewer projection `filterSerializedStateForPlayer` drops `gameSeed` for every seat and spectator, and returns `null` for each Unrevealed Round Card in `roundActionOrder` and in the `actionId` of goods scheduled on it. A round card is revealed when its round starts, and none is revealed before the `playing` phase; a card effect can reveal one earlier, which the projection reads from the public `action.revealed` event. Live sync, Bug Report evidence, and the Replay seat perspective share this projection. The `dev-viewer` sync mode, used only for live sync to a dev room, keeps the round-card order visible and still withholds the seed; `debug` remains the full state for hotseat rooms and the dev-room unredacted read.

`SerializedGameState` is the public network and Replay representation of `GameState`; its `engineStack` is always empty. `PersistedSessionSnapshot` separately stores authoritative `state`, public `frame`, and a server-private `sessionCursor`. The private cursor contains engine restoration data, history, and provisional continuation metadata for cross-process recovery, and never enters a player or spectator payload. Interaction requests use a separate viewer-safe pending protocol so another player's choice data cannot leak through the cursor. Synchronization versions and room connections do not belong in `GameState`.

### 4.3 PlayerState by Responsibility

- Identity: `id`, `name`, `color`
- Economy: `resources`, `familySize`, `workersAvailable`, `rooms`, `houseType`
- Farm: `fields` with multiple `CropStack[]`, `roomTiles`, `stableTiles`, `fenceSegments`, `pastures`, Farmers of the Moor `farmTerrain` with top `kind` and optional `covered`, `farmyardExtensions`, `farmyardSpaceStates`
- Animals: `houseAnimals` (room-position assignments), `stableAnimals`, `newbornCount`
- Played cards: `improvements`, `minorPlayed`, `occupationPlayed`
- Hands: `minorHand`, `occupationHand`
- Persistent effects: `majorEffects`, `activeModifiers`
- Supply tokens: `supplyTokensConsumed` records permanently consumed fence or stable components; helpers calculate the remaining limit dynamically
- **Card-local state:** `cardStates`, described in section 8.3
- **Worker identity:** `workers: Worker[]`, with five fixed slots identified by `'1'..'5'`. `isActive` and `isNewborn` describe permanent family members; optional `supplyUse` records a reserved, pending, or temporarily placed supply person, its source, return round, and return-to-supply or remove-from-game disposition.

`PlayerState.fields` is the private storage of Farmyard Fields. Card-facing rules use the Logical Field boundary described in section 8.5; only geometry and board-occupancy rules request Farmyard Fields explicitly. `Field.stacks: CropStack[]` stores the bottom stack at index 0 and the top stack last.

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

Important boundaries:

- `newGame.seed` is honored only in a dev room. Any other Room ignores it and draws a wide seed (ADR-0020).
- `loadGame` is a dev command like `devSetResources`: it replaces the authoritative state and is rejected outside a dev room.
- There are no separate `reorg`, `feed`, `nextPlayer`, or `confirmPlayerSwitch` commands. Every such wait shape is sent through `choice`, with `payload` determined by `InteractionRequest.kind`.
- `commitSelection` remains separate only for structured targeted selections such as farm-position, occupation-hand, resource-quantity, and resource-batch-exchange. Occupation-hand selections must be unique subsets of the player's hand within the declared limits; Session and the internal selection effect share validation before any effect, random observation or private cache write. Farm-position may use `validPositionGroups` for server-validated coordinate sets, including the adjacent two-space Farmers of the Moor Farmyard Extension. A selectable position may also carry `sourceCard`, `cardFieldSlot`, and `groupKey`: selection limits count distinct groups, and the backend canonicalizes multiple submitted positions from one group to one position before applying the effect. The client renders card-sourced virtual positions on the matching played-card slot instead of extending the farm grid.
- `enableParentCards: true` enables Parent Cards. With `draftParents: false`, each player receives a parent pair directly without entering `parent-selection`. Room metadata persists this choice across `newGame` and backend restarts.
- `enableSnakeOpening: true` enables the Snake Opening Game Variant (BGA "Snake opening"). The protocol default is `false`; the lobby form pre-checks it. `createInitialState` ignores it for a single seat. When active, every player starts with 3 food and `GameState.snakeOpening = { reversed: false }`; in round 1 the work rotation flips to reverse Round Work Order the first time it would wrap past `roundFirstPlayerId`, emits `snakeOpening.reversed`, restarts the backward walk from the seat that just acted, and stays reversed until the round ends. `continueAfterBeforeWork` resets `reversed` at each work phase start. Room metadata, `game_results`, `sandbox_settings`, and `newGame` persist the flag like the other variant flags.
- Workshop cards use a two-dimensional state model from PRD #634 in `server/workshop-status.ts`: review state `unsubmitted / in_review / approved / stale / merged` and publication state `live`. `enterReview` atomically binds one eligible pull-request URL, pins its head as `review_commit_sha`, and pins the same Design Draft as `review_version_id`. A card branch reuses only a pull request that remains open, non-draft, and based on `main`. A closed pull request remains history and requires explicit resubmission. Merged pull requests follow built-in takeover. Draft or retargeted pull requests pause delivery without automatic replacement.
- After binding, the server immediately refreshes the GraphQL snapshot to cover approval webhooks arriving before the local binding. A temporary refresh failure retains the successful binding, clears synchronization time, and lets the author retry through `refresh-pr-status`. A valid approval must match the current head and come from a reviewer with push permission. No OWNER approval is synthesized. Real exact-head approvals call `approveReviewedVersion` to set `approved_version_id`.
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

`stateUpdate`, `roomWaiting`, `gameStarted`, `playerJoined`, `playerDisconnected`, and `roomDissolved` are broadcasts. `roomCreated`, `roomJoined`, `authOk`, and request-level `error` are unicasts. WebSocket broadcasts build a per-viewer payload using the connection's `viewerPlayerId`: the target player receives real private prompts and `privateEvents`, while others receive `private-prompt` redaction. An HTTP sandbox without `X-Viewer-Player` keeps the unfiltered multi-seat development flow; with that header it uses the same viewer filtering and seat guard. `cardWarnings` appears only in HTTP debugging and sandbox payloads so Workshop confirmation gates can report runtime custom-card failures; it is never broadcast to WebSocket viewers. HTTP game envelopes also carry `gameInstanceId`, a server-issued identity tied to the session instance and rotated after a successful state load. Workshop playtest confirmation compares this identity because a game seed can be reused. It is neither authorization nor model input.

Hosted writes carry `commandContext`: an authenticated server-issued scope, stable command ID, original Room ID and expected committed version. Draft and parent submissions also carry a non-undoable input-window ID shared across that simultaneous phase. `requestId` only correlates one transport exchange. The router resolves durable receipts before input freshness, rejects changed content under the same identity, and persists each result with its Room/lifecycle transaction. Receipts contain outcome identifiers and hashes rather than another Frame copy, and are private to their actor. Expired scopes cannot become new operations after cleanup.

`WsGameTransport` keeps unconfirmed commands in a tab-local journal, isolates old socket callbacks, and suspends input while reconnecting. Recovery queries receipts before resuming the seat, waits for a complete filtered snapshot, then retries only still-valid original inputs with the same identity. Creation can recover without a previously received Room ID; rematch resolves its new permanent identity before accessing the retired Room. Terminal authentication, seat and lifecycle errors stop reconnecting. UI subscriptions belong to the transport, so they remain attached across sockets.

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

WebSocket `ClientCommand.type` names do not exactly match `InteractionCommand`. The frontend determines what can be done from `allowedCommands`; online commands normalize to `choice`, `commitSelection`, `action`, and related protocol names.

`shared/session/interaction-state-adapter.ts` is the server projection boundary for `InteractionState`. `GameCore.buildInteraction()` passes only current `GameState` and `EngineStack`, anytime, undo, and score snapshots, and one `projectPendingRequest(PendingInteractionProjectionInput)`. Construction of animal-reorg zones, farm-select payloads, and selection payloads lives behind that projection request builder instead of being scattered among adapter closures. Viewer redaction through `redactInteractionForViewer` consumes an already-derived `InteractionState` and never participates in pending or request derivation.

When a private choice concerns one card already visible in the recipient's hand, the producer may set `promptParams.cardId`. Interaction Presentation localizes that card name for the prompt and highlights the matching hand card; non-recipients receive `private-prompt` without `promptParams`.

Native card effects may implement `CardEffect.projectInteractionRequest(state, player, request, actionId)` to derive current choice availability or resource quantity limits. The callback is a pure query scoped to its own pending action; it must preserve prompt metadata, accepted decisions, cached random observations, and execution progress. Session refreshes the active pending request and its choices before presentation, authoritative commands, and single-choice advancement, using the effective pending owner (including cross-player responses). The same refreshed envelope drives submission validation, nested-anytime resumption, undo, and restored sessions. Projection never reruns action execution, payment, drawing, logging, or future mandatory continuations; cards retain their existing hidden/disabled-option and automatic-advance policies.

`emit-choice` can declare `multiSelect: { valuePrefix, minSelections, maxSelections }`. Its options are individual candidates with nonempty, comma-free values, rather than all candidate combinations. The client collects a local subset and submits `valuePrefix + values.join(',')` through the ordinary `choice` command. Generic pending validation rejects unknown or disabled candidates, duplicates, and counts outside the current bounds before invoking any card hook; structured-prefix admission cannot bypass this validation. `minSelections: 0` permits an empty subset. Multi-select requests require an explicit confirmation even with one candidate. Cards derive dynamic limits through `projectInteractionRequest`; exhausted optional choices may become a single skip option. Card-local hooks own all resulting rule state, while the generic frontend renders candidate tiles, a count, confirmation, and optional skip controls.

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

`effectPreview` includes `resourceExchange`, `payment`, `text`, `resourceMovement`, `futureSchedule`, `futureOffers`, `actionSpace`, `cardScore`, and `fieldContents`. Common action primitives expose a pure `ActionDefinition.previewEffect` query; cards do not add presentation callbacks. Future requests share `normalizeFutureSchedule` with execution, including exact target filtering, prefixes, conditions, costs and room type. Queued-flow descriptors identify their own executable request and stop describing it after the queue has drained. The engine automatically aggregates previews for `seq(pay-resources, gain[, bonus-vp])` options. A card using handwritten `payLeaf` plus `gainLeaf` receives the same preview. Producers include `shared/cards/helpers/pay-gain-node.ts`, `shared/actions/effects/pay-helpers.ts`, and `shared/actions/effects/exchange.ts`.

`descriptionPreview` is a recursive description of `ActionFlow`. A leaf uses `ActionDefinition.nameKey` plus its `effectPreview`; composite nodes join child descriptions by type: `SeqNode` with `, `, `XorNode` with ` / `, `OrNode` with ` + `, and `ParallelNode` with ` | `. The frontend prefers `descriptionPreview`, allowing ordinary leaves, pay/gain compositions, and nested XOR or SEQ nodes to derive option text from the engine.

Generic helpers such as `pay-gain-node` no longer inject `choiceLabelKey: 'ui.interactionResourceExchange'` for mechanical pay/gain choices. Visible option text comes from `descriptionPreview` and `effectPreview`. Reserve `choiceLabelKey` and `choiceLabelParams` for semantic overrides such as field or quantity selection, `ui.interactionUseCard`, or `ui.interactionSeedResearcher`; do not duplicate i18n for plain resource exchanges. `special-effect` supplies semantic descriptions from `params.kind` so internal state synchronization is not exposed as a generic “Card Effect.” Display-only synchronization such as `set-infobox` is omitted from descriptions.

Choice Preview describes declared effects before submission; it does not promise that future conditions or later choices will be satisfiable. Preserve explicit option names that distinguish branch meaning, and omit generic action names or repeated card names when they add no information beside the effect. For future schedules, combine only consecutive rounds with identical resources, amounts, and declared conditions. Alternating, nonconsecutive, or otherwise different entries remain individually visible in their declared order.

Choice Preview is generated by generic mechanisms from authoritative rule data, without requiring each card to maintain a separate presentation implementation. For choices over farm cells, the server supplies legal targets and their selection bindings; the player selects directly on the farm board. The client does not infer target legality or interpret card-specific choice values.

ADR-0024 records the shared rule-plan ownership decision. Opaque purchase outcomes and future-offer choices may migrate to executable shared primitives so execution and preview read the same rules. Declared deterministic storage writes may be projected on a detached copy using existing source-card scoring queries; this exposes the current source-card contribution change rather than a branch-wide final-score prediction. Card Field choices use their displayed slots with one Logical Field identity. A spatial target with multiple alternatives requires an explicit choice among those alternatives.

`ActionChoiceOption.target` carries the actor, logical-field identity where applicable, occupied positions and explicit Card Field slot references. `targetCard` preserves physical action-card identity and its declared actions when several bindings share one cell. The frontend renders these facts and submits the original opaque value.

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

`targetPlayerId` executes an ordinary flow node from another player's perspective. Runtime compilation converts it into `ownerPlayerId` metadata on the target subtree; a child with an explicit owner keeps that owner. Top-level Session builders and dynamic insertion paths for hooks, listeners, action `result.flow`, and resolveChoice follow-ups must carry the current effective owner so later siblings can return to the frame or ancestor owner. Cursor restoration persists node-owner metadata instead of inferring it from global `currentPlayerIndex`. `injectBeforeFlows(flows, ctx)` drains only injected nodes owned by `ctx.player`; a before-placement node owned by another player returns to the Session driver, which runs it in that player's context.

Runtime nodes:

- `ActionNode` is equivalent to the reference `LeafNode(action)` and calls `ActionDefinition.execute` with `actionId` and `params`.
- `SequenceNode`, `ParallelNode`, `OrNode`, and `XorNode` correspond to the reference `SEQ`, `PARALLEL`, `OR`, and `XOR`. After choosing a composite branch, `XorNode` stores `selectedChildId` and traverses only that branch until completion so `xor(seq(...))` does not finish after its first successful leaf. A leaf selected directly by an OR/XOR branch stores the branch value as `selectedBranchChoice`, persisted in the cursor. When that leaf completes without an interaction of its own, its `immediatelyAfter` and `after` reactions receive the branch value as `choice`, whether it runs at once, after `before` reactions, or after an owner handoff. A leaf that issues its own request still completes with the submitted value as `choice`; for example, occupation reactions read the played card. `ParallelNode(mode='trigger-select')` implements reaction selection with pass and mandatory semantics for action listeners, phase card-effect activation, and extra-turn providers.

Shared runtime metadata:

- `ownerPlayerId`: cross-player execution owner, inherited from the ancestor or frame unless the child sets one explicitly.
- `optional`, `optionalActive`, `optionalPromptKey`: optional accept or skip state. `xor` and `or` retain a direct `__skip__` option.
- `mandatory`: an accepted mandatory continuation marks both its host node and descendant `ActionNode`s. Internal `afterHostCommit` children and every flow dynamically returned or injected from a mandatory node inherit the marker recursively. If a later leaf cannot execute, it returns mandatory-blocked and Session enters undo-only `engine-blocked` instead of silently completing a partial continuation.
- `selectedChildId`: runtime selection cursor for `XorNode` and trigger-select `ParallelNode`. Cursor restoration persists it so a chosen composite branch or provider resumes after pending state, undo, or WebSocket restoration.
- `resolveAfterSelection`: one-shot trigger-select mode. The parent resolves immediately after the selected child completes. Extra-turn provider selection uses this so sibling providers are not offered after one is chosen.
- `pending: PendingEnvelope | null`: input envelope. `InteractionRequest` is a WebSocket and Session protocol shape, not a tree node. Leaf requests, `xor`, `or`, optional nodes, trigger-select parallel, and synthetic confirm, feed, and farm-select all pause and restore through pending envelopes. Every request kind a leaf returns, including from an OR/XOR-selected branch or after an earlier pending choice, opens a pending envelope whose option surface comes from `interactionRequestChoices()`; completion reactions run only after it is submitted.
- `animal-reorg` hand-off: when a leaf returns an `animal-reorg` request (a `reorganize` leaf, or `breed` under last-harvest enforcement), Session hands the reorganization to a reorganize sub-flow pushed above the frame. `Engine.deferPendingActionCompletion()` settles the host as `ok` and inserts an internal deferred-host node after it. When the frame resumes after the sub-flow, that node runs the host's `immediatelyAfter` and `after` reactions once, on the reorganized farm, with the host's source card, action context, space, branch choice and request-time events. A host `reorganize` keeps all of its listener phases: the sub-flow leaf carries `__hostOwnedListenerPhases` and matches no replace, `before` or completion listeners or action hooks, so the host's `before` is not repeated. For any other host, and for a reorganization Session starts itself, the sub-flow is the reorganization and runs its own `reorganize` phases.

Listener activation is an internal leaf: `ActionNode(actionId='activate-card')`. Its parameters include `{ listenerId, cardId, phase, actionId, event, ownerPlayerId, ownerCardZone, triggerPlayerId }`. `event` retains the triggering action's `actionContext`, including `targetSpaceId`; activation resolves the listener's actual `space` from that context. It bypasses the ordinary public-action pipeline, executes only the listener body, and inserts returned flow or follow-up actions into the engine.

`before` reaction leaves may return `ok.beforeHostContributions`: JSON values keyed by namespace and source card. The engine uses the existing `continuationParentHostNodeId` to upsert each contribution into the original, unstarted host's `actionContext`; a leaf cannot choose an arbitrary host, and a contribution without a valid before host fails. Repeating a source replaces its contribution rather than appending it. These values follow the host through pending, private cursor recovery and undo, and are not inherited by independently granted or nested actions.

Fencing separates `fenceCostDiscounts` (wood relief only) from `fenceSupplyReservations` (explicitly selected card-held ordinary fence pieces). Admission, previews and payment use the same host context and current supply. Only selected physical supply increases available pieces; commit consumes at most the number of newly built ordinary fences, independently of discounts and palisades. Actual cost attribution feeds payment previews and `resource.paid.bonusSources`; physical use emits `farm.fenceConsumed` with the supplying card's `sourceCardId`, even when another card granted the fence action. No player-wide pending fence slot or after-reaction cleanup is needed.

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

Card-sourced anytime entries use `evaluateFlowDoable()` at the shared list builder; command validation and harvest/pre-scoring windows consume that same list. The probe ignores only the root optional flag and uses the new flow's own source, parameters, and action context. It preserves current-step admission, including legal before/replacement paths and gains preceding later payments. Existing card guards still apply to composite flows with bookkeeping prefixes. An unavailable direct invocation is rejected before history or engine mutation. Accepted anytime flows carry mandatory obligations in both idle and interrupted interactions, including their required descendants; failure retains any interrupted host and uses the existing blocked/explicit-undo policy. Inner optional choices retain their skip behavior. Dynamically returned listener, action, replacement, and choice flows, including follow-up actions, inherit the injected-anytime origin marker from their parent context; completion markers and unrelated action parameters are not inherited. Listener activation events preserve the host action parameters alongside source and action context, so trigger previews and execution use the same selected renovation target as admission.

An anytime listener may declare `replacesTurn: true` when accepting it consumes the owner's current work-phase turn instead of interleaving with another action. Such entries are offered only from an idle work-phase interaction. Session opens the ordinary Turn Scope and action snapshot before injecting the flow, then completes it through the same end-turn hooks and player rotation as a worker action. It never offers a turn replacement inside an active action, pending stage flow, or nested anytime window. E062 Sour Dough is the reference implementation.

`GameCore.engineDeps()` and every engine `proceed` share `syncDynamicActionSpaces()`, registering current board spaces whose definitions are missing from the execution directory. Cards create board spaces through public mechanisms and do not access the Session registry. A missing ActionDefinition is an internal invariant error handled by authoritative command rollback, not ordinary blocked admission, an unavailable branch or an optional skip. Ordinary doability failures and accepted mandatory continuations retain their existing blocked/undo semantics. Immediate post-purchase use, creation and use within one flow, undo/rebuy and pending restoration share these synchronization boundaries.

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

Ordinary undo history also stores a detached `EngineStackCursor`, including every parent frame, frame identity, subflow reason, stage continuation, deferred player switch and resolve boundary. `undoStep()` and `undoAction()` rebuild the complete stack without advancing it; they do not replace a nested frame with a top-level frame. History cursors remain private and survive the same JSON snapshot round-trip as command checkpoints. This preserves stage completion when an anytime action is undone and repeated inside animal reorganization.

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

**Session repair contract (#1257).** Internal command outcomes distinguish Input Rejection from accepted mandatory blocking. Pending-input validation and retryable choice rejection identify rejected input explicitly; a failed execution after accepting a branch remains blocked progression. Session settlement restores the complete rejected command checkpoint, including history and action-start metadata, before rebuilding the response. The prior state, scores, interaction and undo eligibility remain unchanged. `ok:false` and `recoverable:true` alone do not identify rejection. Rule-valid guard-breaking commands retain their durable provisional restoration and failed-attempt memory under ADR 0015; an invalid input does not gain that side effect merely because it was submitted inside a guarded scope.

### 6.4 Extra-Turn Rotation Extension: `contributeExtraTurn` and `hasPendingExtraTurn`

A092 Adoptive Parents introduced the extra-turn mechanism at the rotation layer under #203 and #204. Providers normally run after ordinary workers are exhausted. A provider with `extraTurnBeforeWorkers: true` also competes with ordinary placement during normal rotation; resolving either choice consumes one turn before the next eligible player acts.

- `contributeExtraTurn?: (state, player) => ActionFlow | void` is a `CardEffect` hook. It returns that card's provider flow when available and `void` otherwise. `runCardEffectHook` does not execute it automatically; rotation gating in `shared/session/phases/round.ts` consumes it explicitly.
- `collectExtraTurnContributions(state, player)` is the sole source. `hasPendingExtraTurn` checks for providers; `collectExtraTurnFlow` compiles the real interaction. One provider expands directly. Multiple providers use one-shot `ParallelNode(mode='trigger-select')`, with each child an internal `activate-extra-turn` leaf. The player first selects a source card; only then does its flow expand. Provider flow may contain nested interactions such as `xor(seq(...))`, and the selected branch must drain completely before the provider finishes.
- A repeatable provider may define internal adjunct `countExtraTurns`, allowing mandatory turn skipping or forced consumption to consume one opportunity. `_extraTurnSkipCountsByCard` and `_extraTurnConsumedCountsByCard` record per-card skipped and consumed counts. `countPendingExtraTurns` and `consumePendingExtraTurns` reuse provider aggregation instead of a global player counter. A noninteractive fallback consumes one source in stable card order only when automatic progression is required.
- Three round gates treat a player with a pending extra turn as eligible: next-active-player selection via `nextSeatedPlayerIdx`, whose predicate is `workersAvailable(state, p) > 0 || hasPendingExtraTurn(state, p)`; `roundWorkComplete`, requiring every player to have no available workers and no pending extra turn; and the rotation skip loop, which stops on a zero-worker player with a pending extra turn so the flow can be injected.
- `startPendingExtraTurnIfAny(core)` is the only injection path, shared by work-phase entry, confirm-next-player rotation, state loading, and undo restoration. It only injects into an empty engine stack at the current seat. With ordinary workers available, eligible providers appear alongside ordinary placement and legal Moor special actions. Without ordinary workers, the existing one-provider or one-shot provider selection applies. A supply provider can be declined only once ordinary workers are exhausted; choosing an ordinary placement preserves later opportunities unless the card requires the first turn. First-turn cards consume their opportunity in the existing `onEndTurn` hook, including after a Moor special action that places no person.
- A92 contributes XOR use or forfeit. Choosing Forfeit exits later opportunities that round. It triggers when ordinary workers are exhausted while an inactive newborn remains, using the existing newborn-specific lifecycle. M057 enters the card or board selection flow for a Moor special action and still invokes normal special-action before and after listeners.

`skipTurn`, used by cards such as D134 Oyster Eater through `{ skipTurn: true }`, mirrors the reference `Globals::setSkipNext` and makes rotation continue past the player before their turn starts. `contributeExtraTurn` keeps an eligible provider in rotation, and `extraTurnBeforeWorkers` permits choosing that provider before ordinary workers are exhausted. See *Extra Turn / Forfeit* in `CONTEXT.md`.

Supply placements use `place-farmer` with `actionContext.workerSource: { kind: 'supply', disposition, workerId? }`. Execution locks one finite worker ID before showing targets; submission, target action, events, linked occupancy, movement, and undo retain it. Target actions use ordinary action semantics and placement statistics. A card-driven placement records its person-action identity in the existing Turn Scope so end-of-turn hooks receive the same trigger as ordinary placement.

Cards that use an action space without placing a person use `place-farmer` with `actionContext.viaCardJump: true`, a `targetSpaceId`, and no `workerId`. This worker-less branch neither requires nor mutates a worker, does not emit `worker.placed`, and does not increment placement statistics. The card must first validate the target through `isActionDoableInFlowContext()`; execution then expands the target's ordinary action flow so replacement, cost, listener, and submission validation remain authoritative. A151 Minstrel uses this path during returning home after all ordinary people have already been placed.

A same-person `jumpLeaf` carries the exact person from the triggering placement. Candidates and authoritative execution query the target as a relocation with `ignoreWorkerAvailability`, without requiring another person at home. The card grants an occupied-target exception through scoped `computeArgs`; ownership, source location, linked blocks, vetoes, target payment and the complete target flow remain authoritative. Before reactions use action-space-use semantics and exclude `requiresNewPlacement`. A129 moves the same person between its two fixed targets and retains `jumpChain` recursion protection. Relocation does not advance Person Placement Order or open another Turn Scope.

`inactiveWorkersInSupply()` excludes reservations, pending placements, temporary people, and permanently removed tokens. `availableWorkers()` includes a temporary person recalled from the board, while family size, housing, feeding, and person scoring still use permanent members. `returnSupplyWorkers()` runs after all `onBeforeReturnHome` hooks and before `onStartReturnHome`; it removes every location of the exact ID and applies its original disposition. Recalled or moved people retain that disposition. A returned token is immediately eligible for family growth. Reservations without a due return round survive returning home; cards release or unlock them at their declared timing. Before that cleanup, `recordReturnHomePlacements()` captures the final board positions after all before-return moves in the existing per-player `__roundPlacement__` history. Return-home occupancy effects read `getReturnHomePlacements()` instead of live occupancy, so a returned supply person still counts and a newly vacated space does not create a false return-home opportunity. Each entry preserves its supply disposition: occupancy checks retain removed people as historical occupants, while `getReturningPersonPlacements()` excludes synthetic blocks and `remove-from-game` entries. Swimming Class, Curator, Seed Researcher, and Night-School Student use the returning-person view; Turnip Farmer, Minstrel, Bohemian, and Food Distributor use start-return-home occupancy. The snapshot survives pending serialization and undo, and `resetRoundPlacements()` clears it next round; live WorkerRefs remain the placement authority. Curator counts distinct returning person IDs on spaces defined by `gainPerRound`, including emptied accumulation spaces. Ordinary blocked/anytime/undo and Protected Observation boundaries remain unchanged.

The supply-person model distinguishes a reservation from a placement opportunity. D022 releases its reserved ID in the target StartOfTurn through `onRoundStart`, ordered alongside that player's other round-start sources. After release, family growth or another supply effect can consume it. D022 requires an available supply person and locks its ID when used; the original reservation does not last until use or decline.

Supply opportunities use the same current-step admission as other mandatory flows. They do not promise a legal target after their preceding payment or effect: an accepted E022 use with no legal target keeps its spent card food, flag and pending person in `engine-blocked` until explicit undo restores them. B022 likewise retains its mandatory blocked/undo boundary when its only supply person is reserved by another card; the accepted purchase cannot keep its two-food gain by skipping placement. Do not add future-target preflight or automatic refunds to these providers. Pending ordinary-card draws prevent extra-turn injection; resolving the last draw resumes the opportunity menu. See the [approved model](https://github.com/titanxxh/open-agricola/issues/841#issuecomment-5582219668) and [Session acceptance plan](https://github.com/titanxxh/open-agricola/issues/842#issuecomment-5582333821).

Expiring extra housing first clears that source's capacity, then compares family size with physical rooms plus `getExtraRoomCapacity()`. Insufficient remaining housing removes only the first active person in the stable family collection, marks `removedFromSupply`, clears action-space, linked-block and held-worker references through shared cleanup, and emits `worker.returned` with `to=removed`. Family size, feeding, scoring and growth supply derive from person facts without a separate family limit or person-to-room binding.

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

### 6.6 Snapshot data and executable-rule recovery

**Session repair contract (#1258, #1270; ADR 0028).** New-game creation owns initial dealing. Loading or restoring an existing Session preserves present empty hands, stored card identities, missing optional rule fields, animal assignments and history; it does not re-deal or materialize a different rule-state representation. Invalid required input is rejected instead of being converted into a new game. Pure capture retains observed data. Session-owned rehydration rebuilds known executable definitions and engine cursors without replacing the captured data. Ordinary undo, command checkpoints, provisional checkpoints and process recovery share this preservation contract. Existing display-name and public-event cancellation/archive rules still apply at their respective boundaries.

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
| `place-farmer-on-space` | Places an additional worker on a fixed target and expands that target's flow. `allowOccupied` relaxes only occupancy, never blocking, round availability, executability or worker supply. Cards never write `ActionSpace.takenBy` in a handler. |
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
| `CostResourceRemovalModifier` | Structurally removes a resource key from every fee before enumeration and keeps it removed after later bonuses. Use it, not a large capped discount, for "no longer needs X". |
| `paymentResourceProviders` | Payment-only virtual resources declared inside a card: availability, covered resources, consumption source. They appear under their own key in `resourcesPaid` and never in cost rows or `PlayerState.resources`. |
| `paymentBudget` | Ceiling on final `resourcesPaid`; it supplies nothing and never restricts geometry or unit count. |
| `minimumResourcesPaid` | Floor on final `resourcesPaid`, checked before dominance pruning; admission and the payment child share it. |
| `resourceReserve` | Keeps a minimum total in a resource pool after payment; filters solutions only. |

**Fixed pipeline order** (a domain rule, not a card precedence): base candidates (`fee`, `fees`, `unitFee`, dynamic `getBaseCosts`) → structural resource removal → Candidate Closure → action-scoped trades → bonuses → card-provided payment resources → cards → affordable solutions → `paymentBudget` / `minimumResourcesPaid` / `resourceReserve` filters → dominance pruning and sorting.

- **Candidate Closure** ([ADR 0004](adr/0004-candidate-closure-replaces-cost-modifier-ordering.md)): card-purchase and occupation costs normalize into a Cost Candidate List, and every `deriveCardCostCandidate` transform applies to a fixed point followed by Mandatory Saturation. Results are independent of registration order; there is no `order` field anywhere. Each resources + `originalFeeIndex` group keeps one representative row. A card declares only a single-candidate transform and `cardCostCandidateMandatory`; dynamic base costs come from `CardImpl.getBaseCosts()`. Static consumers read printed candidates through `getPrintedImprovementCostCandidates()`.
- **Two cost paths** ([ADR 0003](adr/0003-card-purchase-compute-card-costs-candidates.md)): major / minor improvement and occupation costs use the candidate pipeline; other actions aggregate `computeCosts` results. Candidate metadata (`sources`, `originalFeeIndex`, Cost Attribution) never enters `PaymentSolution`; the receipt merges it into `sourceCards`.
- **Dominance pruning** runs after resource feasibility and exempts payment-path identity, state-affecting bonus choices and card payment.
- **Cost Attribution**: saved / paid statistics come from attribution, never from a pay leaf's `sourceCard`. Action `computeCosts` declare `costAttribution`; the host writes the clamped before / after delta after real execution.
- **Payment option identity**: values are `<prefix>:<index>~<identity>`. Parsing settles the payment with that identity even if a recomputed list moved it; a vanished payment is a recoverable rejection that keeps the menu.
- **Receipts**: occupation and improvement commits keep the owning host payment's exact resources, bonus sources and returned card; a free play carries an explicit empty receipt.
- **Supply tokens are payment resources**: fences and stables flow through `cost`, the solver, `resourcesPaid` and `resource.paid` like any resource. Paying one increments only `player.supplyTokensConsumed`. Remaining capacity is read through `getOwnOrdinaryFenceBuildLimit()`, `getOwnOrdinaryFenceReserveCount()` or `getAvailableStableSupplyCount()`.
- **Granted cost bonuses**: a granted renovation carries a serializable, sourced `Bonus[]` in its leaf's `actionContext.costBonuses`, merged with `computeCosts` against the live target; no temporary player modifier is installed.
- **Validation**: `validateComplexCost`, `validateTradeModifier` (no `minNumRooms` on a unit trade) and `validateBonus` throw in development and degrade to no solutions in production. A branch with a negative `resourcesPaid` value is dropped.
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

- `ActionHookContext` is `{ actionHooks, state, player, space, actionId, phase, result?, choice?, doable? }`; during execution `ActionMutationContext.eventSink` records events. `ActionHookResult` is `{ doable?, actionId?, extraOptions?, followUpActions?, flow?, costs?, trades?, bonuses?, paymentResourceProviders?, costAttribution?, reserveResources?, sourceCard? }`. A top-level `flow.sourceCard` is copied to child leaves that lack one.
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
2. Every matching `decline + alternativeFlow` contributes one complete subtree. `buildReplacementChoiceNode()` inserts an ordinary XOR before the original's optional prompt with `requiresExplicitChoice=true`, so even a single replacement waits for the player; the original branch keeps its optionality and no branch's `before` runs while offered. A chosen branch re-enters this pipeline skipping only its own producer; the original carries `checkedReplaceAction`, which only the dispatcher interprets. `resolvedReplacement` freezes the decision across restore; producer guards reset when placement or movement grants a new opportunity.
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
- **Synthetic dispatch**: `trade-applied` and `harvest-feed-conversion` run only non-optional `special-effect` leaves in deterministic `seq` / `parallel` flows; payments, gains and interactions are not supported there.
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
- The fencing main path never branches on card IDs or per-card flags. Card behavior uses `fencePolicy`: `allowedSegmentTypes`, `sourcePolicy`, `segmentBounds`, `newPastureBounds`, `newRegionBounds`, `connectionPolicy`, `allowedNewRegionTiles`, `allowTerrainInNewRegions`, `suppressTerrainRegions`, `costPolicy`, `paymentBudget`, `cancelPolicy`, `preserveAnimalTotals`, `promptHintKey`.
- `sourcePolicy: { kind: 'borrowed', donorCaps }` requires `fenceSources` covering every new ordinary edge; the server reclamps caps against live donor reserve and consumes donor supply.
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

Card faces, trigger labels, log previews, and replay rendering share the display helpers in `client/components/common/cardText.ts`. Names and individual text fields use the canonical translation section, then `meta.locales[locale]`, then source metadata (names additionally support legacy `cards.<id>.name` aliases before the source fallback). Card-owned prompts and buttons reference names with `{card:<id>}`, resolved by `translateCardText`, rather than copying translated names into each string. These references affect presentation only and never execute rules.

Within metadata locales, empty or whitespace-only descriptions, supplemental rules, and prerequisites fall back to their source fields independently. A translated name can therefore coexist with a source description while a draft translation is incomplete.

Hotseat and both sandbox executors initialize unnamed seats with the same `Player N` convention and `PlayerState.nameIsDefault = true`. The presentation boundary in `client/utils/player-name.ts` localizes names using this provenance and the seat index, including handoffs, player tabs, scores, and log text. Supplied names, including account names such as `PlayerA`, `playerF`, or `Player 6`, are rendered literally. WebSocket creation and joining send only supplied names; missing names stay empty in the room connection metadata and retain engine-generated provenance through joining, reconnecting, and rematches. Authoritative renaming clears the flag; undo preserves the current name and its provenance together. Replay identity overrides clear generated-name provenance when replacing the name. Completed-game result rows and replay participants retain this provenance as `name_is_default` / `nameIsDefault`, so result summaries, perspective selectors, and the Replay Viewer use the same presentation boundary. Log entries identify their primary player with `playerId` and additional name parameters with `playerRefs`; both snapshot and event rows resolve these identities before timeline deduplication. Presentation does not mutate authoritative name values.

`impl` is the Card Impl and contains `modifiers`, `listeners`, `effect`, `prerequisiteCheck`, helper calls, and `reaches`. Modifiers belong to the implementation, not Card Display. Builders may statically extract `reaches` and project it at the top level of the manifest, but it does not belong in `meta`.

`scripts/build-cards-manifest.ts` must statically extract `meta` with the TypeScript AST. It must not import a Card Source or generated catalog at runtime. `meta` may contain only JSON-like literals and simple same-file constant references; `impl` may contain arbitrary runtime code.

### 8.2 Generated catalog and registry

| File | Role |
|---|---|
| `shared/cards/catalog.generated.ts` | Generates `allCardSources`, `minorImprovementCards`, `occupationCards`, `implemented*`, and `ALL_CARD_IMPLS` from Card Sources |
| `shared/cards/active-registry.ts` | Temporary synchronous `CardRegistry` scope; no persistent default |
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

Card Sources own both storage and interpretation. Native `presentation` declarations opt specific counter keys, stacks, Card Fields, held workers, reservations, attachments and markers into common display adapters; `getStatePresentation(player)` supplies source-specific facts such as resource pairs or lying animals. `infobox` and resource statistics are explicitly public adapter channels. Authoritative serialization records normalized `cardStatePresentation`; frontend and seat-view Replay render these facts and authoritative animal/stable projections without decoding raw fields. Derived facts are stripped on rehydration and are never a second writable source of truth.

Card state has three audiences: internal (default), public presentation, and player-private `privateData`. Ordinary snapshots, patches, dev WS snapshots, events, histories and seat-view Bug Reports/Replay expose only public facts and the viewer's declared private data, including when the viewer owns the card. Private data follows the storage player rather than the current card holder. Authoritative state, recovery, undo, debug full state and all-open Replay retain raw state. New `card.stateChanged` events carry source/key metadata without values; projection also removes values from historical events without rewriting immutable Frames or their Viewer references. New Frames record the additive presentation facts and use a newly built content-addressed Viewer. The existing JSON Frame/delta container schema is unchanged; the Room header locks its Viewer build at creation (ADR 0011).

`getRuleContributions(player)` provides read-only component reservations and unused-space reductions. Shared consumers combine unique played sources, floor finite values, reject negatives/non-numbers and cap deductions at the category's size. Generic stable discovery and return dispatch by `sourceCardId`; the source alone changes its construction state. Farmyard geometry receives actual non-pasture animal counts from AnimalZones instead of inspecting a card or subtracting capacity. Query inputs/results are detached from authoritative storage, and native/Workshop read-only queries use the same contract.

### 8.4 Convenience helpers under `shared/cards/helpers/`

- `pay-gain-node.ts`: templates for gain after payment, an appended action after payment, or returning resources to the current space before gaining.
- `stage-effects.ts`: stage card-effect flags and optional once-per-card Harvest exchanges. Craft buildings expose a skip-or-convert flow through the existing exchange executor and trade events; querying the harvest hook does not consume materials.
- `card-state.ts` and `round-placement.ts`: one-time `flagged` or `extraData` state, raw Work Placement Chronology, and Person Placement Order. Ordinal person effects exclude same-worker relocations but include normal temporary placements and a recalled worker's later normal placement. Effects scoped to the second person's placement use `isCurrentActionSecondPersonPlacement()`, which matches the second normal placement's worker against the current action context's `placedWorkerId`, falling back to the active action snapshot only when the context has no placement identity, and rejects injected anytime contexts.
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

`shared/cards/helpers/card-field.ts:makeCardFieldImpl(cardId, def, options?)` registers the Card Field owner and derives its sow integration. An individual card declares only the configuration and optional `onReap` / `onCropRemoved` callbacks for owner-specific side effects.

Virtual tile columns derive from `deriveVirtualTileCol(cardId, slotIdx) = deckOrdinal*1000 + cardNumber + slotIdx`, preventing cross-deck collisions. Capacity slots for adjacent numbers in one deck require auditing; the current 11 cards all have capacity at most three, leaving ample margin.

The card-facing interface has three entry points. `getLogicalFields(player)` returns an immutable, deterministic projection of Farmyard Fields plus every registered played Card Field, including empty fixed-capacity slots. `getFarmyardFields(player)` is the explicit narrower query for plowing, fencing, adjacency, board occupancy, and other Field-tile geometry. `mutateLogicalFields(state, player, options?)` supplies named `place`, `insertBottom`, `grow`, `remove`, and atomic `replace` operations; it validates the target before writing through the owning Farmyard or Card State adapter.

Field storage accepts every legal field good: grain, vegetable, wood, and stone. A Card Field's `allowedCrops` is its ordinary Sow capability, not its storage schema. `place` applies that whitelist by default and lets a card effect explicitly bypass it; ordinary Sow and `replace` remain whitelist-restricted. Owner callbacks inspect the actual good before applying crop-specific effects.

`fieldOperationFlow` supports an optional `sourceCrops` constraint for `move`. The destination continuation carries that same constraint and rechecks the current source crop and quantity before either selection stores temporary positions or mutates a field. Destination occupancy and `allowedCrops` are also checked before committing the selection. Cards declare their permitted source goods locally; A071 permits grain and vegetable from either storage owner. Movement still uses the shared mutations and returns the source owner's callback flow.

Card Field slots store their top `{ crop, remaining }` and optional `below` layers in bottom-to-top order. `insertBottom` places a rule-granted crop without adding a slot or applying the ordinary sow whitelist. Projections expose all layers for crop counts while preserving each slot's top and identity. Normal Reap allocates one crop per occupied Card Field slot, additional or whole-field harvest counts continue through lower layers, and last-crop callbacks inspect every layer. The client displays buried layers but maps selectable tops to the original slot, including holes.

Base field scoring counts Farmyard Fields only; Card Fields remain available to Logical Field rules, Sow, and Reap.

A Card Field has one stable Logical Field id and one `groupKey` regardless of capacity. Its fixed slots retain stable selection coordinates when another slot becomes empty. The low-level Farmyard adapter inside `card-field.ts` is the only Card Impl code allowed to access `PlayerState.fields` directly. `check:card-impl-boundaries` rejects property or bracket access named `fields` in production A–E, Farmers of the Moor, major, community, and helper sources, regardless of receiver name and without a legacy allowlist.

The side-effect callbacks are:

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

onCropRemoved?: (ctx: {
  state: GameState
  player: PlayerState
  crop: ExtraSowableCrop
  amount: number
  isLast: boolean
  cardId: string
  reason: FarmCropRemovedEvent['reason']
  trigger?: ReapTrigger
  sourceCard?: string
}) => ActionFlow | void
```

`onReap` runs only for reap and preserves harvest-specific card semantics. `onCropRemoved` runs for every real crop removal, including reap. Each callback runs after the shared mutation and once per crop; returned flows join the ordinary `parallel` reaction.

When a selection effect returns a removal callback's `ActionFlow`, the engine resolves that dynamic child before advancing to the selection's next parent continuation. Immediate effects caused by the removed crop therefore finish before the removing card's own follow-up action.

The `reap` action is the single reaping implementation for both storage owners. It iterates occupied Logical Field slots through `computeHarvestCount()`, persists removal through `mutateLogicalFields()`, and produces the same resources, Harvest Count applications (including zero-yield applications), harvested crops/positions/field counts, crop events, generic listeners, and owner callbacks. Multi-slot Card Fields reap every occupied slot but count once per Logical Field and crop. Private Field Phases enter the same action with a private trigger and do not write the full-Harvest summary.

The 11 cards currently migrated to this helper are B68, D75, E80, D25, E72, C70, E68, E69, E70, B113, and B141.

### 8.6 Naming and constraints

- Card files use `{Deck}_{Number}_{Name}.ts`, for example `A123_FrameBuilder.ts`, and export a constant with the same name.
- Keep a card's ability closed inside its card file wherever possible. Do not spread it into core files such as `shared/actions/effects/pay.ts`, `shared/actions/effects/improvement.ts`, `shared/session/session-core.ts`, or `server/game/authoritative-session.ts`.
- Prefer hooks, generic `CardDefinition` fields such as `cost`, `reward`, and `prerequisite`, and `cardStates`.
- Forbidden patterns are card-specific conditionals in core files, centralized card-effect registries, and frontend card-specific rules.

Runtime cross-card identity and capability queries must use typed `CardDefinition` metadata and played-card helpers: `getPlayedCardDefinitions(player)`, `collectCardDefinitionsAs(player, type)`, and `playerHasCardCapability(player, capability, { asType? })`. They inspect only `player.improvements`, `player.minorPlayed`, and `player.occupationPlayed`, never hands. `asType` reuses `cardCountsAs`, preserving existing identity semantics for dual-type cards.

Registered generic metadata currently includes `preventsHandDiscard`, `fireplaceIdentity`, `cookingHearthIdentity`, `ovenIdentity`, `firewoodBuildTrigger`, `potteryIdentity`, `animalHolder`, `blocksHouseAnimalZones`, and `waresSalesmanGains`. These fields belong to Card Source `meta` and may project into catalog and manifest, but add no frontend behavior. In OA, `ovenIdentity` represents oven-family identity and includes upgrades or minors such as Oven Installation for Oven Damper-style scoring. This intentional project abstraction does not require every such card to provide a baking exchange or trigger Firewood. An upgrade may retain scoring identity while opting out of build-trigger semantics with `firewoodBuildTrigger:false`. Migrated paths include B146 and C35 hand-discard prevention, B153 major-identity scoring, C75 and A27 fireplace, hearth, and oven triggers, B31 pottery identity, E144 wares-gain options, D86 animal-holder occupation filtering, D12 house-animal-zone blocking, and M72 oven-family scoring.

`check:card-impl-boundaries` is part of `pnpm run check:architecture`, the canonical local architecture verification command used by both CI workflows. Runtime reads of another non-Major card ID in production Card Sources, including nested ordinary, M, major, and community layouts must migrate to a generic capability, action-context provenance, Harvest outcome, breeding-threshold modifier, synthetic occupancy, trigger snapshot, or another extension point. `Major_*`, `reaches`, `allowedPurchases`, and prerequisite candidate lists are explicit exceptions. `--warn-only` is available for an intentional temporary audit but is not an integration-validation path.

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
├── pasture.ts              derived pasture sizes, stable counts and base capacity
├── animal-zones.ts         animal-zone capacity and accommodation
├── animals.ts              animal model
├── scoring.ts              scoring and PlayerScoreSummary
├── scoring-reserve.ts      final Scoring Reserve reads, aggregation, and scoring-clone deduction
├── farm.ts, field.ts, space.ts, farmyard-space-states.ts
└── index.ts
```

`PlayerBoard(player, state)` exposes three sub-boundaries: `farmyard`, `farmInteraction`, and `animals`. `farmyard` only validates and queries farm rules, such as `canPlow`, `canSow`, `canBuildFence`, `canBuildRoom`, and `canBuildStable`. `farmInteraction` only derives `farm-select` or `farm-position` `InteractionRequest` payloads from the current farm, action context, and payment feasibility. `animals` owns zone capacity and accommodation. A frontend local farm draft consumes only the server-provided interaction payload; it does not call these rule boundaries.

Domain aggregation is shared by the main client, sandbox, and server and therefore belongs to bundle-safe layer `[A]`.

`PlayerState.pastures` stores pasture identity, tiles and animal placement. It does not store `size` or `stables`: `getPastureSize()`, `getPastureStableCount()` and `getFencedStableCount()` derive those facts from pasture tiles and current `stableTiles`. `getPastureViews()` exposes detached views with the derived area, stable count and base capacity. Animal-zone capacity modifiers receive those current views before replacement and additive modifiers run. Construction and stable returns change only the real stable positions; rule queries, scoring and parent-card requirements immediately see the result without count synchronization. Serialized player pastures add display-only `size` and `stables`; loading removes those fields while preserving pasture identity and animal assignments. Reading a view or serializing it never redistributes animals or writes rule state.

Scoring Reserve is a final-scoring choice reservation, not part of the Payment Pipeline. A card writes `{ reserved, score, cardType? }` to the target player's `cardStates[sourceCard].extraData.scoringReserveBonus` through `special-effect.record-scoring-reserve-bonus`. `computeScores()` aggregates every selected reserve and deducts it from a scoring clone before running the existing automatic costed-bonus solver. If later pre-scoring actions leave the player unable to cover the combined selection, the reserve bundle and its bonus entries are invalidated instead. Resource-based major scoring also reads remaining resources from the resulting clone. `ScoreEntry.type='bonus'` must carry `cardId` and may carry `cardType` and `reserved` attribution. If the target has not played the source card, the Scoring Reserve record supplies `cardType` explicitly.

`cardBonusVp` is the single score category for nonprinted bonus VP produced by cards. Preserve `cardId` and `cardType` attribution on `ScoreEntry.type='bonus'` wherever possible. Printed VP on the card itself remains in `cards`; compact and live scoring must keep `cards` separate from `cardBonusVp`. Legacy `cardsBonus`, `cardStateBonusVp`, and `cardBonus` shapes are removed and must not be read, merged, or supported by clients or documentation.

Public card markers also score under `cardBonusVp`. A `publicCardMarkers` entry may contribute positive or negative points, and its bonus score entry uses `sourceCardId` attribution without introducing another category.

`computePastureCapacityModifiers(player, state)` returns pasture-capacity modifiers for `computeAnimalZones` to apply while creating pasture zones. Modifiers are `replacement` or `additive`. All replacements run in play order, followed by all additives in play order. A size-one-pasture replacement such as D011 Lawn Fertilizer therefore always precedes additives such as A012 Drinking Trough or B072 Love for Agriculture, without cross-card ID reads or scratch markers. With no modifier, capacity remains `size * 2 * 2^stables`.

Each real `roomTiles` position owns a capacity-one Room Animal Holder (`house:<positionKey>`). `PlayerState.houseAnimals` is the only writable room assignment; `roomAnimalZones` is a serialized display projection, stripped on load. A shared `occupancyGroup` and `occupiedZoneLimit` constrain the number of occupied holders across rooms or card zones. Ordinary room holders share a limit of one; A086 adjusts that group limit without changing per-room capacity. Accommodation search, fixed-layout prefill, final assignment validation and client draft gating share the pure `shared/contract/animal-zone-occupancy.ts` group query. Construction adds a holder; renovation preserves its coordinate identity. Payments and house queries derive animals from the room map; tagged house-edge card zones remain separate. See ADR 0026.

`AnimalZone.houseAnimalZone?: boolean` marks a non-house zone that counts as a house animal zone. After all `onComputeAnimalZones` calls, `computeAnimalZones` removes both ordinary `zoneType === 'house'` zones and zones with `houseAnimalZone === true` when the player has the `blocksHouseAnimalZones` capability. House-zone rules use `isHouseAnimalZone()` and `countHouseAnimals()`, not direct `player.houseAnimals`, which would miss tagged zones such as D148 Domestician Expert.

Every "can accommodate" question uses `canAccommodateAnimalTotals(state, player, targetCounts)` or the add-only wrapper `canAccommodateAllAnimals(state, player, animals)`. These search for a legal assignment of final animal totals and allow later system `reorganize`. A card must not substitute a local test of whether any current zone can accept one more animal; that incorrectly rejects states made legal by reorganization. The search memoizes failed workspace assignments to avoid repeatedly enumerating equivalent branches for multicandidate exchanges such as M031 on an impossible late-game farm. `occupiedZoneLimit` applies during search, preventing false accommodation across multiple zones of the same card. If a candidate permanently reduces holder capacity, such as paying C148's held animal, candidate filtering uses postpayment capacity.

The `onComputeAnimalZones` card-effect signature is `(player: PlayerState, zones: AnimalZone[], state: GameState) => AnimalZone[] | void`. The third argument allows global facts, such as A148 Woolgrower and B086 Truffle Searcher reading `state.completedFeedingPhases`, without per-card postplay counters. Cards that do not need it may name it `_state`.

`onComputeSharedAnimalZones(owner, animalOwner, zones, state)` lets a card owner contribute a borrowed played-card zone for another animal owner. A shared zone carries, or receives from `computeAnimalZones`, `cardId`, `ownerPlayerId`, `animalOwnerPlayerId`, `displayOwnerName`, and `displaySource:'borrowed-played-card'`. If breeding belongs to someone else, it sets `breedingOwnerPlayerId`. When a card effect adds `zoneType:'card'` without `cardId`, `computeAnimalZones` fills in the current card ID so reorganization writes and accommodation queries use the same persistent identity. A fixed animal type must use `allowedAnimalType`; `animalType` is current visible occupancy, not a printed restriction for final-total search. Pasture replacement and additive modifiers no longer belong here and instead use `computePastureCapacityModifiers`.

Farm-position-backed and hosted card zones may store animals in `cardStates[cardId].extraData.animalCountsByZone`. A Hosted Card Animal Zone writes into the card owner's state, while statistics, payment, capacity search, pending-animal detection, and reorganization assign it to `animalOwnerPlayerId`. Breeding includes a zone with `breedingOwnerPlayerId` for that breeding owner and subtracts it from the Animal Owner's temporary breeding count. Reorganization and capacity rewrites route by `ownerPlayerId` to the card owner and replace only entries for the current Animal Owner; they must not erase another player's use of the same shared card.

Every ordinary holder writer persists `cardId`, `ownerPlayerId`, and `animalOwnerPlayerId` on each `animalCountsByZone` entry. A cross-player deduction consumes only entries explicitly owned by that Animal Owner. `serializeState` derives `SerializedPlayerState.playedCardAnimalZones`, `farmCardAnimalZones`, and `borrowedPlayedCardAnimalZones`, letting the frontend display 0/N zones for owner Played Cards, FarmBoard positions, and Played Cards "by others" outside active reorganization. An active `InteractionAnimalReorgZone` draft forwards owner metadata, overrides that read-only projection, and enables controls.

Animal statistics and consumption helpers such as `getAssignedAnimalsByType()` and `subtractAnimalsFromBoard()` must read and write legacy `animalCounts` or `held` together with per-zone `animalCountsByZone`; otherwise a later reorganization can rehydrate consumed animals from stale per-zone state. Server-derived `occupiedZoneLimit` and `allowedAnimalTypes` travel with `InteractionAnimalReorgZone`. The unified reorganization helper enforces the first, while the second lets the UI disable animal types the backend will reject. Before any reorganization mutation, the backend validates unique known zone ids, zone types, enabled animal species, nonnegative integer counts, count consistency, mixing restrictions, capacities, per-species inventory totals, exclusive limits, and required-empty groups. Invalid submissions return recoverable `log.reorganizeFail` with state, history, and interaction unchanged. Both an array and `{ zones }` are accepted; omitted zones are empty and underassignment deliberately discards animals. The tolerant normalizer remains for recovery, not submission repair. Entering reorganization synchronizes inactive or reduced card storage without reducing resource totals, leaving displaced animals in reserve for the player to place or discard. The frontend contains no card-ID-specific rules.

Animal Reorg Prefill is a server-derived draft, built by `shared/domain/animal-reorg.ts` for both action requests and live interaction projection. `prefillAnimalZones()` fixes every existing valid occupancy and searches compatible remaining space for the maximum number of reserve animals, with stable tie-breaking. It shares capacity, mixing, card validation, exclusive-zone and required-empty constraints with accommodation search; accommodation queries still allow global reorganization. Invalid existing layouts are left for manual correction. Prefill never writes placement, discards resources or emits placement/breeding rewards. Confirmation remains the strict atomic settlement boundary. Harvest newborn settlement locates the affected player's harvest-source breeding event after the current `harvest.phaseStarted` breeding marker and replaces that event by ID. The harvest flow creates one such breeding leaf per participating player; previous harvests, other players and private card breeding are excluded, and JSON restore or undo does not require shared object references. Explicit manual flows opt out through `actionContext.prefill=false`, carried as `InteractionRequest.prefill=false`; passive flows default to prefill. The client initializes from this draft and preserves edits on identical snapshots; changed animal inventory or zone metadata refreshes the draft.

`AnimalZone.requiredEmptyZoneGroupIds` declares final-assignment constraints without changing zone capacity. For each group id, at least one tagged zone must be empty; one zone may belong to multiple groups. `canAccommodateAnimalTotals()` checks the constraint at the search terminal, the pending payload carries it through `InteractionAnimalReorgZone`, and `reorganize` rejects an invalid assignment before mutation. The frontend applies the same generic confirmation guard. Cards only tag zones and request reorganization when play creates an invalid assignment; shared paths contain no card ids.

A farm-position-backed animal zone enters `InteractionAnimalReorgZone` through `AnimalZone.farmPosition`, `countsFarmyardSpaceAsUnused`, and `displaySource:'farm-position'`. FarmBoard renders only server-provided zones at those farm positions and never decides legal spaces. An ordinary single-zone holder continues to use `cardStates[cardId].extraData.animalCounts`. Multiple farm-position zones for one card use `animalCountsByZone[zoneId]` and persist `capacity`, `allowedAnimalType`, `allowedAnimalTypes`, and `farmPosition` with each nonempty zone for display outside active reorganization. Reorganization cleanup removes vanished zones. A card offering multiple candidate positions but allowing only one uses `occupiedZoneLimit`.

Animal payment is centralized in `shared/domain/animal-payment.ts`. During an ordinary exchange, played cards first consume local markers or holders through the `consumeAnimalPayment` card effect. `subtractAnimalsFromBoard()` then deducts from the farm board, ordinary `extraData.animalCounts` holders, and `animalCountsByZone` farm-position holders. Counter-backed holders whose consumption permanently reduces capacity come last. `AnimalZone.capacityCounterKey` plus `capacityLossOnPayment` describes that source and its postpayment loss. When `animalPaymentPreference.prefer` names a card counter, only that source is consumed; no match does not fall back to another counter-backed holder. System removals from reorganization or capacity enforcement notify cards through `onAnimalRemoved` so they can synchronize local markers without card-specific state in the main path. C148 Mud Wallower exposes its `held` counter through this metadata. Candidate filtering for M031 Livestock Market and similar cards simulates the shared payment helper and never reads C148's private `cardStates`. Card-specific breeding amounts and animal-score adjustments use `computeBreedableAnimalCount` and `computeAnimalScoreAdjustment`, so core breeding and scoring never inspect a particular card's state.

**Special-stable card-effect extension.** The parallel methods are `getSpecialStablePositions?(state, player) => FarmTilePosition[]`, `applySpecialStable?(state, player, position) => boolean`, and `getBuiltSpecialStables?(player) => FarmTilePosition[]`. In Farm Expansion's Build Stables `farm-select`, core `shared/actions/effects/stables.ts` uses `collectSpecialStablePositions(state, player)` from `card-effects.ts` to aggregate candidates with `sourceCardId`, and `applySpecialStableAt(state, player, position)` to delegate settlement to the accepting card and return its source. Candidates enter protocol field `farmHandPositions`, whose name is retained for frontend compatibility. Settlement writes `kind:'special'` and `sourceCardId` into the `farm.stableBuilt` item. The generic gate is `actionContext.farmHand === true`, set only by the Farm Expansion stables-leaf wrapper. Other stable-building entry points such as E148, A089, and C94 do not expose special stables. B085 Farm Hand, at a two-by-two field center, is currently the only implementation; core stables code imports no card. A submitted special-stable position that no source accepts returns a recoverable failure, preserving the current selection and rejecting the whole ordinary/special batch before publication. This input rejection is distinct from an accepted mandatory continuation becoming blocked.

The third method, added under #200, returns currently standing special-stable positions: empty before construction and empty again after D102 or E76 returns it. `collectBuiltSpecialStables(player)` aggregates `{ position, sourceCardId }[]` across cards. `serializeState` derives the display-only `SerializedPlayerState.specialStables` array for every serialized player, alongside the three persistent card-animal-zone projections. Domain truth remains in `cardStates` and card-effect results. These fields exist only in snapshots, not top-level `PlayerState` or `GameState`; `rehydrateState` strips them explicitly to prevent leakage into authoritative state. `GameContainerApi` derives the set of built-special-stable top-left positions from `displayPlayer.specialStables` and passes it to FarmBoard, which renders a persistent filled `.farmhand-center-built` overlay without reading card-specific `cardStates`.

---

**Session repair contract (#1267; ADR 0029).** Each occupied physical loose stable stores one `{ animalType, animalCount }` assignment by farm-position key; zero-count entries are omitted while the stable itself remains in `stableTiles`. Capacity is derived from the current backend rules. Reorganization, zone reads, payment, capacity enforcement and recovery retain the actual count. Animal-number rules sum counts; occupied-space, presence and distinct-species rules keep their own semantics. A confirmed legal assignment must have matching resource and assigned-zone totals after write/read and normal handoff, with no extra reorganization caused by lost storage. The client renders backend-derived stable count and capacity through the existing animal-assignment flow.

## 10. Other `shared/` modules

### 10.1 `shared/draft/`

`draft-manager.ts` contains pure functions for simultaneous card selection: `initDraftState`, `processSubmit`, `tryAdvanceRound`, and `finalizeDraft`. `types.ts` defines `DraftState`, `DraftPool`, and `DraftPickPayload`. Set `draftMode: 'simultaneous'` and `draftPoolSize: 7..10` in `createRoom` to enable it.

### 10.2 `shared/i18n/`

UI copy keys and localized resources. `PromptKey` is centralized in `shared/contract/prompt-keys.ts`.

### 10.3 `shared/custom-code/`

`ast-validator.ts` validates custom-card TypeScript with an AST, allowing only approved imports and blocking forbidden APIs, network, and I/O. `sandbox-listener-actions.ts` is the single source for listener actions used by prompts, the validator, and server and browser manifests. Runtime isolation lives under `server/custom-code/`.

### 10.4 `shared/utils/`

Generic helpers such as deep cloning, IDs, and math. It contains no business rules. `rng.ts` holds the seeded random streams: the numeric generator for an Explicit Seed and the HMAC-SHA256 stream for a wide seed, built on `@noble/hashes` because the rules also run in a browser Worker where the platform hash API is asynchronous.

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

### 11.6 `server/workshop.ts` and `server/workshop-pr/`

These modules provide the Workshop and Sandbox backend for custom-card upload, compilation, and pull-request integration. PostgreSQL tables `sandbox_settings` and `sandbox_cards` persist sandbox configuration: `playerCount`, `deckIds`, Through the Seasons, Farmers of the Moor, whether a game may start with too few FoM minor improvements, and Snake Opening. `POST /api/game/new-sandbox` reads these settings and passes `playerCount`, `deckIds`, `customCardIds`, and variant flags to `createInitialState()` for unified handling.

Workshop draft errors expose a typed `code` from `shared/contract/workshop.ts`. The live-edit guard returns `live_edit_blocked` with HTTP `409`; clients distinguish an unchanged-revision restriction from a server revision mismatch and preserve unsaved edits when unpublishing.

Workshop submissions use one repository-scoped GitHub App with separate write/read installation tokens. `workshop_submissions` freezes operation identity and Draft Version before remote writes, stores generated baselines, and fences local recovery with leases. Branch publication uses `updateRefs` expected-head CAS; uncertain PR creation is reconciled without another blind POST. Generated-file conflicts and maintainer PR state changes pause delivery. Only real exact-head reviews authorize publication; OWNER synthesis and submission OAuth are retired. See [Platform D5](PLATFORM_DESIGN.md#d5-workshop-to-github-pull-request-flow) and the [cutover runbook](operations/github-oauth-app-setup.md).

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
