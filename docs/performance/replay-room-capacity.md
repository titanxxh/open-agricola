# Replay Room Capacity

## Result

The 2 CPU / 2 GiB launch limit remains 30 ordinary in-memory Rooms. The completed optimization group passes its frozen latency/CPU/write gates and the 30-Room capacity checks below. The original production Durable Room Commit probe passed at 30 Rooms and exceeded the action-latency threshold at 35 Rooms; the current optimization probe revalidates 30 Rooms. This probe used built-in cards and did not include the two-Worker topology of executable Workshop Rooms; those Rooms are separately capped at 15 until that topology is measured.

## Follow-up optimization objectives

Work on Issues [#938](https://github.com/titanxxh/open-agricola/issues/938), [#939](https://github.com/titanxxh/open-agricola/issues/939), [#940](https://github.com/titanxxh/open-agricola/issues/940), [#941](https://github.com/titanxxh/open-agricola/issues/941), and [#942](https://github.com/titanxxh/open-agricola/issues/942) must demonstrate both lower action-to-broadcast latency and CPU cost, and lower cumulative persistence write volume under the same workload. Snapshot size alone does not satisfy these objectives.

Assess these improvements across the completed group of changes. An individual slice may improve only one objective, provided the other metrics do not regress beyond the baseline's measured variation and the existing capacity and recovery requirements remain satisfied.

Use fresh Rooms from a baseline that includes [PR #945](https://github.com/titanxxh/open-agricola/pull/945). Compare before and after with the same runtime, SQLite settings, resource limits, and command workload. Keep the existing Room capacity limits until the corresponding production-path probe justifies changing them.

Before implementation, measure repeated runs of that baseline and freeze the minimum improvement and permitted variation. Determine these thresholds from baseline variation rather than the old Issue percentages; do not revise them after observing the optimized results. Use the same complete command transcript for both versions, including the actor and structured input, rather than dynamically choosing whichever action is available.

The completed group is assessed below against these unchanged objectives. The original capacity measurements are retained separately for context.

### Issue #941 evaluation

The final candidate covers all three agreed directions: private session-cursor change detection, serialization reuse and canonical Replay Frame hashing. Five alternating fresh-process control/candidate pairs and five independent write traces pass all twelve timing, RSS and persistence-write checks; both 30-Room capacity probes also pass. Functional verification also passes; the implementation is ready for review against the unchanged Issue #941 acceptance criteria. The duplicate cursor-hash calculation was already fixed by Issue #948 in PR #957 and is not counted as a new improvement.

The source baseline is `bd43a15bde1ee177dc5820924929bc69810569b3`. Before implementation, five runs of the unchanged 136-command two-player and 277-command four-player fixtures froze the thresholds in [`room-commit-baseline.json`](room-commit-baseline.json). Both versions use Node 24.19.0, a 2 CPU / 2 GiB cgroup and unchanged SQLite WAL, `synchronous=NORMAL` and checkpoint settings. Whole-workload CPU includes recovery; action-to-broadcast latency ends at the in-process committed socket sink and excludes network transport. CPU profiles, syscall tracing and extra logical-byte measurement are separate from acceptance timing.

For each timing metric, the required reduction is the greater of 5% or twice the largest five-run deviation from the baseline median, rounded up to a whole percentage point. RSS and DB/WAL regression allowances are the baseline variation rounded up. These requirements were frozen before candidate measurements and remain unchanged:

| Players | CPU reduction | p50 reduction | p95 reduction | p99 reduction | Maximum RSS regression | Maximum DB/WAL write regression |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 7% | 15% | 24% | 41% | 18% | 1% |
| 4 | 14% | 8% | 5% | 13% | 19% | 1% |

The following medians come from the five final pairs in `final-pairs.json`; the control column is the contemporaneous baseline population, not the earlier threshold-setting population. Every workload and metric passes independently.

| Players | CPU control → candidate | CPU reduction | p50 control → candidate | p50 reduction | p95 control → candidate | p95 reduction | p99 control → candidate | p99 reduction |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 2276.928 → 1504.781ms | 33.91% | 9.935 → 7.030ms | 29.23% | 24.886 → 15.544ms | 37.54% | 39.841 → 23.182ms | 41.81% |
| 4 | 5465.851 → 3404.297ms | 37.72% | 14.642 → 9.581ms | 34.56% | 31.904 → 17.594ms | 44.85% | 40.789 → 29.480ms | 27.73% |

The candidate adopts these mechanisms:

- **Private cursor comparison:** retain an owned comparison value with canonical-JSON-equivalent equality. Compare only when the public Frame is unchanged and no durable transition forces a commit. Restore and frozen retries preserve the accepted comparison baseline; Worker-produced mutable values are copied. Public hashes and content-equivalent no-ops retain their existing semantics.
- **Serialization reuse:** capture the authoritative core once and share its immutable values with the Frame, while detaching derived display values. A freshly serialized native Frame transfers directly to the committer; Worker snapshots still require an ownership copy, and terminal scores are copied separately. SQLite stores the exact Frame overlay against the captured state, then reconstructs and validates the saved raw Frame without current-rule evaluation. Version 2 writes retain version 1 reads. Small stored core/recovery bodies use gzip level 1 only when its complete envelope is smaller; history nodes, public Replay format, checksums and transaction boundaries retain their contracts.
- **Canonical encoding:** replace the allocation-heavy object traversal with a direct loop and cache canonical strings only for proven immutable captured history records. This still builds the canonical JSON string before hashing; canonical bytes and SHA-256 values remain unchanged. Shared immutable values also allow delta construction to skip identical subtrees.

Supporting refinements avoid discarded generic query work: evaluate an entry's base predicate only when the strict composite path needs it, and evaluate a flow leaf fallback only when no cost preview supplies the answer. Compute animal zones once per player-display serialization for its four projections. Fence enumeration prunes impossible partial subsets and uses local adjacency traversal while preserving candidate order, affordability and hook evaluation. SQLite skips only equal player-index updates. None of these changes introduces a cross-command rules cache or changes database settings. Ownership and storage contracts are documented in [Architecture](../ARCHITECTURE.md) and [ADR 0021](../adr/0021-room-owned-history-branches-and-recovery-snapshots.md).

Session-wide dirty tracking was not adopted: every mutation, reversal, undo and restore would need a reliable invalidation contract. A global catalog index was not adopted because public catalog arrays and identifiers remain mutable. Caching every complete history-array prefix was rejected because it can retain quadratic canonical-string storage; immutable record caching is the bounded reuse seam. Isolated slice measurements remain diagnostic and do not establish standalone acceptance for each mechanism.

Three earlier five-pair attempts failed the unchanged two-player p99 requirement; each passed the other seven timing checks. All their individual reports, paired populations and failed verdicts are retained separately from the final population:

| Attempt | Two-player p99 control → candidate | Reduction | Required |
| :--- | ---: | ---: | ---: |
| Frame overlay and lazy queries | 40.674 → 36.994ms | 9.05% | 41% |
| gzip bodies and unchanged-seat update elision | 40.029 → 25.881ms | 35.35% | 41% |
| Native Frame transfer and initial fence pruning | 39.458 → 25.730ms | 34.79% | 41% |

Five independent path-filtered syscall traces supply the candidate DB/WAL medians, compared with the frozen write baseline. SQLite temporary-file writes are excluded and reported separately: median 356,700 bytes for two players and 545,300 for four. Logical snapshot size and normal process write counters are not substitutes for these traces. RSS medians come from the untraced final pairs. All four regression guards pass; `final-acceptance.json` records all twelve checks as passing.

| Players | DB/WAL bytes baseline → candidate | Write reduction | RSS bytes control → candidate | RSS reduction |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 21,830,168 → 12,460,336 | 42.92% | 231,272,448 → 226,512,896 | 2.06% |
| 4 | 55,033,128 → 27,826,344 | 49.44% | 282,841,088 → 252,706,816 | 10.65% |

Both production Durable Room Commit capacity probes pass at 30 ordinary Rooms, with the same trajectory and 0.45125 accepted commands per Room per second. The long probe uses 15 seconds of warmup and 60 seconds of measurement; the late-state probe uses 1 and 5 seconds. Their sampled states contain 139,167 and 165,888 bytes, with 46 and 16 commands remaining. The existing gates remain action p99 <= 250ms, event-loop p99 <= 100ms and RSS <= 1.8 GiB.

| 30-Room probe | Accepted commands | Action p99 | Event-loop p99 | Peak RSS | Result |
| :--- | ---: | ---: | ---: | ---: | :--- |
| Long run | 843 | 39.834ms | 33.047ms | 318.9 MiB | PASS |
| Late state | 98 | 44.402ms | 34.734ms | 302.1 MiB | PASS |

Ordinary Rooms remain capped at **30** and executable Workshop Rooms at **15**. These built-in-card probes do not establish a larger Workshop limit.

The complete final Frame/private-cursor/Replay Step trace is byte-identical to the unchanged baseline (94,476,226 bytes), including per-command hashes and commit classification. Focused Session, codec, SQLite recovery, Worker, ownership, query-purity and fence-order tests cover the changed boundaries, including native and Worker frozen retries, private-only transitions, no-ops, undo/rebranch, restart, score isolation and corrupt storage.

After the required local restart, the real Room browser test passed history paging, cancellation markers, undo, rename and reconnect. Final verification passed: 778 fast-suite files / 8,338 tests (2 skipped, 1 todo), lint with zero errors, app build, architecture types, and dependency checks (1,647 files; zero runtime cycles or boundary errors). Six pre-existing asynchronous-error assertion failures also reproduced on the frozen baseline; a separate test-only commit asserts their actual error messages directly, without changing production behavior or benchmark inputs.

[`room-commit-results.json`](room-commit-results.json) retains the raw runs, source and harness hashes, diagnostic slices, three failed paired attempts, exact-trace identity, physical writes, capacity reports and final verdict. The 94 MB raw trace and syscall/profile logs remain local artifacts identified by SHA-256; timing and write reports are embedded in the JSON, with repeated hash/classification arrays represented by lossless `workloadTranscripts` references. Every measured sample is retained. The completed optimization group below remains historical evidence.

### Late-game broadcast reuse follow-up (rejected)

The follow-up experiment did **not** meet its frozen performance gates and is **not integrated into production**. Slice A shares one serialized base per broadcast (`a09c7b2e`); slice B additionally reuses the native committed Frame (`78ef395f`), retaining per-viewer filtering. The control source is `8b62adb8a43aca2038161598b1a30ccc3b085672`, after the completed #941 changes above. Those earlier gains remain separate; they are not counted again in this comparison. The benchmark harness, fixed input and rejected measurements are retained in [`room-broadcast-late-results.json`](room-broadcast-late-results.json).

The [four-player late-game fixture](../../scripts/bench/fixtures/room-performance/4p-late.json) is an explicit stress preparation, not a naturally played five-worker game. Its [recorder](../../scripts/bench/late-game-workload.ts) replays 226 commands of the seed-563 four-player fixture to round 12, preserving real histories, then prepares five ordinary active workers, five connected wooden rooms, two fields, one fenced stable and ten distinct played cards per player. The 40 cards include cost and resource hooks, animal holders and card fields. Hands are explicit placeholders and resources are abundant. Old modifiers and pre-preparation undo state are cleared, and a fresh Session restores the prepared snapshot before recording.

The subsequent 234 public commands cover rounds 12–14 and seven final harvest/end-game commands at engine round 15, not an extra work round. They include 60 effective worker placements, 42 resource payments, 51 card triggers, three undo operations and one pending restart. Every step retains five ordinary workers; played-card counts grow from ten per player to 11/10/10/11, with a 14-card invariant checked throughout. Initial logical snapshot size is 437,282 bytes; the observed peak is 6,121,350 bytes with undo depth 13. These are logical sizes, not SQLite write measurements. The [shape report](../../scripts/bench/fixtures/room-performance/4p-late.shape.json) records card IDs, hook participation and command counts. The fixture's uninstrumented public-command replay reaches the same final canonical state, Frame and private cursor as its recorder.

Five alternating control/candidate pairs ran on Node 24.19.0 in the same 2 CPU / 2 GiB cgroup, with unchanged SQLite settings. Each fresh process executes one unmeasured full warmup and three measured transcripts. The table uses medians of the paired process aggregates; CPU is divided by three to report one complete transcript, while latency percentiles retain the measured command population. Latency runs from command entry through durable commit to the last of four synchronous socket-sink sends, excluding routing, queueing, network transport and client rendering. CPU includes recovery. Required reductions were frozen from five earlier control processes before implementing candidates.

| Metric | Paired control | Candidate A+B | Reduction | Required reduction | Result |
| :--- | ---: | ---: | ---: | ---: | :--- |
| CPU per full transcript | 5,113.067ms | 5,026.711ms | 1.69% | 11% | FAIL |
| Action-to-last-send p50 | 18.772ms | 18.318ms | 2.42% | 12% | FAIL |
| Action-to-last-send p95 | 32.619ms | 31.548ms | 3.29% | 18% | FAIL |
| Action-to-last-send p99 | 46.923ms | 50.283ms | -7.16% | 12% | FAIL |

All four timing requirements fail, including a p99 regression. The CPU aggregates before division are 15,339.200ms and 15,080.134ms for three transcripts. Passing the memory guard does not change the rejection. No production broadcast, persistence or rules change is adopted from these prototypes.

The per-round paired medians below remain diagnostic; the frozen acceptance gates apply to the complete workload. Counts are distinct broadcast-producing commands in one transcript (round 13 also contains one restart). Small per-round p99 populations, especially the seven terminal commands, are close to maxima.

| Engine round | Commands | Control → candidate p95 | Control → candidate p99 |
| ---: | ---: | ---: | ---: |
| 12 | 75 | 31.959 → 30.007ms | 46.286 → 49.194ms |
| 13 | 78 | 30.387 → 29.514ms | 38.441 → 43.452ms |
| 14 | 73 | 33.184 → 34.146ms | 44.813 → 42.806ms |
| 15 (final pending/end) | 7 | 50.942 → 49.812ms | 52.461 → 51.043ms |

The unchanged baseline also passes a separate 30-Room capacity probe: one second of warmup and 60 seconds of measurement at 0.45125 commands per Room per second. It accepts all 812 commands, with scheduled-to-last-send p99 69.665ms, event-loop p99 50.856ms and peak RSS 549,179,392 bytes. All 30 Rooms remain active, with zero errors and no due-command backlog. This exercises only the first 27–28 commands of round 14 in each Room; it does not cover a complete round, the terminal harvest, network delivery or executable Workshop capacity. The existing Room limits remain unchanged.

Four complete trace comparisons pass: A and A+B on the late fixture, plus A+B on the unchanged two-/four-player stock fixtures. The late trace contains 234 commits (including initial capture), 932 viewer packets and the classification array. Every raw commit row, including Frame, hash and private cursor, and every classification row is byte-identical. Entire packet traces are not byte-identical: `historyBranch` allocates an unused state-root group before returning its cached branch, so fewer serialization roots shift subsequent generated UUIDs. One strict bidirectional mapping across the whole trace preserves all record/group/head identities and embedded pagination cursors; all other packet fields match exactly and no fields are removed. Ten negative comparator self-tests reject changed data, broken references, non-bijections and identity cardinality changes. The raw trace hashes, full mappings and comparator source are retained in the result artifact.

The paired process peak-RSS median is 342,130,688 → 336,887,808 bytes, within the frozen 5% regression allowance. One independent syscall trace per variant measures cumulative DB/WAL bytes of 12,472,696 → 12,550,976 for the stock two-player workload and 32,317,392 → 32,243,160 for the late four-player workload. Both satisfy the 1% write guard; these small differences are variation, not claimed storage savings. The candidate's separate capacity probe also accepts 812 commands with 30 active Rooms and no errors/backlog, scheduled-to-send p99 101.196ms, event-loop p99 74.056ms and peak RSS 550,268,928 bytes. It passes the capacity gates but does not establish a capacity improvement.

The retained benchmark/documentation change passes local restart, backend health/frontend HTTP checks, a full late transcript through the CLI, 778 fast-suite files / 8,338 passing tests (2 skipped, 1 todo), benchmark types and lint with zero errors. The isolated prototype separately passes 780 files / 8,349 tests, server types and lint. No application build, push or deployment is part of this evaluation.

A separate cold CPU profile attributes 1,692 samples to call stacks containing `Broadcaster.broadcastCommitted`. Within that sampled scope, `serializeState` accounts for about 13%, while two successive history-name projection stages account for about 26%; viewer history filtering is another substantial cost. These are main-thread sample intervals, not process CPU totals or acceptance timing, and root-level GC is excluded. Harness seat names (`P0`–`P3`) differ from the fixture's saved names, so every broadcast also exercises connection-name replacement; the result does not represent every production naming distribution. Abundant resources, placeholder hands and built-in cards further bound the workload's coverage. Avoiding repeated history-name projection and unnecessary archive copies is a possible next investigation, with viewer privacy and history identities preserved; no such change is implemented or accepted by this experiment.

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
