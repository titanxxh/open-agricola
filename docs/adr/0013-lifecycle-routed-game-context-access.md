# 13. Game Context access is routed by lifecycle and viewer authority

- Status: Accepted
- Date: 2026-07-27

## Context

With one game per `roomId` (ADR 0009), public Replays (ADR 0010) and delta archives (ADR 0011), a permanent Game Context Link must route the same `roomId` safely to active recovery, completed playback, an expiry notice or a takedown placeholder, and give Bug Report Anchors a defined result whether the game continues, expires, completes or is damaged. `joinRoom` both resumed and filled empty seats, a global login gate blocked public Replays, and expired Rooms were physically deleted.

## Decision

**Permanent link and lifecycle.**

- The canonical link is `${PUBLIC_APP_ORIGIN}?room=<roomId>`, optionally with a paired `step=<stepNo>&frame=<sha256>` and a completed-game `perspective=pN|open`. It never carries transport, seat, site `userId` or credentials.
- Every created Room keeps a minimal Game Context Record forever. Lifecycles are `active` (phases `waiting`, `playing`), `completed`, `expired` and `removed`; only never-created IDs are `unknown_context`.
- A waiting Room is retained 30 minutes and a playing Room 7 days after everyone disconnects; any reconnection resets the timer. Expiry, dissolution, deletion and unfinished rematches delete only the recoverable snapshot and mark the context `expired`. Removed Replay payloads resolve as `removed` with a Tombstone (ADR 0010). Old Rooms never redirect to a rematch.

**HTTP and WebSocket contract.**

- The frontend first calls `GET /api/v1/game-contexts/:roomId` and routes by the discriminated descriptor; this resolver is the single entry for permanent links.
- Waiting-room links also allow authenticated players to join an available seat through WebSocket `joinRoom` with `intent: "join"`; the server still enforces seat ownership. The `context` query key remains an alias for participant-only recovery.
- Participant-only recovery through the `context` alias reuses WebSocket `joinRoom` with `intent: "resume"`. Room links use `intent: "join"` and restore the account's existing seat when present. The client omits seat hints for ordinary Rooms, and the server binds the persisted site `userId → playerIndex`; an in-progress game does not expose another player's seat or hidden information. A new connection for a seat replaces the old one, which receives `seat_replaced`.
- Completed games are read over HTTP: manifest (or `legacy_no_replay` status) and Segments from a checkpoint. The outer app selects the Viewer Build from the manifest and runs it in a credentialless iframe.
- An exact retained Anchor of an active or expired unfinished game is read through the evidence endpoint; seated players get only their own masked read-only Frame, with no enumeration.
- Maintainers inspect evidence only from a submitted Bug Report: the reporter's seat by default, all-open only with a non-empty reason, always audited permanently, never beyond the Anchor.

**Authentication and visibility.**

- Active resolution and recovery require login (`401 login_required` with `returnTo`; `403 not_participant` without a seat). The server's seat binding is the only authority; `perspective` grants nothing in active games.
- `completed`, `expired` and `removed` resolve before the global login gate. A completed archive's rule state is public; seat perspectives are presentation masks in the Viewer, not a security boundary.
- Active players continue from the current state and see Anchors only in a read-only drawer; they never play on from a historical Anchor or view another seat or all-open.
- Opening a completed game without a perspective requires choosing a seat or all-open before any Frame is shown; Bug Issue links default to the reporter's seat, never `open`.

**Reported evidence and races.**

- A Bug Report does not extend Active Game Recovery. For an unfinished game, the minimal Segment reconstructing the Anchor is retained 30 days and shared between reports; after that only Anchor metadata remains, and completion replaces it with the permanent archive.
- If the lifecycle changes between resolution and joining, the server returns `context_changed` and the client re-resolves once; a second change is shown as a conflict, never retried in a loop.

**Completeness and integrity.**

- Rooms created after launch start at a real Step 0 (`missingPrefix=false`). Migration backfilled existing Rooms as active contexts, whose archive Step 0 was taken from the checkpoint at recovery with `missingPrefix=true`, and results as completed (completed wins on conflict); pre-launch results are `legacy_no_replay` with no Replay header.
- `step` and the full Frame Hash must match exactly (`anchor_mismatch` otherwise). Damaged Segments show unavailable intervals and playback resumes at the next complete checkpoint; a missing Viewer still shows the result summary. `missingPrefix`, damaged intervals and `legacy_no_replay` are displayable 200 states, not transport errors.

**Descriptors, errors and caching.**

- `active` descriptors return only `roomId`, lifecycle, phase, own `playerIndex`, current `stepNo` and optional `expiresAt` to an authorized seat. `completed` exposes Replay Participant names, seats, scores and variants (never `userId`) plus `replayStatus`; `expired` exposes only `roomId` and lifecycle; `removed` may add the coarse reason. Expiry causes are never distinguished publicly, and there is no list or search of expired contexts.
- Errors are `{ ok: false, code, lifecycle?, message }`: 400 `invalid_context_link`, 401 `login_required`, 403 `not_participant`, 404 `unknown_context`, 409 `anchor_mismatch` / `context_changed`, 410 `context_expired` / `context_removed`, 429 `rate_limited`, 503 `replay_segment_unavailable` / `viewer_unavailable`. Known `expired` / `removed` contexts resolve with 200; only payload requests on them return 410.
- Active descriptors, evidence and forensics use `Cache-Control: no-store`; public descriptors, manifests and Segments use `no-cache` with ETags; only content-addressed Viewer Builds are `immutable`. Access logs never contain hidden state, payloads or credentials.

## Consequences

- Game Context Records are separate from deletable snapshots, Replay payloads and identities; ADR 0009's `discard` no longer deletes the permanent identity.
- The client resolves the context before deciding on login; active recovery stays on the WebSocket path.
- Unfinished-game evidence keeps hidden state up to 30 days, so it is seat-filtered, Anchor-bound and audited.

## Alternatives considered

- Connecting permanent links straight to WebSocket: cannot express non-active lifecycles.
- Letting `joinRoom` both resume and fill seats: turns links into invitations.
- Requiring login for completed games: the archive is public by decision.
- Extending recovery for a report: evidence needs only the Anchor.
- Per-seat archives: duplicate public state.
- Returning 404 after expiry or removal: confuses known and unknown IDs.
- Snapping a mismatched Anchor to the nearest Step: shows the wrong scene.
