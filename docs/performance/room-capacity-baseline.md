# Room Capacity Baseline

## Environment

- Commit: 9439171b
- Node: v22.22.2
- CPU: Intel(R) Xeon(R) Platinum 8336C CPU @ 2.30GHz
- Cgroup CPU limit: 2 cores
- Cgroup memory limit: 2048.0 MiB
- SQLite: 3.53.0
- journal_mode: wal
- synchronous: 1
- Serialized state: 50.0 KiB
- Exact invocation: docker run --rm --cpus=2 --memory=2g --user 1001:1001 --env ROOM_CAPACITY_COMMIT=9439171b --volume /data00/home/xuxinhao.titan/.asdf/installs/nodejs/22.22.2:/opt/node22:ro --volume /data00/home/xuxinhao.titan/raw/open-agricola:/workspace --workdir /workspace --entrypoint /opt/node22/bin/node vibe-trading:local --import tsx scripts/bench/room-capacity.ts --report docs/performance/room-capacity-baseline.md

## Workload

- Active two-player rooms with two open WebSocket seats
- Late-game state; production viewer envelopes and persistence checkpoint path
- In-process socket sink; network transport latency is excluded
- Levels: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
- Warmup per level: 15s
- Measurement per level: 60s
- Steady action rate: 0.2 actions/room/s
- Burst: one synchronized action per room
- Thresholds: action p99 <= 250ms, event-loop p99 <= 100ms, RSS <= 1843.2 MiB
- Approx. incremental RSS / room is the peak-RSS slope from the preceding ramp level; it is unavailable at the first level.

## Capacity

| Rooms | Actions (steady + burst) | Steady action p50 ms | Steady action p95 ms | Steady action p99 ms | Event-loop p50 ms | Event-loop p95 ms | Event-loop p99 ms | Burst ms | Peak RSS | Approx. incremental RSS / room | CPU | DB | WAL | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 50 | 650 | 12.0 | 13.9 | 16.6 | 10.1 | 19.5 | 21.3 | 541.6 | 176.8 MiB | n/a | 15% | 2.6 MiB | 4.0 MiB | PASS |
| 100 | 1301 | 11.4 | 13.5 | 18.1 | 10.2 | 20.8 | 22.1 | 1060.5 | 182.2 MiB | 0.1 MiB | 27% | 5.2 MiB | 4.0 MiB | PASS |
| 200 | 2601 | 10.7 | 12.4 | 15.3 | 11.6 | 16.4 | 19.0 | 2088.3 | 217.9 MiB | 0.4 MiB | 48% | 10.3 MiB | 4.0 MiB | PASS |
| 300 | 3901 | 10.3 | 12.0 | 16.5 | 16.7 | 18.4 | 20.7 | 3103.1 | 244.3 MiB | 0.3 MiB | 68% | 15.4 MiB | 4.0 MiB | PASS |
| 400 | 5201 | 10.3 | 24.5 | 44.1 | 12.4 | 14.2 | 16.7 | 4240.5 | 273.1 MiB | 0.3 MiB | 88% | 20.5 MiB | 4.0 MiB | PASS |
| 500 | 5561 | 4991.3 | 8989.8 | 9336.5 | 11.7 | 13.9 | 22.0 | 5291.1 | 300.7 MiB | 0.3 MiB | 93% | 25.6 MiB | 4.0 MiB | FAIL: steady action p99 9336.5ms |

## Cost attribution

| Rooms | Full action-to-broadcast ms | Persistence state serialization ms | Two-viewer envelope serialization ms | Adapter save ms | Raw SQLite update ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 10.437 | 0.057 | 0.644 | 0.452 | 0.040 |
| 100 | 10.610 | 0.048 | 0.586 | 0.477 | 0.037 |
| 200 | 11.453 | 0.051 | 0.614 | 0.476 | 0.042 |
| 300 | 10.242 | 0.047 | 0.577 | 0.457 | 0.038 |
| 400 | 10.572 | 0.050 | 0.601 | 0.476 | 0.038 |
| 500 | 11.567 | 0.054 | 0.669 | 0.522 | 0.044 |

## Conclusion

- Maximum passing level: 400
- First failing level: 500
- Binding evidence: the 500-room steady arrival rate exceeds the single-threaded action path; queued action p99 reaches 9336.5ms at 93% CPU.
- The synchronized burst is reported separately and does not participate in the steady-phase pass/fail threshold.
