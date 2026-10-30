# `server/`: Backend authority

[English](server.md) | [中文](server_zh.md)

The server owns connections, Rooms, durable commit, persistence and the product HTTP APIs. `GameSession` (`server/game/authoritative-session.ts`) is its rule command and query seam, and rule mutations run in the `GameCore` and action leaves it drives; connection, persistence and HTTP infrastructure never adjudicate rules outside it.

`frontend-hosting.ts` owns optional same-origin `/open-agricola/` static hosting and its public build metadata. With a configured same-site external frontend, only old application entry URLs redirect to that frontend; public Room/Replay parameters survive and credential fragments are cleared. API, operations, metrics and Replay namespaces retain their owners. `auth-cookies.ts` uses Public Suffix List site comparison through `http-origin.ts`; same-site subdomains retain host-only HttpOnly cookies without CHIPS. Coverage: `auth-cookies.test.ts`, `frontend-hosting.test.ts` and `hosted-password-login.spec.ts`; see ADR 0035.


`community-qr.ts` owns the public read-only WeChat and Feishu image endpoints. It rereads the atomically replaced host file for every request with no-store caching. `operations/update-community-qr.mjs`, invoked by `deploy-operations.sh --wechat-qr` or `--feishu-qr`, validates original images and publishes them through owner SSH access; the application mounts only the persistent community directory read only. Coverage: `wechat-community.test.ts` and `wechat-community.spec.ts`.


## `server/connection/`: WebSocket entry

```text
server/connection/
├── ws-server.ts      new WebSocketServer({ server, path: '/ws' })
├── room-router.ts    routes ClientCommand.type to GameSession or Lobby
└── broadcaster.ts    fans out StateUpdateEnvelope
```

- One Room owns exactly one `GameSession`. The WebSocket handler awaits `dispatch()` through the Room and connection queues, and the Room's `ready | blocked` gate sits at command entry.
- `room-router` validates commands, authorizes seats and calls `GameSession`; it never writes `GameState`. `payload-validation.ts` is pure validation that returns normalized values.
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
- Ordinary multiplayer admission assigns each new participant a uniformly random free seat through `resolveJoinPlayerIndex`; owners resume their committed seat. Rematches stage fresh bindings and preserve names/colors, then publish each socket's binding before its first snapshot. Connection dispatch refreshes its seat from the adopted Room; dev slots, solo and hotseat retain their existing assignment. Coverage: `server/connection/__tests__/room-router.test.ts`, `e2e-tests/draft-opening-order.spec.ts`.
- `room-access.ts` owns invitation admission. Creation accepts public access by default or exactly one eligible account ID per other seat. `RoomMeta` persists the policy in `rooms.invited_user_ids`; restore and `newGame` retain it. Lobby SQL filters by the authenticated viewer before limiting results. Locate, active Context and direct WS join independently enforce admission, while existing seat ownership still controls resume. Invitation lists never enter GameState, Replay or public summaries; completed Replay stays public. `GET /api/lobby/players?prefix=` requires login, matches username or display-name prefixes of at least two characters without case sensitivity, and returns at most ten eligible display identities, excluding the requester. Tests: `server/__tests__/room-invitations.test.ts`, `e2e-tests/room-invitations.spec.ts`.
- `lobby-my-rooms.ts` reads committed snapshots for `/api/lobby/my-rooms` without restoring sessions. The shared `MyActiveRoom` contract exposes occupied seats' display names and colors, creation/start timestamps, enabled expansions, game round or opening phase, and the pending frame owner or current player. During simultaneous draft, waiting seat indexes include every player whose required picks for the active stage remain unsubmitted. Private state, card identities and account IDs stay out of these summaries. An unreadable snapshot omits that room's state-derived details. Tests: `server/__tests__/lobby-my-rooms.test.ts`.
- Creation preflight authorizes the new intent independently of the connection's previous rules session. Detaching from a non-active Game Context only removes its connection seat; it never publishes through that old Room's execution stamp or lease.
- Creation adopts the new Room at its durable commit callback before detaching the previous connection. Previous-room notification failures are recorded and cannot roll back or dispose the committed session; initialization cleanup depends on the commit boundary.
- Formal solo uses `createRoom(maxPlayers: 1)` with one authenticated seat and commits Step 0 before confirming creation. Active solo Rooms are absent from public discovery; original participants retain ordinary resume access. `createRoom(sourceGameContextId)` reads immutable accepted creation metadata from `game-creation-store.ts`, authorizes the completed source's sole participant and creates a fresh game without loading its old Room or Replay. The first transaction commits Room, Step 0, creation configuration and command receipt together; source and Workshop admission are rechecked there. Explicit unavailable sources return unchanged choices and typed differences. See `shared/contract/game-creation.ts` and `server/connection/__tests__/solo-room.test.ts`.
- `roomId` identifies exactly one game ([ADR 0009](../adr/0009-room-id-identifies-one-game.md)). `newGame` creates a new `GameSession` and UUID, never reusing the old ID, and moves online seats, player count, custom cards and variant flags to it in the same transaction that retires the old game. Only authoritative `gameOver` writes the Game Result Archive and deletes the recoverable snapshot, in one transaction; an archive-write failure rolls back and keeps the final state for retry. expiry, dissolution, deletion and unfinished restarts mark the Game Context `expired` and produce no result. Result scores preserve the engine's numeric values, including fractions ([persistence tests](../../server/game/persistence/__tests__/postgres-replay.test.ts)).
- All hosted games, including Workshop, hotseat and development Rooms, use PostgreSQL and mandatory recording. `RoomPersistenceCheckpoint` durably acknowledges creation, waiting state and seats. Ordinary snapshots load on demand after restart. Unloaded saves expire through `GameContextStore`; live connections, admissions and pending saves are protected. Ordinary Rooms with every player disconnected are retained 30 minutes while waiting and seven days while playing; development games never idle-expire. Live startup performs no legacy cleanup, and missing recorded data blocks recovery instead of inventing a replacement.
- Development slots `dev2`–`dev6` map to permanent game identities that survive restarts; rematch or reset assigns a fresh identity, and completed, expired or removed contexts never revive. A development account may hold several seats, and development resume needs a seat hint or a uniquely owned seat; ordinary Rooms derive the seat from authenticated ownership. A client-side `devMode` flag grants no development privilege. `room_players` stores ownership by `(room_id, player_index)`.
- Waiting-room `setPlayerColor` changes only the sender's seat. Occupied and reserved seats keep exclusive colors; choosing an empty seat's color swaps the two assignments. `GameSession.updatePlayerColors` also updates isolated Workers. The Room queue orders competing requests, and the checkpoint commits the colors with their command receipt before broadcasting. Colors lock when play starts.
- An ordinary Room stays waiting when its final seat fills. `colorConfirmationPlayerIndex` records the last arrival, survives checkpoints and recovery, and is sent in waiting events. Only that seat can issue `confirmPlayerColor`; the initial Frame and receipt commit before gameplay starts. Hotseat and development Rooms retain automatic startup. Lobby status comes from the Room, never its occupied-seat count. Coverage: `room-router.test.ts`, `room-invitations.spec.ts`.
- `room-queue.ts` serializes authorization, rules, asynchronous commit and publication per Room; moving a connection reserves both Room queues and the connection queue. Shutdown stops input, drains accepted work and closes the pool.
- **Distributed Rooms** ([ADR 0022](../adr/0022-distributed-room-recovery.md)): `RoomDirectory` assigns each Room to one application process with a PostgreSQL lease and monotonic epoch; commit and publication verify owner and expected version. `POST /api/rooms/locate` returns a `/nodes/<instanceId>/ws` route that `ingress.ts` forwards. `CommandStore` reserves each command's content fingerprint and commits its receipt with the Room transition; a repeated command returns the original receipt. `InvalidationStore` commits card / user barriers and per-instance tasks that every execution and publication checks; an operation completes only when each required instance acknowledges or loses its lease.
- **History and recovery** ([ADR 0021](../adr/0021-room-owned-history-branches-and-recovery-snapshots.md)): immutable history nodes and recovery records are Room-owned rows written in the Room transaction. Recovery restores the authoritative session, undo history and provisional checkpoints without decoding Replay payload. Query failures propagate unchanged for storage retry; only decoding and integrity failures of data that was read fail closed as `RoomHistoryCorruptionError`.
- **Snapshot ownership**: `serializeSessionSnapshot` captures the authoritative core once; `state` and `frame` share immutable values; `rehydrateState` copies before normalization. `RoomCommitter` owns the captured Frame and payload for diffing and retries.
- **History window**: viewer snapshots carry the latest 20 complete operation groups with stable record IDs, a viewer-bound branch ID, `projectionHash` anchors and an older-page cursor. `getHistory` / `historyPage` use active seat authorization and full viewer filtering; branch or projection changes return `history_branch_changed` / `history_projection_changed`. Reads never write a Room. HTTP, local and debug payloads stay complete.

Tests: `server/game/__tests__/`, `server/__tests__/session-recovery-data.test.ts`.

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
- Replay Steps have a Room-global monotonic `stepNo`, independent of `roomVersion`; simultaneous submissions serialize into consecutive Steps, automatic settlement belongs to the last triggering input, and rule results never depend on arrival order. Step 0 exists before the first interactive command. A terminal Frame archives `PlayerScoreSummary[]`.
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
├── runtime.ts           sandbox runtime
├── engine.ts            source validation, compilation, and manifest extraction
├── isolate-runner.ts    isolated-vm entry
├── executor-worker.ts   Worker Thread entry
└── client.ts            synchronous main-process to Worker Thread client
```

- The backend stores only `compiled_code + code_manifest`. A non-built-in executable Workshop card runs every `GameSession` command of its HTTP sandbox or WebSocket Room in a dedicated Worker (`CustomSessionExecutor`); one Room runs FIFO through Durable Commit, different Rooms in parallel, and a later Room or seat change on the same connection cannot alter an in-flight command's Room or Replay actor.
- The main thread keeps only a non-executing mirror of the last successful snapshot, restored through a non-settling path so it never re-probes continuations. Inside the Worker, `client.ts` calls isolated-vm synchronously, so `Atomics.wait()` never blocks the HTTP or WebSocket event loop.
- Before each command an in-memory checkpoint preserves pending state and undo history. A hook timeout or runtime warning restores it and keeps the diagnostic; a Worker crash or overall timeout rebuilds from the last snapshot.
- `built_in=1` cards use the built-in implementation without a Worker.
- Sandbox constraints have one source of truth, [`docs/CUSTOM_CARD_SANDBOX.md`](../CUSTOM_CARD_SANDBOX.md), with `prompt-sync` blocks checked by `pnpm run check:prompt-sync`.

Tests: `server/__tests__/{custom-code-executor,local-sandbox-parity}.test.ts`.

## HTTP endpoints

HTTP serves operations, tests and debugging; it is not the real-time synchronization path. Responses match `SessionResponse`, and validation endpoints never write authoritative state. Inside a WebSocket Room, development commands use `ClientCommand`.

- `GET /api/health`, `GET /api/rooms`, `GET /api/game/state`.
- `POST /api/game/new` accepts `seed?` plus the WebSocket `createRoom` setup, mapped through `server/game/game-setup-options.ts`. `POST /api/game/load`, `POST /api/game/dev/*` and `POST /api/game/new-sandbox` are debugging and Workshop sandbox paths.
- `GET /cards-manifest.json` serves card metadata to the main bundle.
- OAuth account binding: `POST /api/auth/oauth/:provider/start?intent=link`, `GET …/callback` and `POST …/complete`, with PKCE S256 and a fragment handoff that never creates a new site session.
- OAuth onboarding: `GET /api/auth/oauth/:provider/start` binds a SHA-256 browser challenge to the OAuth state and the fifteen-minute, single-use registration ticket. The callback returns the ticket in a fragment with `no-store` and `no-referrer`; `POST /api/auth/onboarding/complete` accepts the ticket only with its browser verifier. Challenge-bound tickets require their verifier even when supplied as a cookie. Unbound cookie tickets retain cookie completion, and explicit credentials never fall back to a different cookie identity. Account creation, identity binding, invite consumption and ticket consumption share one transaction. Missing/invalid credentials have separate codes from expired/consumed tickets.

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

`server/workshop.ts` and `server/workshop-pr/` provide custom-card upload, compilation, the sandbox and pull-request delivery. See [Platform design](../PLATFORM_DESIGN.md) for the full product flow.

- Sandbox settings (`sandbox_settings`, `sandbox_cards`) persist player count, decks and variant flags; `POST /api/game/new-sandbox` passes them to `createInitialState()`.
- Review and publication are two dimensions in `server/workshop-status.ts`: review `unsubmitted / in_review / approved / stale / merged` and publication `live`. A card binds one open, non-draft PR based on `main`, pinned to its head and Design Draft. Only real exact-head approvals from a reviewer with push permission approve a version; publishing re-queries GitHub and requires head, review SHA, approved SHA and pinned version to agree. Any mismatch, close, draft transition, base change or dismissal moves the card to `stale·offline`, and so does a GitHub query failure while processing a webhook or publish. A transient refresh failure right after binding keeps the `in_review` binding, clears the sync time and lets the author retry through `refresh-pr-status`.
- A PR merged into `main` graduates an approved card to read-only `merged`. A merge seen before approval is recorded (`github_pr_status='merged'`) and graduates only after an authorized exact-head approval is reconciled; a PR merged into another base becomes `stale·offline`. A live merged card keeps serving its reviewed snapshot until release, when `markBuiltInMergedCards` lets the built-in definition take over on startup.
- `customCardIds` in a real Room accept only live approved cards through their reviewed snapshot. Formal solo retains every explicit selection and rejects unavailable or changed sources with a configuration adjustment; other Rooms reject an author's own non-live card and filter other unloadable IDs. Unreviewed code runs only in the Workshop sandbox and never reaches a multiplayer `GameSession`.
- Author `unpublish` lets existing games finish; administrator takedown ends every Room embedding the card without scoring or Replay.
- Submissions use one repository-scoped GitHub App; `workshop_submissions` freezes operation identity and Draft Version before remote writes, branch publication uses expected-head CAS, uncertain PR creation is reconciled without another blind POST, and generated-file conflicts pause delivery. See the [GitHub App runbook](../operations/github-oauth-app-setup.md).
- Workshop draft errors expose a typed `code` from `shared/contract/workshop.ts`; the live-edit guard returns `live_edit_blocked` with HTTP 409.

Tests: `server/__tests__/{workshop-api,workshop-submissions}.test.ts`, `server/workshop-pr/__tests__/`.

## Database

- `server/db.ts` owns the asynchronous PostgreSQL connection through `pg`: transactions keep one connection across awaits, nested transactions use savepoints, and native migrations run under an advisory lock before startup. There is no SQLite or JSON runtime fallback.
- `scripts/import-sqlite.ts` imports a stopped schema-33 SQLite database through exact comparisons and blocks on damaged recorded games, and `data_imports` keeps a failed import behind a startup barrier; `scripts/validate-backup.ts` validates a PostgreSQL / S3 restore.
- Product tables: `game_contexts`, `game_context_participants`, `game_replays`, `game_replay_steps`, `issue_submission_connections`, `account_deletion_requests`, `github_grant_revocations`, `bug_reports`, `bug_report_attempts`, `bug_report_evidence_audit`; plus `rooms`, `room_players`, `game_results`, `game_result_players`, `oauth_states` and the Room history and recovery tables. Segments are represented by `checkpointStepNo`; there are no Segment, evidence-payload, quota or webhook-delivery tables.
- Games completed before recording are `legacy_no_replay`: they keep their result summary but have no Replay header or Frames.

## GitHub delivery, security and deletion

Bug Report delivery follows [ADR 0012](../adr/0012-github-issue-submission-identity-and-delivery.md):

- A draft freezes `roomId + stepNo + frameHash` after confirming the Reporter owns an original seat; one user keeps at most five undelivered reports. The public Issue carries a sanitized title and a body with no screenshot, log, Frame payload, other player identity or hidden information.
- The production `github-issue-client` accepts only server-configured repository and installation IDs and reconciles uncertain responses by a stable body marker, accepting only an Issue created by the configured App after the attempt and ending uniquely with that marker. The client polls only site status, never GitHub. Self-authored submissions use an encrypted GitHub App user token (AES-256-GCM with `keyId`) and require confirming that the GitHub identity stays public; Hosted Issue Identity uses an installation token. An invalid connection never switches author.
- Account deletion persists `deletion_pending`, signs out sessions and edits known Issue bodies through the installation adapter, retrying until GitHub confirms the site user ID is gone.
- Maintainer evidence reads require a reason, are audited permanently, are rate-limited and reapply the current participant tombstone projection.
- Erasure ([ADR 0010](../adr/0010-public-replay-retention-and-erasure.md)): `server/game/replay-removal.ts` appends each batch to the independent `erasure/ledger.json` in private S3 with ETag CAS before deleting payloads; startup and restore apply it idempotently, a malformed ledger blocks restoration, and resource reads and uploads consult its permanent hash deny rules. Logs never contain tokens, Frame payloads, symptom text or raw GitHub responses.

## Deployment, rollback and observability

Deployment commands and the metric catalog live in [`HOW_TO_DEPLOY.md`](../HOW_TO_DEPLOY.md).

- PostgreSQL stores platform data and the shared resource catalog; private S3 stores `card-art/`, `replay-viewers/<viewerBuildId>/`, `replay-assets/<sha256>` and `erasure/ledger.json`. `server/storage/` owns staged uploads, references, integrity checks and cleanup claims; upload intent is durable before writing, new uploads keep a 24-hour unreferenced grace period, and only one claimant deletes an object.
- Durable Room Commit requires PostgreSQL, shared resources, `REPLAY_VIEWER_BUILD_ID` and `GAME_BUILD_ID`. Room creation freezes both Build IDs and the custom-card runtime snapshot. The Viewer Build ID is the SHA-256 of its complete manifest; board art, card art and fonts come from the asset site pinned by `public-assets.ref`. Room creation fails when Build validation fails, and a waiting Room rejects game writes until Step 0 exists.
- Rollback is allowed only to a recorder-compatible build supporting every active Room `schemaVersion`. A missing Viewer or unwritable persistence degrades readiness. Online Room capacity rejects new admissions; retained offline saves do not reduce readiness.
- `operations/` owns the independently deployed monitoring Compose project and restricted accounts exporter. `deploy-operations.sh` pins only operations source and preserves game container identity; game deployments manage app/Caddy only. The exporter counts existing accounts and UTC+8/day and rolling creation windows without importing game initialization or running migrations.
- `server/observability/` owns bounded numeric metrics, collection, the administrator gateway and overview health, and never writes rule state. Metrics carry no Room, account, command, card, payload or exception identity, and a metrics failure cannot change a game. Command duration spans dispatch through local publication; projection, encoding and send are separate stages.
- A private Prometheus scraper discovers instances through bearer-authenticated ingress; the ingress owns global Room aggregates and online users. Grafana reads only aggregates behind `/ops/`, which checks the current site session and `ADMIN_USERS` on every request through a one-use handoff cookie.
- The browser sends sampled, rate-limited timing batches (command RTT, first snapshot, snapshot-to-layout) that the server treats as untrusted observations.

