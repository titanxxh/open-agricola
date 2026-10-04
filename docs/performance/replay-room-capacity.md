# Replay Room Capacity

## Result

The 2 CPU / 2 GiB launch limit remains 30 ordinary in-memory Rooms. The completed optimization group passes its frozen latency/CPU/write gates and the 30-Room capacity checks below. The original production Durable Room Commit probe passed at 30 Rooms and exceeded the action-latency threshold at 35 Rooms; the current optimization probe revalidates 30 Rooms. This probe used built-in cards and did not include the two-Worker topology of executable Workshop Rooms; those Rooms are separately capped at 15 until that topology is measured.

## Follow-up optimization objectives

Work on Issues [#938](https://github.com/titanxxh/open-agricola/issues/938), [#939](https://github.com/titanxxh/open-agricola/issues/939), [#940](https://github.com/titanxxh/open-agricola/issues/940), [#941](https://github.com/titanxxh/open-agricola/issues/941), and [#942](https://github.com/titanxxh/open-agricola/issues/942) must demonstrate both lower action-to-broadcast latency and CPU cost, and lower cumulative persistence write volume under the same workload. Snapshot size alone does not satisfy these objectives.

Assess these improvements across the completed group of changes. An individual slice may improve only one objective, provided the other metrics do not regress beyond the baseline's measured variation and the existing capacity and recovery requirements remain satisfied.

Use fresh Rooms from a baseline that includes [PR #945](https://github.com/titanxxh/open-agricola/pull/945). Compare before and after with the same runtime, SQLite settings, resource limits, and command workload. Keep the existing Room capacity limits until the corresponding production-path probe justifies changing them.

Before implementation, measure repeated runs of that baseline and freeze the minimum improvement and permitted variation. Determine these thresholds from baseline variation rather than the old Issue percentages; do not revise them after observing the optimized results. Use the same complete command transcript for both versions, including the actor and structured input, rather than dynamically choosing whichever action is available.

The completed group is assessed below against these unchanged objectives. The original capacity measurements are retained separately for context.

### Frozen optimization baseline (Issue #947)

The fixed workloads contain 136 two-player and 277 four-player commands, including farm choices, payments, undo and process recovery. Their explicit stress preparation (hands, cost occupations and resources) is recorded with each fixture; these are reproducible cost workloads, not a claim about optimal play or ordinary starting resources. Five fresh-process runs on Node 24.19.0 under a 2 CPU / 2 GiB cgroup produced identical raw Frame Hash chains and commit classifications. SQLite uses WAL and `synchronous=NORMAL`.

The source is `85d19405` (after PR #945). Raw runs, workload hashes, exact invocations and thresholds are retained in `room-optimization-baseline.json`; the workload fixtures and recorder are maintained with the benchmark. Before implementation, the group thresholds were frozen at 6% CPU improvement, 7% / 10% / 9% action-to-broadcast p50 / p95 / p99 improvement, and 5% cumulative DB/WAL write reduction. Latency/CPU thresholds are twice the largest observed median-relative variation, rounded up, with a 5% floor. Per-slice regression allowances are 3% CPU, 4% / 5% / 5% latency and 1% writes.

Independent syscall tracing, excluding database preparation and final close, measured 39,318,816 bytes for the two-player workload and 139,895,504 bytes for four players. DB/WAL writes were byte-identical across normal runs and corroborated by the separate trace. Logical snapshot bytes are measured in the traced run only; tracing and extra snapshot measurement do not contribute to the latency/CPU samples used for acceptance. These frozen values must not be relaxed after optimized results are observed.

### Completed optimization group (Issues #947–#955)

The combined implementation passes the original frozen group thresholds. Five fresh-process runs of the unchanged command fixtures and timing harness used Node 24.19.0 and the same 2 CPU / 2 GiB limits. Normal timing runs exclude syscall tracing and extra logical-byte measurement. The measured production source is `636d46bf`, rebased on `6c34b054`; the subsequent trace-parser and documentation changes do not alter that production source.

| Players | CPU before → after | CPU reduction | p50 before → after | p95 before → after | p99 before → after | DB/WAL written before → after | Write reduction |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 2687.1 → 2216.8ms | 17.5% | 13.38 → 10.12ms | 32.58 → 24.24ms | 50.62 → 40.54ms | 39,318,816 → 21,768,392 bytes | 44.6% |
| 4 | 7177.0 → 5220.3ms | 27.3% | 21.28 → 14.35ms | 47.44 → 31.93ms | 58.36 → 41.27ms | 139,895,504 → 55,037,752 bytes | 60.7% |

Actual cumulative DB/WAL writes come from a separate path-filtered `strace` run, parsed by `scripts/bench/room-write-trace.ts`. The parser counts completed and resumed writes only inside one complete marker pair per workload and rejects truncated traces. Its totals match the frozen baseline trace and the final trace. SQLite temporary-file writes are separate: 389,500 bytes for two players and 569,900 for four. The traced logical snapshot totals are 29,411,391 and 102,062,391 bytes; these are neither write-volume reductions nor latency samples. Normal `processWrittenBytes` also includes temporary writes; tracing markers add 32 bytes in the independent run.

Main introduced raw `playerId`, `playerRefs` and generated-name provenance during implementation, changing the raw Frame chain relative to `85d19405`. Every final, window-disabled control and CPU-after command matches the Hash and commit classification of an independent **unoptimized `6c34b054`** reference. That reference adds only the identical frozen harness/fixtures and two resource-limit exports. Historical optimization stages continue to match the frozen original chain. The original performance baseline and acceptance thresholds are unchanged, and exact saved Frames remain verified before presentation.

The raw artifact reports every stage and its permitted-regression results. Intermediate commit samples have tail-latency regressions; comparisons with the old Frame stage also cross later correctness and main changes, so they are not reported as universally passing standalone slices. This delivery is one combined PR. The final window-only comparison uses the same corrected production source, with only the two envelope calls changed to `windowed=false`, and five alternating final/control pairs. Its two-player CPU/p99 changes are +0.32%/+1.12%, within the frozen allowance; four-player CPU/p99 improve 4.73%/2.72%. All its other regression checks pass. The earlier window-control p99 regression and all abandoned measurements remain in the diagnostic data.

Separate synchronous-entry CPU attribution identifies the rule/commit savings and additional presentation work; it is not mixed with acceptance timing:

| Players | Rule CPU before → after | Commit CPU before → after | Broadcast CPU before → after |
| ---: | ---: | ---: | ---: |
| 2 | 1570.3 → 1154.5ms | 971.3 → 803.7ms | 168.7 → 256.8ms |
| 4 | 2935.2 → 1726.0ms | 3237.1 → 2495.5ms | 814.4 → 1138.8ms |

Attribution includes all process threads during each synchronous public entry point. Restart/recovery and loop overhead are reported separately. Broadcast CPU is higher in the final path, which includes history/identity presentation and inherited main privacy changes; aggregate CPU and action-to-broadcast latency meet the frozen gates. Network transport remains excluded by the in-process committed socket sinks.

The production Durable Room Commit capacity path also passes at 30 ordinary Rooms. The long run uses 15 seconds of warmup and 60 seconds of measurement; the late-state run uses 1 and 5 seconds. Both retain the original seed/trajectory and workload rate; the current sampled serialized states are 139,167 and 165,888 bytes (46 and 16 commands remaining).

| 30-Room probe | Accepted commands | Action p99 | Event-loop p99 | Peak RSS | Result |
| :--- | ---: | ---: | ---: | ---: | :--- |
| Long run | 843 | 54.36ms | 44.60ms | 294.5 MiB | PASS |
| Late state | 98 | 52.74ms | 45.78ms | 290.3 MiB | PASS |

Keep the ordinary Room cap at **30** and executable Workshop cap at **15**. This capacity probe uses built-in cards and does not establish a larger executable Workshop limit. Recovery, privacy and history behavior are also covered by Session/adapter/Worker tests and real Room browser paging, cancellation and rename/reconnect checks.

Local verification passed after restart and real browser checks: 1,454 full-suite files / 13,624 tests, 764 fast-suite files / 8,225 tests, lint with zero errors, architecture and i18n gates, app and immutable Viewer builds, bundle budgets, community consistency and deterministic LLM recordings.

Raw results, fixture/harness hashes, source references, unchanged thresholds, controlled patch and exact invocations are retained in [`room-optimization-results.json`](room-optimization-results.json); the baseline remains [`room-optimization-baseline.json`](room-optimization-baseline.json).

## Original capacity environment

- Source: working tree based on `2d2a5ef1`
- Node: 22.22.2
- CPU: Intel Xeon Platinum 8336C
- Cgroup: 2 CPU / 2 GiB
- SQLite: 3.53.0, WAL, `synchronous=NORMAL`, `wal_autocheckpoint=1000`
- Long-run state: 141,100 bytes from a 176-command seed-563 game, with 46 commands remaining
- Late-state check: 170,267 bytes from the same game, with 16 commands remaining
- Two WebSocket seats per Room; in-process socket sink
- Built-in cards only; no executable Workshop session/code Workers
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

Keep the hard limit at 30 ordinary `waiting + playing` Rooms per 2 CPU / 2 GiB instance. Fixed development Rooms are excluded. Within that total, keep executable Workshop Rooms at 15 because each owns a session Worker whose code runtime owns another Worker; the process-wide 15-slot budget counts every Room reservation together with active HTTP sandboxes, including restored Rooms before they resume. Raise either limit only after the same production-path probe passes with the corresponding Room shape.
