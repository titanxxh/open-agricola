# Replay Room Capacity

## Result

The 2 CPU / 2 GiB launch limit is 30 ordinary in-memory Rooms. The production Durable Room Commit path passes all thresholds at 30 Rooms and exceeds the action-latency threshold at 35 Rooms.

## Environment

- Source: working tree based on `2d2a5ef1`
- Node: 22.22.2
- CPU: Intel Xeon Platinum 8336C
- Cgroup: 2 CPU / 2 GiB
- SQLite: 3.53.0, WAL, `synchronous=NORMAL`, `wal_autocheckpoint=1000`
- Long-run state: 141,100 bytes from a 176-command seed-563 game, with 46 commands remaining
- Late-state check: 170,267 bytes from the same game, with 16 commands remaining
- Two WebSocket seats per Room; in-process socket sink
- Thresholds: action-to-broadcast p99 <= 250ms, event-loop p99 <= 100ms, RSS <= 1.8 GiB

Each 25/30/35 capacity level ran for 15 seconds of warmup and 60 seconds of measurement in a fresh process at 0.45125 accepted commands per Room per second. The late-state check used 1 second of warmup and 5 seconds of measurement.

The probe uses the production migration, `SqliteRoomPersistence`, `RoomCommitter`, Replay codec, atomic Room snapshot + Replay Step transaction, and committed broadcast path.

## Capacity

| Rooms | Actions | Action p50 | Action p95 | Action p99 | Event-loop p99 | Burst | CPU | Peak RSS | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 25 | 702 | 57.1ms | 80.9ms | 98.9ms | 89.0ms | 1635.0ms | 78% | 254.7 MiB | PASS |
| 30 | 843 | 57.6ms | 100.7ms | 246.3ms | 86.8ms | 1928.8ms | 88% | 267.7 MiB | PASS |
| 35 | 981 | 110.5ms | 369.0ms | 548.1ms | 87.1ms | 2209.7ms | 100% | 288.1 MiB | FAIL: action p99 |

## Durable Replay commits

Every accepted command produced exactly one Replay Step.

| Rooms | Writes | Checkpoints | Deltas | Avg. gzip payload | Commit p50 | Commit p95 | Commit p99 | Commit max |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 25 | 702 | 50 | 652 | 5.56 KiB | 15.869ms | 23.766ms | 35.300ms | 46.702ms |
| 30 | 843 | 60 | 783 | 5.56 KiB | 15.627ms | 24.131ms | 31.062ms | 41.554ms |
| 35 | 981 | 70 | 911 | 5.57 KiB | 15.420ms | 23.914ms | 31.090ms | 53.374ms |

## Late-state check

At 30 Rooms and 170,267-byte states, 98 accepted commands passed with action p99 81.3ms, event-loop p99 79.6ms, 237.9 MiB peak RSS, and Durable Room Commit p99 30.833ms.

## Decision

Keep the hard limit at 30 ordinary `waiting + playing` Rooms per 2 CPU / 2 GiB instance. Fixed development Rooms are excluded. Raise the limit only after the same production-path probe passes at the new level.
