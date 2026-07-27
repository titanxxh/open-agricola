# Replay Room Capacity

## Result

The 2 CPU / 2 GiB launch limit is 30 ordinary in-memory Rooms. A deterministic played-session workload passes all thresholds at 30 Rooms and fails the action-latency threshold at 35 Rooms.

## Environment

- Probe source: `scripts/bench/room-capacity.ts` in this commit
- Node: 22.22.2
- CPU: Intel Xeon Platinum 8336C
- Cgroup: 2 CPU / 2 GiB
- SQLite: 3.53.0, WAL, `synchronous=NORMAL`, `wal_autocheckpoint=1000`
- Long-run state: 141,050 bytes from a 176-command seed-563 game, with 46 real commands remaining
- Late-state check: 170,217 bytes from the same game, with 16 real commands remaining
- Two WebSocket seats per Room; in-process socket sink
- Thresholds: action-to-broadcast p99 <= 250ms, event-loop p99 <= 100ms, RSS <= 1.8 GiB

Each capacity level ran in a fresh process so every Room followed the same unbroken game trajectory:

```bash
docker run --rm --cpus=2 --memory=2g --user 1001:1001 \
  --env ROOM_CAPACITY_COMMIT=<commit> \
  --volume <node-22.22.2>:/opt/node22:ro \
  --volume <checkout>:/workspace-root \
  --workdir /workspace-root/.worktree/end-to-end-architecture \
  --entrypoint /opt/node22/bin/node \
  vibe-trading:local \
  --import tsx scripts/bench/room-capacity.ts \
  --levels <25-or-30-or-35-or-40> \
  --warmup-seconds 15 \
  --duration-seconds 60 \
  --action-rate 0.45125 \
  --state-bytes 183603 \
  --replay-archive \
  --label replay
```

The late-state check used the same container with:

```bash
--levels 30 \
--warmup-seconds 1 \
--duration-seconds 5 \
--action-rate 0.45125 \
--state-bytes 170217 \
--replay-archive \
--label replay
```

## Workload correction

The probe now builds immutable snapshots from accepted `GameSession` commands and measures only accepted `takeAction`, `resolveChoice`, and `commitSelection` commands. It does not pad logs, mutate `rngTick`, or count unchanged frames.

The first real-command run exposed repeated full placement scans in `getActionAvailability` and unnecessary state clones for cost previews with no matching `computeCosts` handler. The production query path now performs one placement scan and retains clone isolation only when a matching handler exists. Regression tests cover both behaviors.

## Capacity

`Actions` includes the 60-second steady run and one synchronized command per Room. Each Replay write count equals its accepted command count.

| Rooms | Actions | Action p50 | Action p95 | Action p99 | Event-loop p99 | Burst | CPU | Peak RSS | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 25 | 702 | 50.9ms | 72.4ms | 85.6ms | 79.0ms | 1467.2ms | 69.8% | 240.9 MiB | PASS |
| 30 | 843 | 51.9ms | 76.3ms | 88.5ms | 77.0ms | 1772.8ms | 83.6% | 268.5 MiB | PASS |
| 35 | 983 | 65.8ms | 223.1ms | 371.6ms | 84.8ms | 2038.4ms | 96.1% | 289.9 MiB | FAIL: action p99 |
| 40 | 1116 | 233.4ms | 815.9ms | 911.7ms | 90.4ms | 2455.9ms | 105.1% | 294.2 MiB | FAIL: action p99 |

The 30-Room late-state check executed 98 accepted commands and 98 Replay writes. It passed with action p99 81.1ms, event-loop p99 67.3ms, CPU 83.8%, and RSS 241.6 MiB.

## Replay writes

| Rooms | Writes | Checkpoints | Deltas | Avg. gzip payload | Archive p99 | SQLite tx p99 | SQLite tx max | SQLite tx >= 100ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 25 | 702 | 50 | 652 | 5.51 KiB | 29.596ms | 18.490ms | 20.278ms | 0 |
| 30 | 843 | 60 | 783 | 5.51 KiB | 26.998ms | 15.375ms | 28.828ms | 0 |
| 35 | 983 | 70 | 913 | 5.51 KiB | 28.100ms | 16.287ms | 21.732ms | 0 |
| 40 | 1116 | 80 | 1036 | 5.54 KiB | 26.895ms | 15.557ms | 17.486ms | 0 |

No SQLite transaction reached 100ms. The binding limit is synchronous main-thread throughput, not RSS or WAL checkpoint stalls.

## Decision

- Admit at most 30 ordinary `waiting + playing` Rooms per 2 CPU / 2 GiB instance.
- Fixed dev Rooms do not count.
- At the limit, reject only new Room creation; recovery and a `newGame` that does not increase the count remain available.
- Raising the limit requires the same real-command probe; the old 400- and 100-Room synthetic results are not capacity evidence.
