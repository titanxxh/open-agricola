# `server/`: Backend authority

[English](server.md) | [中文](server_zh.md)

The server owns connections, Rooms, durable commit, persistence and the product HTTP APIs. `GameSession` (`server/game/authoritative-session.ts`) is its rule command and query seam, and rule mutations run in the `GameCore` and action leaves it drives; connection, persistence and HTTP infrastructure never adjudicate rules outside it.

`frontend-hosting.ts` serves `/open-agricola/` and build metadata. Same-site external hosting redirects old app entries, preserves public Room/Replay parameters, and clears credential fragments; API namespaces keep their owners. Startup matches SHA, channel, and target to `GAME_BUILD_ID` and `RELEASE_CHANNEL`; legacy descriptors are stable-only. Formal Compose fixes stable. `auth-cookies.ts` uses PSL comparisons through `http-origin.ts` for host-only HttpOnly cookies without CHIPS. Tests: `auth-cookies.test.ts`, `frontend-hosting.test.ts`, `hosted-password-login.spec.ts`. See ADR 0035.


`community-qr.ts` owns the public read-only WeChat and Feishu image endpoints. It rereads the atomically replaced host file for every request with no-store caching. `operations/update-community-qr.mjs`, invoked by `deploy-operations.sh --wechat-qr` or `--feishu-qr`, validates original images and publishes them through owner SSH access; the application mounts only the persistent community directory read only. Coverage: `wechat-community.test.ts` and `wechat-community.spec.ts`.

`whats-new.ts` serves the newest host-maintained release notes from the same community directory, rereading `whats-new.json` per request and validating it with `shared/contract/whats-new.ts`. `deploy-operations.sh --whats-new` runs `scripts/update-whats-new.ts`, which applies the same parser before an atomic SSH replacement. Coverage: `whats-new.test.ts` and `whats-new.spec.ts`.


## `server/connection/`: WebSocket entry

```text
server/connection/
├── ws-server.ts      new WebSocketServer({ server, path: '/ws' })
├── room-router.ts    routes ClientCommand.type to GameSession or Lobby
└── broadcaster.ts    fans out StateUpdateEnvelope
```

- One Room owns exactly one `GameSession`. The WebSocket handler awaits `dispatch()` through the Room and connection queues, and the Room's `ready | blocked` gate sits at command entry.
- `room-router` calls `GameSession`; `payload-validation.ts` normalizes input. `room-viewer.ts` derives control from socket membership and saved ownership, with all seats for hotseat. Commands, undo and consent use that set; Replay records the actor. Its visible-ID helper adds shared teammates for snapshots and history. Envelopes grant commands only to an owned actor; presence covers owned seats. Tests: `controlled-seats.test.ts`, `multihand-network.test.ts`.
- A rules command returning `ok=false` without `durableTransition` answers only its origin connection and creates no version or Replay Step. A durable rejection commits; only its error is private to the origin ([ADR 0015](../adr/0015-provisional-cross-player-continuation-resolution.md)).

## `server/game/`: Room and GameSession

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

- `RoomPlayer { ws, playerIndex, name, userId? }` is a connection seat, not `PlayerState`.
- `team-room.ts` keeps unseated members in `rooms.team_members_json`; waiting sockets count for quota/expiry. Pure `projectTeamWaitingRoom` serves live and My Games rosters; only live sockets add presence. `startTeamGame` commits seeded ownership/names before `roomJoined`/Step 0. `setTeam` checkpoints capacity-checked moves before publication and rolls back failures. Tests: `team-seating.test.ts`, `team-room.test.ts`.
- `room-spectators.ts` holds seatless subscriptions and reads online routes without admission. Spectators receive public join/disconnect events as well as empty-visible-seat snapshots and history; `room-router` rejects writes before reserving receipts. Viewing never changes presence, expiry or Replay. Disconnect, completion, termination and rematch end viewing. See [ADR 0040](../adr/0040-public-live-spectating.md), `live-spectating-network.test.ts` and `live-spectating.spec.ts`.
- Ordinary admission uses `resolveJoinPlayerIndex` for random free seats and saved-seat resume. Rematches preserve names/colors and publish new bindings before snapshots. Dispatch refreshes bindings from the Room; dev, solo and hotseat keep their assignment. Tests: `room-router.test.ts`, `draft-opening-order.spec.ts`.
- `room-access.ts` owns invitation admission and `rooms.invited_user_ids`. Lobby, Context, locate and WS enforce it; invitation IDs stay outside GameState, Replay and public summaries. `GET /api/lobby/players?prefix=` requires login, two characters, excludes self and returns at most ten eligible accounts. Admin-only `scope=beta-access` adds email-unverified accounts; both scopes exclude accounts pending deletion. Tests: `room-invitations.test.ts`, `auth-routes.test.ts`, `room-invitations.spec.ts`.
- `lobby-my-rooms.ts` summarizes committed snapshots for `/api/lobby/my-rooms` without restoring sessions. `MyActiveRoom` exposes occupied-seat names/colors, creation/start timestamps, expansions, round or opening phase, and the pending owner or current actor. Draft waiters have a current packet requiring a choice; waiting-for-delivery and finished seats are excluded. Private cards and account IDs stay hidden. Unreadable snapshots omit state-derived details. Tests: `server/__tests__/lobby-my-rooms.test.ts`.
- Creation preflight authorizes the new intent independently of the connection's previous rules session. Detaching from a non-active Game Context only removes its connection seat; it never publishes through that old Room's execution stamp or lease.
- Creation adopts the new Room at its durable commit callback before detaching the previous connection. Previous-room notification failures are recorded and cannot roll back or dispose the committed session; initialization cleanup depends on the commit boundary.
- Formal solo uses authenticated `createRoom(maxPlayers: 1)` and stays absent from public discovery. `game-creation-store.ts` authorizes completed-source reuse without loading its old Room or Replay. Creation atomically commits Room, Step 0, metadata and receipt, rechecking source and Workshop admission. Unavailable explicit sources return configuration adjustments. Room restoration reloads the accepted record so recovered rematches keep it. Contracts/tests: `shared/contract/game-creation.ts`, `solo-room.test.ts`.
- `roomId` identifies one game ([ADR 0009](../adr/0009-room-id-identifies-one-game.md)). `newGame` retains options and atomically commits a fresh Session/UUID and old retirement before adopting connections. Team/Multihand retain account membership and use `planTeamSeating` with the new seed: all-online accounts start immediately; missing accounts keep the roster in unseated waiting. Tests: `team-rematch.test.ts`. Only authoritative `gameOver` archives results; failure retains the final state for retry. Team results include scoring, ranks and seat team indexes. Agreed endings use `terminated`; expiry, cancellation and cleanup produce no result. Scores preserve fractions ([persistence tests](../../server/game/persistence/__tests__/postgres-replay.test.ts)).
- Hosted Rooms use PostgreSQL and mandatory recording. `RoomPersistenceCheckpoint` confirms waiting state and seats. `GameContextStore` owns persisted expiry; online connections, admissions and pending saves are protected. Administrator retention defaults to three days waiting and seven days playing. Each offline cycle freezes its deadline; updates affect the next cycle. Development games never idle-expire. `RoomAuthority` unloads idle caches separately from stored games. Missing recorded data blocks recovery. See [ADR 0039](../adr/0039-runtime-room-retention-policy.md).
- Development slots `dev2`–`dev6` map to permanent game identities that survive restarts; rematch or reset assigns a fresh identity, and completed, expired or removed contexts never revive. A development account may hold several seats, and development resume needs a seat hint or a uniquely owned seat; ordinary Rooms derive the seat from authenticated ownership. A client-side `devMode` flag grants no development privilege. `room_players` stores ownership by `(room_id, player_index)`.
- Waiting-room colors remain unique across occupied and reserved seats. `GameSession.updatePlayerColors` covers Workers; the Room queue and checkpoint commit each change before publication. Colors lock after start.
- Ordinary Rooms wait for the final arrival to issue `confirmPlayerColor`; persisted `colorConfirmationPlayerIndex` identifies that player. Step 0 commits before gameplay. Hotseat and development Rooms start automatically. Room status is authoritative. Tests: `room-router.test.ts`, `room-invitations.spec.ts`.
- `room-queue.ts` serializes authorization, rules, asynchronous commit and publication per Room; moving a connection reserves both Room queues and the connection queue. Shutdown stops input, drains accepted work and closes the pool.
- **Distributed Rooms** ([ADR 0022](../adr/0022-distributed-room-recovery.md)): `RoomDirectory` assigns each Room to one application process with a PostgreSQL lease and monotonic epoch; commit and publication verify owner and expected version. `POST /api/rooms/locate` returns a `/nodes/<instanceId>/ws` route that `ingress.ts` forwards. `CommandStore` reserves each command's content fingerprint and commits its receipt with the Room transition; a repeated command returns the original receipt. `InvalidationStore` commits card / user barriers and per-instance tasks that every execution and publication checks; an operation completes only when each required instance acknowledges or loses its lease.
- **History and recovery** ([ADR 0021](../adr/0021-room-owned-history-branches-and-recovery-snapshots.md)): immutable history nodes and recovery records are Room-owned rows written in the Room transaction. Recovery restores the authoritative session, undo history and provisional checkpoints without decoding Replay payload. Query failures propagate unchanged for storage retry; only decoding and integrity failures of data that was read fail closed as `RoomHistoryCorruptionError`.
- **Snapshot ownership**: `serializeSessionSnapshot` captures the authoritative core once; `state` and `frame` share immutable values; `rehydrateState` copies before normalization. `RoomCommitter` owns the captured Frame and payload for diffing and retries.
- **History window**: viewer snapshots carry the latest 20 complete operation groups with stable record IDs, a visible-seat-set-bound branch ID, `projectionHash` anchors and an older-page cursor. `getHistory` / `historyPage` use active seat authorization and full viewer filtering; branch or projection changes return `history_branch_changed` / `history_projection_changed`. Reads never write a Room. HTTP, local and debug payloads stay complete.

Tests: `server/game/__tests__/`, `server/__tests__/session-recovery-data.test.ts`.

Consensual termination ([ADR 0036](../adr/0036-consensual-game-termination.md)) is a separate Room lifecycle transition. `game-end.ts` defines agreement; Room metadata checkpoints persist the pending proposal independently of rule undo. `PostgresRoomPersistence.terminate()` atomically writes termination metadata, preserves the recorded Replay, completes the command receipt and retires active recovery. It never writes a normal Game Result or changes rule-based `gameOver`. Unfinished rematches use the same archive transaction and reserve all original participants, including offline players, in the new Room.

## Durable Room Commit, Game Context, Replay and Bug Report

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

`RoomCommitter` is a concrete deep module and the publish seam ([ADR 0014](../adr/0014-durable-room-commit-is-the-publish-seam.md)); do not add a one-implementation interface. Its one commit operation returns:

```ts
type RoomCommitResult =
  | { kind: 'committed'; roomVersion: number; stepNo: number; frameHash: string }
  | { kind: 'unchanged' }
  | { kind: 'blocked'; error: string }
```

```text
ClientCommand
  -> room-router: validate seat and payload
  -> GameSession: built-in cards synchronously produce SessionResponse;
     executable Workshop cards return asynchronously from the session Worker
  -> RoomCommitter: serialize once and atomically write Room snapshot plus Replay Step
  -> Broadcaster: after commit, build viewer-filtered envelopes and send them
```

- `unchanged` only when both the public Frame Hash and the private session cursor are unchanged and `durableTransition` is unset; a cursor-only transition persists with a repeated Frame. Reconnect and refetch create no Step.
- Replay Steps have a Room-global monotonic `stepNo`, independent of `roomVersion`; simultaneous submissions serialize into consecutive Steps, automatic settlement belongs to the last triggering input, and rule results never depend on arrival order. Step 0 exists before the first interactive command. A terminal Frame archives per-seat and team score summaries.
- Replay Intent is allowlisted by an exhaustive protocol switch; never store `requestId`, tokens, site `userId` or unvalidated payloads.
- Replay archives use bounded authoritative state deltas ([ADR 0011](../adr/0011-bounded-authoritative-state-delta-replays.md)).
- A write failure freezes the same Frame and Intent, blocks the Room and retries with backoff; clients wait and never read uncommitted state. The same idempotency key with a different hash blocks permanently and alerts.
- One instance admits at most 30 ordinary Rooms with OPEN connections or an unexpired 30-second reservation. `RoomDirectory` atomically checks creation and first resume, including cached Rooms; activation retains the reservation until positive presence consumes it. Offline saves and cached Rooms retain ownership and do not consume this online quota. The independent 15-Worker budget still includes retained executable Workshop executors, restored Rooms and HTTP sandboxes. Full online Rooms can reconnect existing seats and replace themselves one-for-one with `newGame`. Admission, disconnect-during-retry and cold-recovery invariants are covered by `room-directory.test.ts` and `ws-server.test.ts`.
- Game Context links resolve by lifecycle ([ADR 0013](../adr/0013-lifecycle-routed-game-context-access.md)): completed, expired and removed contexts and public Replay need no login; active descriptors, recovery, Bug Report, evidence and maintainer forensics enforce seat or administrator authorization. Errors use `{ ok:false, code, lifecycle?, message }`.
- Completed Replay is public and retained until erasure ([ADR 0010](../adr/0010-public-replay-retention-and-erasure.md)).
- Bug Reports ([ADR 0012](../adr/0012-github-issue-submission-identity-and-delivery.md)) are recoverable PostgreSQL drafts with a stable `submissionId`, attempt rows and atomic claims. The production GitHub App client and its test fake are the two adapters at that seam.

Tests: `server/game/__tests__/{room-committer,room-committer-private-cursor,replay-delta-shared-history}.test.ts`, `server/__tests__/{bug-report-routes,bug-report-store}.test.ts`, `e2e-tests/{replay-viewer,bug-report}.spec.ts`.

## `server/custom-code/`: Isolated execution

```text
server/custom-code/
├── runtime.ts           isolated executor binding for the shared registrar
├── engine.ts            isolated-vm boundary for shared validation and manifest extraction
├── isolate-runner.ts    isolated-vm entry
├── executor-worker.ts   Worker Thread entry
└── client.ts            synchronous main-process to Worker Thread client
```

- The backend stores only `compiled_code + code_manifest`. A non-built-in executable Workshop card runs every `GameSession` command of its HTTP sandbox or WebSocket Room in a dedicated Worker (`CustomSessionExecutor`); one Room runs FIFO through Durable Commit, different Rooms in parallel, and a later Room or seat change on the same connection cannot alter an in-flight command's Room or Replay actor.
- The main thread keeps only a non-executing mirror of the last successful snapshot, restored through a non-settling path so it never re-probes continuations. Inside the Worker, `client.ts` calls isolated-vm synchronously, so `Atomics.wait()` never blocks the HTTP or WebSocket event loop.
- Before each command an in-memory checkpoint preserves pending state and undo history. A hook timeout or runtime warning restores it and keeps the diagnostic; a Worker crash or overall timeout rebuilds from the last snapshot.
- `built_in=1` cards use the built-in implementation without a Worker.
- Shared source constants own capability names, and `workshop-sandbox-contract.ts` exposes their format-2 name arrays with runtime identity and limits. Execution boundaries are documented in [`docs/CUSTOM_CARD_SANDBOX.md`](../CUSTOM_CARD_SANDBOX.md).

Tests: `server/__tests__/{custom-code-executor,local-sandbox-parity}.test.ts`.

## HTTP endpoints

HTTP serves operations, tests and debugging; it is not the real-time synchronization path. Responses match `SessionResponse`, and validation endpoints never write authoritative state. Inside a WebSocket Room, development commands use `ClientCommand`.

- `beta-access-{routes,store}.ts` owns administrator `GET/PUT/DELETE /api/admin/beta-access` and idempotent grants; `experimental-features.ts` answers `/api/auth/me` qualification from one fresh read. Coverage: `beta-access-routes.test.ts`.
- `GET /api/health`, `GET /api/rooms`, `GET /api/game/state`.
- `POST /api/game/new` accepts `seed?` plus the WebSocket `createRoom` setup, mapped through `server/game/game-setup-options.ts`. `POST /api/game/load`, `POST /api/game/dev/*` and `POST /api/game/new-sandbox` are debugging and Workshop sandbox paths.
- `GET /cards-manifest.json` serves card metadata to the main bundle.
- OAuth account binding: `POST /api/auth/oauth/:provider/start?intent=link`, `GET …/callback` and `POST …/complete`, with PKCE S256 and a fragment handoff that never creates a new site session.
- OAuth onboarding binds registration tickets to a browser challenge and verifier. Explicit credentials never fall back to another cookie identity. Account creation, identity binding, invite and single-use ticket consumption share one transaction. The callback uses fragment handoff with `no-store` and `no-referrer`; distinct error codes describe missing, invalid and expired credentials. See `oauth/store.ts`, `index.ts` and the auth tests below.

Auth tests: `server/__tests__/auth-routes.test.ts`, `server/oauth/__tests__/store.test.ts`, `e2e-tests/{oauth-onboarding,account-link,platform}.spec.ts`.

Game Context, Replay and Bug Report are versioned product APIs:

Creation configuration reads require the completed solo's original participant and always use `no-store`; public completed descriptors and the credentialless Viewer never include this private metadata.

```text
GET    /api/v1/game-contexts/:roomId
GET    /api/v1/game-contexts/:roomId/creation-configuration
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

Public Replay APIs return versioned JSON, never PostgreSQL encoding. A Segment expands at most one checkpoint chain with every Frame Hash verified; an Anchor must match `stepNo + frameHash` exactly. Public reads have per-IP quotas and size caps; authenticated evidence and report endpoints are rate-limited per account.

Viewer entry HTML revalidates its response policy; content-addressed assets remain immutable. Its CSP explicitly allows the `PUBLIC_API_BASE` origin (the request origin in local development) for public reads from the opaque sandbox, while scripts remain restricted to `'self'`. Coverage: `replay-routes.test.ts` and `replay-viewer-csp.spec.ts`.

## Workshop backend

`server/workshop.ts`, `workshop-drafts.ts` and `workshop-pr/` own draft revisions, compilation, sandbox configuration and PR delivery. [Platform design](../PLATFORM_DESIGN.md) describes the product flow.

- `sandbox_settings` and `sandbox_cards` persist test setup for `POST /api/game/new-sandbox`.
- `workshop-status.ts` separates review from publication. Binding/publishing require an open, non-draft `main` PR, a fixed Draft Version and authorized exact-head approval. Mismatch or failed reconciliation becomes `stale·offline`; transient initial refresh failure preserves `in_review` for retry.
- Approved `main` merges become read-only `merged` after exact-head reconciliation; other bases become stale/offline. Reviewed live snapshots serve until `markBuiltInMergedCards` hands them to built-in definitions at release.
- Real Rooms load only reviewed live snapshots. Solo rejects changed/unavailable explicit selections with configuration adjustments; other Rooms reject the author's non-live cards and filter other unloadable IDs. Unreviewed code stays in author sandboxes.
- Author unpublish permits existing games; administrator takedown ends affected Rooms without scoring or Replay.
- `workshop-public-cards.ts` exports versioned, hashed public source/image inputs and 30-second creation/execution status. Publication history excludes private versions; reads never write sandbox state. Consumers own compilation and expired-status suspension. [Platform design](../PLATFORM_DESIGN.md#d3-sandbox-isolation-and-fault-tolerance) defines lifecycle policy.
- `workshop_submissions` freezes operation/version before GitHub writes. The repository-scoped App uses expected-head CAS, reconciles uncertain PR creation and pauses generated-file conflicts. See the [GitHub App runbook](../operations/github-oauth-app-setup.md).
- Draft errors use `shared/contract/workshop.ts`; live edits return HTTP 409 `live_edit_blocked`.

Tests: `server/__tests__/{workshop-api,workshop-public-snapshots,workshop-submissions}.test.ts`, `server/workshop-pr/__tests__/`.

## Database

- `server/db.ts` owns the asynchronous PostgreSQL connection through `pg`: transactions keep one connection across awaits, nested transactions use savepoints, and native migrations run under an advisory lock before startup. There is no SQLite or JSON runtime fallback.
- `scripts/import-sqlite.ts` imports a stopped schema-33 SQLite database through exact comparisons and blocks on damaged recorded games, and `data_imports` keeps a failed import behind a startup barrier; `scripts/validate-backup.ts` validates a PostgreSQL / S3 restore.
- `schema.sql` and ordered migrations define product tables. Replay segments use `checkpointStepNo`; evidence payloads, quotas and webhook delivery have no parallel storage tables.
- Games completed before recording are `legacy_no_replay`: they keep their result summary but have no Replay header or Frames.

## GitHub delivery, security and deletion

Bug Report delivery follows [ADR 0012](../adr/0012-github-issue-submission-identity-and-delivery.md):

- A draft freezes `roomId + stepNo + frameHash` after confirming the Reporter owns an original seat; one user keeps at most five undelivered reports. The public Issue carries a sanitized title and a body with no screenshot, log, Frame payload, other player identity or hidden information.
- Bug Report client diagnostics are parsed against `shared/contract/bug-report-diagnostics.ts`, persisted with the draft and rendered beside the server-authenticated Reporter site ID. Device and browser classifications and WebSocket close observations are client claims, not proven causes. Unknown fields and oversized histories are rejected; diagnostic text cannot inject a report marker or mention notification. Diagnostics follow symptom retention and are cleared on successful delivery, discard or account deletion. Coverage: `bug-report-routes.test.ts` and `bug-report-store.test.ts`.
- The production `github-issue-client` accepts only server-configured repository and installation IDs and reconciles uncertain responses by a stable body marker, accepting only an Issue created by the configured App after the attempt and ending uniquely with that marker. The client polls only site status, never GitHub. Self-authored submissions use an encrypted GitHub App user token (AES-256-GCM with `keyId`) and require confirming that the GitHub identity stays public; Hosted Issue Identity uses an installation token. An invalid connection never switches author.
- Account deletion persists `deletion_pending`, signs out sessions and edits known Issue bodies through the installation adapter, retrying until GitHub confirms the site user ID is gone.
- Maintainer evidence reads require a reason, are audited permanently, are rate-limited and reapply the current participant tombstone projection.
- Erasure ([ADR 0010](../adr/0010-public-replay-retention-and-erasure.md)): `server/game/replay-removal.ts` appends each batch to the independent `erasure/ledger.json` in private S3 with ETag CAS before deleting payloads; startup and restore apply it idempotently, a malformed ledger blocks restoration, and resource reads and uploads consult its permanent hash deny rules. Logs never contain tokens, Frame payloads, symptom text or raw GitHub responses.

## Deployment, rollback and observability

Deployment commands and the metric catalog live in [`HOW_TO_DEPLOY.md`](../HOW_TO_DEPLOY.md).

- PostgreSQL stores platform data and the shared resource catalog; private S3 stores `card-art/`, `replay-viewers/<viewerBuildId>/`, `replay-assets/<sha256>` and `erasure/ledger.json`. `server/storage/` owns staged uploads, references, integrity checks and cleanup claims; upload intent is durable before writing, new uploads keep a 24-hour unreferenced grace period, and only one claimant deletes an object.
- Online backup ([ADR 0040](../adr/0040-online-daily-backup-preserves-game-availability.md)) leaves game writes live. `storage/backup-coordination.ts` protects deletion; `scripts/storage-archive.ts` shares the dump/catalog snapshot and detaches restored leases. `scripts/backup-*` own deadlines, complete sets and scratch cleanup. Test: `online-storage-archive.test.ts`.
- Durable Room Commit requires PostgreSQL, shared resources, `REPLAY_VIEWER_BUILD_ID` and `GAME_BUILD_ID`. Room creation freezes both Build IDs and the custom-card runtime snapshot. The Viewer Build ID is the SHA-256 of its complete manifest; board art, card art and fonts come from the asset site pinned by `public-assets.ref`. Room creation fails when Build validation fails, and a waiting Room rejects game writes until Step 0 exists.
- Rollback is allowed only to a recorder-compatible build supporting every active Room `schemaVersion`. A missing Viewer or unwritable persistence degrades readiness. Online Room capacity rejects new admissions; retained offline saves do not reduce readiness.
- `operations/` owns the independently deployed monitoring Compose project and restricted accounts exporter. `deploy-operations.sh` pins only operations source and preserves game container identity; game deployments manage app/Caddy only. The exporter counts existing accounts and UTC+8/day and rolling creation windows without importing game initialization or running migrations.
- `server/game/persistence/opening-facts.ts` records immutable start, first gameplay and authenticated start-account facts inside the existing fenced Room transaction. These facts survive active-room and Replay expiry; outcomes still come from `game_contexts.lifecycle`. Account deletion and content removal erase the new identity associations. Owner-installed fixed aggregate functions read scalar facts and `operations_current_openings`; the independent exporter login has only aggregate execution access, with no raw table or column reads. Its zero-argument functions use a database-controlled Unix-minute cutoff; timestamp overloads are owner-only. `operations/database-access.ts` owns this permission boundary and idempotent provisioning; production, local monitoring and real database fixtures share it. Coverage begins at the migration epoch; unknown historical first-gameplay times remain unknown. Entry tests: `opening-facts.test.ts`, `operations-openings.test.ts`, `operations-dashboard.spec.ts`.
- `server/observability/` owns bounded numeric metrics, collection, the administrator gateway and overview health, and never writes rule state. Metrics carry no Room, account, command, card, payload or exception identity, and a metrics failure cannot change a game. Command duration spans dispatch through local publication; projection, encoding and send are separate stages.
- A private Prometheus scraper discovers instances through bearer-authenticated ingress; the ingress owns global Room aggregates and online users. Grafana reads only aggregates behind `/ops/`, which checks the current site session and `ADMIN_USERS` on every request through a one-use handoff cookie.
- The browser sends sampled, rate-limited timing batches (command RTT, first snapshot, snapshot-to-layout) that the server treats as untrusted observations.


## Experimental feature entry points

`experimental-features.ts` reads `beta_access` and derives administrators from `ADMIN_USERS` on every check. Migration `036-beta-access.sql` adds qualification without rewriting retained games. [ADR 0042](../adr/0042-experimental-feature-availability.md) defines availability and participation boundaries.

`connection/room-router.ts` checks Team creation, completed `newGame`, and rematch proposers at proposal and creation. `game-router.ts` gates HTTP creation and Team sandbox loads. `game/lobby.ts` and `game/room-directory.ts` filter discovery before LIMIT. `RoomHistoryStore` (`persistence/room-history-store.ts`) projects only public Team Configuration for that SQL filter; compressed recovery bodies and historical Frames stay unchanged. Existing Room participation keeps normal authorization across stage and qualification changes. `Broadcaster` owns socket capabilities in a private WeakMap; see [contract](contract.md#client-capabilities). Tests: [Room entries](../../server/connection/__tests__/experimental-features.test.ts), [HTTP](../../server/__tests__/experimental-feature-http.test.ts), [qualification and foreign keys](../../server/__tests__/experimental-features.test.ts).
