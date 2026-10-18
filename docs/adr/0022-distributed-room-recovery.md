# 22. Distributed Rooms require recording and may reconnect players

- Status: Accepted
- Date: 2026-10-05

## Context

Issues #961–#976. The backend moves from one process with synchronous SQLite commits to PostgreSQL with several application processes that may fail independently. Players may briefly disconnect and reconnect when an application process fails, but no acknowledged transition, seat, pending state or undo capability may be lost. Current deployment and local testing run on one machine.

## Decision

- **Scope.** The guarantee covers application-process failure within one region: a crashed, unresponsive or disconnected process. Database failover, physical-host failover and regional recovery are outside it; when the database is unavailable, operations pause until persistence returns and commit outcomes are resolved. A 30-second recovery objective is a future target, not a claimed capability; fault-injection and capacity certification are deferred.
- **Recording is mandatory.** Every backend-hosted product Room, including ordinary, executable Workshop, hotseat and development Rooms, uses durable recording; a missing committer or failed preparation blocks the operation instead of downgrading durability. Waiting-Room creation, seats and lifecycle metadata are durably confirmed but are not gameplay Steps. Reads, reconnection and heartbeats are not transitions. Standalone HTTP and browser Workshop sandboxes run without recording or a recovery promise.
- **PostgreSQL** is the only production database for accounts, authentication, Workshop, Rooms, Replay and platform data. Room recovery records, Replay transitions, command receipts and ownership checks share one transaction.
- **Ownership and routing.** PostgreSQL-owned instance and Room ownership records use leases and monotonic epochs, checked with the expected state in every authoritative write; a process that loses ownership stops accepting, retrying and publishing. Epochs and transport generations are not undoable game state. Same-origin discovery (`POST /api/rooms/locate`) plus an instance-routed WebSocket path sit behind the existing public origin; discovery is not authorization: a creation allocation only reserves a destination, the authenticated WebSocket command creates the Room, and the application verifies ownership and seat identity independently of the supplied route. Creation allocations and receipts prevent duplicate creation after a lost reply. One per-Room queue covers validation, rules, commit and publication.
- **Command receipts.** Commands carry authenticated actor scope, a stable identity and a canonical fingerprint; a duplicate identity with different content is an error. Receipts are resolved before input freshness. A committed command returns its previous result; an uncommitted one is retried with the same identity only while its original input context is still valid, otherwise the client refreshes and the player chooses again. Room creation and `newGame` carry stable request identities too; the transport `requestId` is not that identity. Ordinary commands carry an expected committed version; simultaneous draft and parent inputs share an input-window identity. Undo never revives old identities, receipts are private, and expired scopes cannot become new operations.
- **Administrative invalidation** persists an access and execution barrier and reports a pending operation until each required instance acknowledges or loses its lease; a notification alone is not success, and direct object-store access never bypasses public-route takedowns.
- **Self-contained single host.** Local, test and production run self-hosted PostgreSQL and an S3-compatible store with persistent data; `./restart-local.sh` prepares them, initializes the schema and starts the topology. Tests use isolated databases and namespaces. Production runs two application processes in one container on the current host behind the routing process. Moving to external services or hosts later requires explicit migration and real fault tests.
- **Releases** use a maintenance window: stop new commands, resolve in-flight submissions, update all processes as one generation, validate target-build recovery, then resume. Historical `gameBuildId` is provenance, not a requirement to keep the original backend image.
- **Pre-release cleanup** discarded only proven unrecorded active games and removed the non-recording runtime paths and rollout flags. Accounts, Workshop data, recorded games, completed results and Replays, Viewer Builds, resources and the erasure ledger were migrated with exact encodings.

## Consequences

- ADR 0014's durable-publish, frozen-retry and per-viewer privacy contracts stay; its single-process, SQLite and recording opt-out decisions are superseded.
- Room-owned recovery (ADR 0011, ADR 0021) remains mandatory; reconnection does not permit dropping undo or continuation state.
- Single-host functional checks do not certify failover or physical-host availability.

## Alternatives considered

- Keeping SQLite beside PostgreSQL: two production paths.
- Preserving WebSocket connections across process failure: unnecessary when players may reconnect.
- Three application nodes with 60 Rooms: not accepted for the current single host.
- Continuous dual writes during migration: a controlled export and import suffices.
