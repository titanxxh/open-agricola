# 22. Distributed Rooms require recording and may reconnect players

- Status: Implemented on the integration branch for GitHub issues #961–#976; production cutover and fault acceptance are separate
- Date: 2026-10-05

## Confirmed constraints

Players may briefly disconnect and reconnect when a backend node fails. The distributed backend therefore does not need to preserve the original WebSocket connection across node failure. Active Game Recovery continues the same Game Context using the player's existing seat identity.

The first release handles application-instance failure within one region, including a crashed process, an unresponsive instance or an instance losing its network connection. An application node means one backend process/container with its own identity; it does not necessarily mean a separate physical machine. Current deployment and local testing both run on one machine. Automatic database failover, physical-host failover and regional disaster recovery are outside the current single-host guarantee. When the authoritative database is unavailable, affected operations pause and resume only after persistence is available and their commit outcomes are resolved.

Fault-injection acceptance is deferred at the user's request. The previously discussed **at most 30 seconds** recovery objective is a future target, not a gate or a claimed capability for this delivery. A later fault campaign must measure from the injected application-instance failure until affected players receive a valid authoritative snapshot and can resume permitted interaction, including detection, ownership transfer, restoration and reconnection. Deferring that campaign does not permit dropping acknowledged transitions, seat identity, pending state or undo capabilities.

The earlier N−1 reserve policy remains the intended policy when certified failover capacity is enabled later. It is not a reason to reject every new Room in a one-instance local-development setup, which has no surviving peer. This delivery retains bounded ordinary-Room and executable-worker admission, but introduces no new capacity certification or increased Room-limit claim. The previously proposed multi-node capacity/performance gates are deferred together with fault acceptance.

Remove the non-recording gameplay path. Backend-hosted product Rooms must use durable recording, including ordinary, executable Workshop and local hotseat Rooms. A disabled rollout flag, missing committer or unsupported command must not silently select broadcast-before-persist behavior. Failure to prepare or commit recording must block the affected operation rather than downgrade its durability.

This decision covers authoritative gameplay transitions, including private-cursor-only changes and durable rejections. Waiting-Room creation, seat ownership and other recoverable lifecycle metadata also require durable confirmation, but are not artificial gameplay Replay Steps. Read-only state/history requests, reconnection and heartbeats do not become game transitions merely because recording is mandatory. Fixed development Rooms exercise the same recording path; ordinary Session tests are not hosted product Rooms.

Standalone HTTP and browser Workshop sandboxes remain available without formal Room recording or a cross-node recovery promise. This exception concerns temporary test-game execution, not the durability or privacy of saved Workshop drafts and card versions. It does not permit formal Rooms to opt out of recording.

## Confirmed implementation shape

PostgreSQL becomes the sole production database for accounts, authentication, Workshop, Rooms, Replay and other persistent platform data. Do not retain a second SQLite production path. Pure unit tests may still use appropriate in-memory substitutes; transaction and concurrency integration tests run against PostgreSQL. Room recovery records, Replay transitions, command receipts and ownership/version checks share one transaction. Existing lifecycle, erasure and atomic identity operations must retain their behavior when SQLite-specific SQL and triggers are replaced.

Keep the existing public backend origin and OAuth callback URLs. Add Room/node discovery before connecting: creation first selects a node, and joining or reconnecting resolves the Room's current owner. The owning application node continues to hold both its WebSocket connections and its GameSession; the public ingress routes those connections. Discovery is not seat authorization or a second gameplay-writing channel. Standalone HTTP sandbox requests still need node affinity even though sandbox failover is not promised.

Automatically resolve commands whose responses were lost. Look up the durable receipt by stable `commandId` before evaluating current interaction validity. Return the previous result for a committed command; retry an uncommitted command with the same identity only if its original input context remains valid. Otherwise refresh the state and ask the player to choose again. Room creation and `newGame` also need stable request identity and discoverable outcomes so a lost response cannot create another game. Existing transport `requestId` is not that identity.

Planned releases may use a maintenance window and reconnect players. Stop admitting new commands, resolve in-flight submissions, update application nodes as one deployment generation, and resume only after target-build recovery validation. The first release does not require mixed application versions to host Rooms concurrently. Historical `gameBuildId` remains provenance, not a permanent requirement to retain the original backend image. The application-failure 30-second target is distinct from a planned migration/release window; the latter must be sized by rehearsal.

## Single-host-first delivery

The current release and local development/test setup must be self-contained on one machine. No newly provisioned external database, object-storage account, cloud credentials or additional host is a prerequisite for running or validating this work. Newly introduced infrastructure must have a locally hosted implementation with persistent local data. External service endpoints are a later deployment option.

PostgreSQL remains the accepted database in local, test and production execution. A locally hosted PostgreSQL process/container is not a separate database adapter. Normal local multi-instance functional checks use independent backend processes/containers, the real shared database and the real public routing path without injecting failures. Pure unit tests may remain independent of infrastructure; persistence claims require the real infrastructure path. No failover acceptance is performed in this delivery.

Keep `./restart-local.sh` as the unified developer entry point. Its implementation must prepare or reuse the required local dependencies, run schema initialization once, make mandatory recording resources ready, and start the selected backend topology plus the frontend. Dependency data must survive application restarts. Tests must use isolated databases/storage namespaces and must not clear the developer's existing data or borrow external production services.

Moving later to external PostgreSQL or object storage requires configuration and credential changes plus explicit data migration and validation. Moving applications to separate hosts additionally requires reachable private endpoints, ingress configuration, failure-domain-aware capacity and real multi-host fault tests. Same-host container tests do not prove whole-machine availability.

The preceding three-application-node / 60-Room recommendation was not accepted and is not a delivery requirement. Daily local development defaults to one application instance, with an explicit instance-count option for normal multi-instance functional checks. The user's production follow-up requires two independent application processes on the current single host to exercise the distributed routing in normal use. Production Compose therefore fixes two application processes inside one app container, regardless of the local-development instance count in `.env`; the public routing process supervises them. This does not expand the deferred fault or capacity acceptance scope. Use a locally hosted S3-compatible service with persistent data so current local storage and later external object storage share the same application protocol. The launcher initializes local buckets and untracked local credentials; it does not require a cloud account. Exact container images and versions are implementation choices subject to ARM64 and storage-contract validation.

## Pre-release cleanup and migration

The user confirms that the application has not formally launched and explicitly permits deleting existing unrecorded active games. Discard those Rooms through the existing Game Context lifecycle, remove the non-recording runtime paths and rollout flags, and do not build a compatibility conversion or synthesize missing-prefix Replay history for them. Absence of a Replay header alone is not proof that a Room opted out: waiting Rooms and a damaged recorded Room must be classified from their persisted recording intent and associated records.

This cleanup is scoped to unrecorded active games. Preserve accounts, Workshop drafts/card versions, recorded active games, completed results/Replay, immutable Viewer Builds and retained resources while migrating them to PostgreSQL/local object storage. Historical completed games with only a result summary are read-only product records, not a non-recording gameplay path; retaining them does not reintroduce that path. Preserve exact encoded recovery text, Replay bytes/hashes, object identities, OAuth identities and the erasure ledger. An ordinary controlled export/import is sufficient; do not add continuous dual writes or concurrent SQLite/PostgreSQL production modes.

Existing recorded data must pass target-build restoration/integrity checks before the cutover resumes writes. A failed import is not permission to reset unrelated data. Planned maintenance is already allowed; migration/restart time is not subject to the deferred 30-second fault target.

## Accepted execution details

Use one per-Room queue for validation, rule execution, durable commit and publication. Use PostgreSQL-owned instance/Room ownership records with leases and monotonically increasing epochs; every authoritative write checks ownership and expected state in the same transaction. Losing ownership stops the instance from accepting commands, retrying frozen writes or publishing as that Room's owner. Epochs and transport generations are not undoable game state. Implement the ownership safeguards now even though fault-injection acceptance is deferred.

Expose same-origin discovery plus an instance-routed WebSocket path behind the existing public entry point. A creation allocation only selects/reserves a destination; the authenticated WS command creates the authoritative Room. Existing Room joins resolve the current owner. Allocation and creation receipts prevent duplicate creation after a lost reply. The application verifies ownership and seat identity independently of the supplied route.

Persist command receipts with authenticated actor scope and a canonical command fingerprint. A duplicate identity with different content is an error. Resolve receipts before checking input freshness; otherwise a successful final draft/parent submission could be mistaken for stale input after it advances the phase. Ordinary commands carry an expected committed version; simultaneous draft and parent submissions need stable per-input-window identity so another player's valid submission does not invalidate the remaining players. Undo/rebranch must not revive old input identities. Receipts are private operational records, not public Replay metadata, and expired request scopes cannot silently become new operations after receipt cleanup.

Administrative invalidation must persist an access/execution barrier before reporting completion. If card takedown must wait for other instances to retire Rooms or HTTP sandboxes, return an explicit pending operation and show it as processing until completion; a notification alone is not success. Preserve the existing account-deletion pending contract and public erasure semantics. Use durable task claims and shared upload/reference state for background work and object cleanup. Direct object-store access must not bypass public-route takedowns.

## Implementation sequence and current acceptance

1. Add self-hosted infrastructure/bootstrap and a PostgreSQL migration/import path; keep local ports, worktree data anchoring and isolated test namespaces usable through `restart-local.sh`.
2. Migrate platform persistence and atomic operations to PostgreSQL; preserve exact recovery/Replay encoding and identity/deletion semantics.
3. Remove unrecorded gameplay and make recording prerequisites mandatory; separate durable waiting/lifecycle metadata from gameplay Replay Steps.
4. Add Room serialization, ownership, discovery/routing, stable command receipts and reconnect coordination using the same path with one or multiple instances.
5. Move resources to the S3 protocol and coordinate administrative/background operations across instances; finish the deployment/configuration and developer entry points.
6. Restart through the project entry point, verify real single-host behavior, run relevant PostgreSQL integration/Session tests, then the fast suite, lint and build/type checks appropriate to the change. Synchronize architecture and deployment documentation and existing Chinese mirrors with the implemented behavior.

Real functional verification covers account access, creation/join/resume, recording, read-only Replay/history, ordinary undo and pending continuation, executable Workshop Rooms, hotseat, retained standalone sandboxes, art/Viewer delivery, and normal routing across two local instances. Use explicit two-player test hands and test-owned data. Run the application's restart/restore behavior normally; do not run process kills, process suspension, network partitions, recovery-time benchmarks or capacity certification in this delivery. Passing these checks demonstrates the implemented single-host functionality, not certified failover or physical-host high availability.

## Existing contracts and scope conflict

[ADR-0014](0014-durable-room-commit-is-the-publish-seam.md) chose one process, synchronous SQLite commits and no Room sharding. This implementation supersedes those process and storage decisions and its first-rollout recording opt-out. Its durable-publish, frozen-retry and per-viewer privacy contracts remain in force.

[ADR-0011](0011-bounded-authoritative-state-delta-replays.md) and [ADR-0021](0021-room-owned-history-branches-and-recovery-snapshots.md) require Room-owned active recovery, including ordinary undo, private continuation state and the commit baseline, without decoding historical Replay payload. Reconnection is not permission to discard those capabilities.

The previous conditional durable-publishing path, `REPLAY_NEW_ROOMS_ENABLED`, optional-committer fallbacks and legacy non-recording custom-card restoration have been removed. PostgreSQL Room commits and command receipts now precede publication. Transport `requestId` remains response correlation; durable client-command identity and deduplication are separate persisted contracts. Existing historical result-only games remain readable, and the stopped-app importer discards only proven unrecorded active games.

## Design review state

The user accepted the scope and execution details above, then approved a 16-ticket breakdown after reviewing main at `d03a54e4` (including PR #960). The tickets are [#961](https://github.com/titanxxh/open-agricola/issues/961)–[#976](https://github.com/titanxxh/open-agricola/issues/976); the implementation was subsequently rebased onto `54c2cb8a`. Completed #941 optimizations are inherited constraints, not new implementation work. Native PostgreSQL/S3 tests, normal one- and two-instance checks, browser reconnection, recorded workload Frame equivalence, and isolated backup restoration validate the integration branch. Standards and specification review found publication-waiter cleanup and completed-game rematch defects; both have regression coverage and were corrected before submission. These results do not perform or certify a production migration. Actual external-service adoption, fault/capacity certification and physical multi-host rollout remain future work.
