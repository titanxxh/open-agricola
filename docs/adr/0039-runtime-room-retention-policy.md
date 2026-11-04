# 39. Runtime room retention freezes each offline deadline

- Status: Accepted
- Date: 2026-11-04

## Context

An invited waiting Room expired after everyone disconnected for 30 minutes. The owner requested a three-day default and administrator configuration through the maintenance interface. Existing Room deadlines are outside this change's migration scope. Room retention and cached Session residency previously shared the same timeout, so extending retention would also extend memory and custom Worker residency.

## Decision

- A typed PostgreSQL singleton stores waiting and playing retention, defaulting to 3 and 7 days. Values are integer days from 1 to 90. `RoomRetentionStore` owns version-checked updates and transactionally records an audit entry. Each new offline cycle reads the committed policy, without a process-local policy cache.
- The application's Operations page edits this policy through an authenticated administrator API. Existing administrator and Origin checks apply. Stale revisions produce a conflict. Grafana and the independent monitoring exporter keep their read-only permissions.
- `GameContextStore` owns the absolute deadline in `game_contexts.expires_at`. The first confirmed offline event initializes an unset deadline. Repeated events, policy changes and loading a Room preserve that deadline. Successful resume clears it, so the next offline cycle uses the latest policy. Existing deadlines are neither migrated nor recalculated.
- Loaded cleanup, cold-save cleanup and lifecycle reads use the stored deadline. Current retention values and process-local activity timestamps never override a saved deadline. Online connections, active admissions and pending durable saves remain protected. Development Rooms keep their idle-expiry exemption.
- In-memory Session residency is separate. After 30 minutes idle, an unconnected, persisted and unblocked Room can unload its Session, custom Worker, recorder head and history caches. The Room, seats, invitations, history, recovery cursor, ownership and resource references remain durable and recoverable.
- Pins cover accepted commands from before lazy loading through completion, including disconnect work. Unload runs in the existing Room queue and rechecks pins, loading, identity, connections and blocked state after asynchronous validation. Its final cache removal is synchronous. Cache unload never marks a checkpoint inactive or releases preparation references.

## Consequences

Changing policy does not rescue an already expired Room or extend its current offline deadline. The administrator UI states this scope. Repeated loading cannot give an abandoned save a fresh retention window. Offline retained games do not consume online admission capacity merely because their data remains stored.

Authentication, OAuth, Bug Report, shared-object cleanup, backup and monitoring retention are independent policies.

## Entry points and verification

The HTTP contract lives in `shared/contract/room-retention.ts`. Policy storage and expiry live in `server/game/room-retention-store.ts` and `game-context-store.ts`. `RoomAuthority` coordinates unload and recovery; `RoomRetentionSettings` owns the administrator form.

Tests cover PostgreSQL policy updates and audit rollback, HTTP authorization and conflicts, frozen deadlines, cache unload and recovery, concurrent command pins, and the administrator form in English and Chinese at desktop and mobile widths.
