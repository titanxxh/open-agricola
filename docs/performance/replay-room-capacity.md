# Replay Room Capacity

## Result

选定的同步 Replay 写入路径不能保住 2 CPU / 2 GiB 上的 400 个双人活动房间门槛。六个代表性状态与 Replay Step 到达率组合全部超过 steady action p99 <= 250ms 的门槛；失败由单线程 action-to-broadcast 队列饱和导致，不是内存、event loop 或 WAL 自动 checkpoint 尾停导致。

## Environment

- Base commit: `b2e6a16fac8a3f0d58e37a3260908805386f4d50`
- Probe SHA-256: `bb91ef71bebb669e43f11506f13086c4ee4790afecaaef2757e487cc300379a0`
- Node: `v22.22.2`
- CPU: Intel Xeon Platinum 8336C
- Cgroup: 2 CPU / 2 GiB
- SQLite: `3.53.0`
- SQLite mode: WAL, `synchronous=NORMAL`, `wal_autocheckpoint=1000`
- Rooms: 400 active two-player Rooms, two open WebSocket seats per Room
- Warmup: 15 seconds
- Measurement: 60 seconds
- Burst: one synchronized Replay Step per Room after steady measurement
- Thresholds: action p99 <= 250ms, event-loop p99 <= 100ms, RSS <= 1.8 GiB

The exact probe source was the base commit plus the two files changed by this capacity task. The test file SHA-256 was `cd3af13d325ea71732bb3d129882194c8663dd4ffcc05eccd4fd9e94112c7598`.

## Candidate path

`scripts/bench/room-capacity.ts --replay-archive` runs the selected ADR-0011 storage shape before each broadcast:

1. Serialize the complete authoritative Room state.
2. Build a deterministic RFC 6902 `add` / `remove` / `replace` delta from the previous Replay Frame.
3. Save a complete checkpoint every 16 Steps, or earlier when the uncompressed delta is not smaller than the complete Frame.
4. Gzip each checkpoint or delta independently.
5. Hash the recursively key-sorted complete Frame with SHA-256.
6. Update the Room snapshot and insert the Replay Step in one SQLite transaction.
7. Only after the transaction succeeds, build and send the two viewer envelopes.

The 400 Rooms are seeded across all 16 Segment phases before warmup. The six measured runs produced 1,404 checkpoints and 21,008 deltas, so checkpoints were 6.26% of writes.

The command template was:

```bash
docker run --rm --cpus=2 --memory=2g --user 1001:1001 \
  --volume <node-22.22.2>:/opt/node22:ro \
  --volume <checkout>:/workspace \
  --workdir /workspace \
  --entrypoint /opt/node22/bin/node \
  vibe-trading:local \
  --import tsx scripts/bench/room-capacity.ts \
  --levels 400 \
  --warmup-seconds 15 \
  --duration-seconds 60 \
  --action-rate <0.2-or-0.45125> \
  --state-bytes <100690-or-176527-or-183603> \
  --replay-archive \
  --label replay \
  --report <report-path>
```

At 400 Rooms, `--action-rate 0.2` requests 80 Replay Steps/s. `--action-rate 0.45125` requests 180.5 Replay Steps/s, the earlier representative game’s `2.256 Step/placement` interpretation.

## Capacity results

`Actions` includes the steady actions completed within 60 seconds plus the final 400-Room burst. CPU is process CPU relative to one core; values around 100% show the main action path saturated one core.

| State | Requested Steps/s | Actions | Action p50 | Action p95 | Action p99 | Event-loop p99 | CPU | Peak RSS | DB | WAL | DB growth | WAL growth | Result |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 98.7 KiB | 80.0 | 4,516 | 4,489.8ms | 8,159.5ms | 8,505.8ms | 29.1ms | 100% | 441.4 MiB | 47.1 MiB | 4.1 MiB | 3.1 MiB | 0.0 MiB | FAIL |
| 172.7 KiB | 80.0 | 3,501 | 10,742.7ms | 20,233.6ms | 21,065.7ms | 42.7ms | 101% | 555.7 MiB | 75.4 MiB | 4.1 MiB | 2.4 MiB | 0.0 MiB | FAIL |
| 179.4 KiB | 80.0 | 3,413 | 11,303.4ms | 21,206.5ms | 22,126.2ms | 41.8ms | 100% | 563.2 MiB | 78.3 MiB | 4.1 MiB | 2.7 MiB | 0.0 MiB | FAIL |
| 98.7 KiB | 180.5 | 4,237 | 19,485.9ms | 36,917.7ms | 38,389.6ms | 34.6ms | 102% | 439.6 MiB | 46.9 MiB | 4.0 MiB | 2.9 MiB | 0.0 MiB | FAIL |
| 172.7 KiB | 180.5 | 3,364 | 21,801.6ms | 41,482.7ms | 43,193.8ms | 45.8ms | 101% | 556.1 MiB | 75.5 MiB | 4.1 MiB | 2.6 MiB | 0.0 MiB | FAIL |
| 179.4 KiB | 180.5 | 3,381 | 21,754.1ms | 41,326.3ms | 43,073.8ms | 42.0ms | 101% | 584.1 MiB | 78.2 MiB | 4.1 MiB | 2.6 MiB | 0.0 MiB | FAIL |

## Replay write costs

| State | Requested Steps/s | Writes | Checkpoints | Deltas | Avg gzip payload | Archive p50 | Archive p95 | Archive p99 | Archive max | SQLite tx p99 | SQLite tx max | SQLite tx >= 100ms |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 98.7 KiB | 80.0 | 4,516 | 284 | 4,232 | 0.59 KiB | 2.145ms | 3.133ms | 3.757ms | 33.135ms | 0.995ms | 17.345ms | 0 |
| 172.7 KiB | 80.0 | 3,501 | 219 | 3,282 | 0.64 KiB | 3.222ms | 4.594ms | 5.810ms | 40.030ms | 1.116ms | 18.001ms | 0 |
| 179.4 KiB | 80.0 | 3,413 | 214 | 3,199 | 0.65 KiB | 3.321ms | 4.772ms | 6.402ms | 45.400ms | 1.191ms | 19.111ms | 0 |
| 98.7 KiB | 180.5 | 4,237 | 266 | 3,971 | 0.59 KiB | 2.336ms | 3.601ms | 4.180ms | 41.055ms | 1.064ms | 17.936ms | 0 |
| 172.7 KiB | 180.5 | 3,364 | 210 | 3,154 | 0.64 KiB | 3.355ms | 4.878ms | 6.575ms | 49.744ms | 1.259ms | 17.824ms | 0 |
| 179.4 KiB | 180.5 | 3,381 | 211 | 3,170 | 0.64 KiB | 3.393ms | 4.952ms | 6.972ms | 66.749ms | 1.189ms | 17.164ms | 0 |

Across 22,412 measured writes, no SQLite transaction reached 100ms. The largest SQLite transaction was 19.111ms; the largest full archive operation was 66.749ms. WAL stayed at its post-warmup plateau of about 4.1 MiB, so `0.0 MiB` WAL growth does not mean no WAL writes occurred.

## Control

The minimum representative state was also run at 80 actions/s with Replay disabled.

| State | Replay | Action p50 | Action p95 | Action p99 | Event-loop p99 | CPU | Peak RSS | Result |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 98.7 KiB | disabled | 805.0ms | 1,681.3ms | 1,726.2ms | 43.8ms | 94% | 293.7 MiB | FAIL |
| 98.7 KiB | bounded delta chain | 4,489.8ms | 8,159.5ms | 8,505.8ms | 29.1ms | 100% | 441.4 MiB | FAIL |

The old 400-Room anchor used a 50 KiB state and passed with action p99 146.6ms. A 98.7 KiB representative state already invalidates that anchor without Replay; the synchronous Replay path increases the same scenario’s queueing delay further.

## Decision input

- The selected bounded delta format is storage-efficient for this mutation shape: gzip payloads average 0.59–0.65 KiB and measured DB growth is 2.4–3.1 MiB per 60-second run.
- Memory remains far below 1.8 GiB and event-loop p99 remains below 100ms.
- No >=100ms SQLite transaction was observed, so WAL automatic checkpoint stalls are not the binding failure.
- The binding failure is synchronous main-thread throughput. The measured path cannot promise 400 concurrent Rooms at either required Replay Step interpretation.
- “锁定对局报告与回放的端到端架构” must either reduce or move the serialization/diff/hash/gzip work off the main action path, reduce the promised Room capacity, or define another write-before-broadcast design and rerun this same gate before implementation.
