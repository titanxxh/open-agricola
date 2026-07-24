# Room Capacity After

## Environment

- Commit: b0282f17
- Node: v22.22.2
- CPU: Intel(R) Xeon(R) Platinum 8336C CPU @ 2.30GHz
- Cgroup CPU limit: 2 cores
- Cgroup memory limit: 2048.0 MiB
- SQLite: 3.53.0
- journal_mode: wal
- synchronous: 1
- Serialized state: 50.0 KiB
- Exact invocation: `docker run --rm --cpus=2 --memory=2g --user 1001:1001 --env ROOM_CAPACITY_COMMIT=b0282f17 --volume /data00/home/xuxinhao.titan/.asdf/installs/nodejs/22.22.2:/opt/node22:ro --volume /data00/home/xuxinhao.titan/raw/open-agricola:/workspace --volume /tmp:/host-tmp --workdir /workspace --entrypoint /opt/node22/bin/node vibe-trading:local --import tsx scripts/bench/room-capacity.ts --label after --report /host-tmp/open-agricola-room-capacity-after-b0282f17.md`

## Workload

- Active two-player rooms with two open WebSocket seats
- Late-game state; production viewer envelopes and persistence checkpoint path
- In-process socket sink; network transport latency is excluded
- Levels: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
- Warmup per level: 15s
- Measurement per level: 60s
- Steady action rate: 0.2 actions/room/s
- Burst: one synchronized action per room
- Thresholds: steady action p99 <= 250ms, event-loop p99 <= 100ms, RSS <= 1843.2 MiB
- Approx. incremental RSS / room is the peak-RSS slope from the preceding ramp level; it is unavailable at the first level.

## Capacity

| Rooms | Actions (steady + burst) | Steady action p50 ms | Steady action p95 ms | Steady action p99 ms | Event-loop p50 ms | Event-loop p95 ms | Event-loop p99 ms | Burst ms | Peak RSS | Approx. incremental RSS / room | CPU | DB | WAL | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 50 | 651 | 12.1 | 14.3 | 16.1 | 10.1 | 19.6 | 21.7 | 519.3 | 168.7 MiB | n/a | 15% | 2.6 MiB | 3.9 MiB | PASS |
| 100 | 1301 | 11.6 | 14.1 | 16.5 | 10.2 | 21.0 | 22.4 | 1031.2 | 179.3 MiB | 0.2 MiB | 29% | 5.2 MiB | 4.0 MiB | PASS |
| 200 | 2601 | 10.7 | 12.9 | 15.8 | 11.8 | 16.7 | 20.5 | 2085.9 | 210.6 MiB | 0.3 MiB | 50% | 10.3 MiB | 4.0 MiB | PASS |
| 300 | 3901 | 10.4 | 16.5 | 29.3 | 16.6 | 19.2 | 29.6 | 3081.3 | 242.7 MiB | 0.3 MiB | 71% | 15.4 MiB | 4.0 MiB | PASS |
| 400 | 5201 | 11.2 | 129.3 | 146.6 | 12.0 | 14.3 | 33.0 | 3953.6 | 266.2 MiB | 0.2 MiB | 89% | 20.5 MiB | 4.0 MiB | PASS |
| 500 | 5615 | 4538.6 | 8443.2 | 8773.2 | 11.3 | 13.3 | 33.7 | 5023.8 | 288.2 MiB | 0.2 MiB | 92% | 25.6 MiB | 4.0 MiB | FAIL: steady action p99 8773.2ms |

## Cost attribution

| Rooms | Full action-to-broadcast ms | Persistence state serialization ms | Two-viewer envelope serialization ms | Adapter save ms | Raw SQLite update ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 10.711 | 0.057 | 0.654 | 0.286 | 0.039 |
| 100 | 10.507 | 0.041 | 0.585 | 0.283 | 0.034 |
| 200 | 10.043 | 0.046 | 0.583 | 0.300 | 0.037 |
| 300 | 10.402 | 0.043 | 0.635 | 0.290 | 0.036 |
| 400 | 10.526 | 0.043 | 0.683 | 0.376 | 0.039 |
| 500 | 10.132 | 0.041 | 0.561 | 0.271 | 0.039 |

## Conclusion

- The required 50/100/... ramp passed through 400 rooms and stopped at the first failed level, 500 rooms.
- No OOM, process restart, persistence error, or invalid response occurred.
- `synchronous=NORMAL` was already present in the baseline and is not counted as an optimization.

## Baseline vs after

Both rows use the same 400-room workload and 2 vCPU / 2 GiB anchor.

| Metric at 400 rooms | Baseline (`9439171b`) | After (`b0282f17`) | Change |
| :--- | ---: | ---: | ---: |
| Steady action p99 | 44.1 ms | 146.6 ms | +102.5 ms (+232.4%) |
| Event-loop p99 | 16.7 ms | 33.0 ms | +16.3 ms |
| Peak RSS | 273.1 MiB | 266.2 MiB | -6.9 MiB (-2.5%) |
| CPU | 88% | 89% | +1 pp |
| DB + WAL | 24.5 MiB | 24.5 MiB | no material change |
| Full action-to-broadcast | 10.572 ms | 10.526 ms | -0.4% |
| Persistence state serialization | 0.050 ms | 0.043 ms | -14.0% |
| Two-viewer envelope serialization | 0.601 ms | 0.683 ms | +13.6% |
| Adapter save | 0.476 ms | 0.376 ms | -21.0% |
| Raw SQLite update | 0.038 ms | 0.039 ms | +2.6% |

The adapter and full-path microbenchmarks improved, but the highest passing level remained 400 and the near-saturation steady p99 varied upward between runs. Intermediate commits were not separately re-ramped; the required baseline-to-final comparison is the decision basis.

## Terminal-room stress smoke

`scripts/bench/terminal-room-stress.ts` ran 100 completed games, 100 discarded games, 100 active games, one `newGame`-style id rotation, and repeated post-completion flush/completion plus shutdown callbacks.

- Exact invocation: `docker run --rm --cpus=2 --memory=2g --user 1001:1001 --volume /data00/home/xuxinhao.titan/.asdf/installs/nodejs/22.22.2:/opt/node22:ro --volume /data00/home/xuxinhao.titan/raw/open-agricola:/workspace --workdir /workspace --entrypoint /opt/node22/bin/node vibe-trading:local --import tsx scripts/bench/terminal-room-stress.ts 100`

| Check | Result |
| :--- | ---: |
| `rooms` | 101 |
| `game_results` | 100 |
| `game_result_players` | 200 |
| Non-active rows in `rooms` | 0 |
| Restorable rooms | 101 |
| Room id rotated | yes |
| Database | 2,228,224 bytes (2.1 MiB) |
| WAL | 4,132,392 bytes (3.9 MiB) |

Completed and discarded ids were absent from `rooms`; discarded ids were also absent from both result tables. Repeated terminal callbacks did not resurrect completed rooms. The only full-state rows after cleanup were the 100 active rooms plus the freshly rotated room.

## Final capacity and serialization decision

- Maximum supported concurrent two-player rooms on 2 vCPU / 2 GiB: **400**.
- First failing level: **500**.
- Binding constraint: the 500-room steady arrival rate saturates the single-threaded action/checkpoint path; queued action p99 reaches 8773.2 ms at 92% CPU while event-loop p99, RSS, and SQLite size remain below their limits.
- Original 200–500 room target: **met at 400 rooms**.
- At the highest passing level, two-viewer envelope serialization is `0.683 / 10.526 = 6.5%` of measured full action-to-broadcast time.
- The 20% follow-up threshold is not met. Serialization deduplication is not justified, [#571](https://github.com/titanxxh/open-agricola/issues/571) is closed as based on the superseded mixed-latency calculation, and this change does not modify hidden-information serialization.
