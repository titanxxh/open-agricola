# Testing strategy

[English](testing.md) | [中文](testing_zh.md)

Rule correctness is proven at the backend seam with the smallest sufficient layer; see [`docs/CARD_TEST_TEMPLATE.md`](../CARD_TEST_TEMPLATE.md) for the card test template.

## Layers

| Layer | Directory | Purpose |
|---|---|---|
| Unit | `shared/**/__tests__/*.test.ts`, `client/**/__tests__/*.test.ts` | Pure domain logic with mock state and direct calls |
| Session | `server/__tests__/*.test.ts` | Instantiate `GameSession`, call commands, assert `state`, `interaction`, `log` and `scores`; card Session tests named `[A-E][0-9]*_*-session.test.ts` or `M[0-9]*_*-session.test.ts` run in the `slow` project (`SLOW_INCLUDE` in `scripts/test-project-globs.ts`) |
| E2E | `e2e-tests/*.spec.ts` | Playwright browser tests for rendering and multiplayer paths |

- Session tests default to two players and use `server/__tests__/_helpers/session-fixtures.ts` (`createOpeningSession`, `createWorkSession`).
- Do not use DOM shape, button copy or page structure as proof of rules; test rendering separately with E2E.
- Multiplayer opening helpers select the interaction owner from authoritative snapshots and wait for every connected test viewer's Room version to advance after each choice. Fixed opening fixtures cover delayed delivery; DOM visibility alone cannot signal completion of a WebSocket command. Playwright retains traces on failure, including the first attempt, and routine CI uploads them with failure screenshots.
- Release verification uses the same `scripts/release/` browser flow against an isolated Hosted frontend and an explicitly configured target. Durable checks use the PostgreSQL adapter and Room/configuration codecs. `release-rehearsal.spec.ts` owns the real application integration; `release-diagnostics.spec.ts` and `release-rendering.spec.ts` hold transport, redaction and image-readiness controls. See [CI operations](../operations/ci-checks.md) for the entry point.
- Required browser cases are declared explicitly and matched against immutable reporter evidence bound to the source fingerprint and requirement hash. Review owns scenario selection; `scripts/verify.ts` and `verification-requirements.ts` enforce execution completeness. Diagnostics retain bounded metadata and keep the first failure separately from cleanup errors.
- Vitest projects are `fast-shared`, `fast-cards`, `fast-card-runtime`, `fast-client`, `fast-server`, `fast-scripts`, `fast-tests` and `slow`. `pnpm test:fast` first runs `check:test-project-coverage`, which requires every test file to belong to exactly one project. Commands and verification records are documented in [`AGENTS.md`](../../AGENTS.md) and [`docs/operations/ci-checks.md`](../operations/ci-checks.md).
- Serialized display projections (`lockedFarmTileKeys`, `playerPanelSummary`, `moorSpecialActionAvailability`, card-state presentation, animal zones, special stables) are derived in the owning Session context and stripped on rehydration; pure perspective filtering lives in `shared/projections/serialized-state.ts`. New fields are additive, and existing Replay Viewer builds and payloads stay immutable.
- Prefer calling `GameSession` methods directly; `/api/game/*` or WebSocket messages serve black-box contracts. Assert resources, played cards, `cardStates`, action spaces, `pending` / `interaction`, `log` and `scores`.

## Full candidate verification

The on-demand `candidate-verification.yml` workflow runs the canonical complete task catalog in `scripts/ci/verification-tasks.ts`. It separates fast and slow tests, builds, quality checks and browser lanes so a failed task can be retried independently. Contract and community-card tests belong to their normal Vitest projects rather than additional duplicate runs. Browser tasks reuse `scripts/verify.ts` and its structured browser results.

`scripts/ci/verification-tasks.ts` keeps the `chromium-1` through `chromium-4` task IDs and evenly distributes the sorted Chromium spec list by file count. Source and verification configuration determine membership across compatible retries. Actual timings remain in generated execution evidence. Rules are in [CI checks](../operations/ci-checks.md) and [ADR 0037](../adr/0037-scope-routine-verification-and-gate-releases.md). Tests: `scripts/__tests__/catalog-chromium-balance.test.ts`.

Formal request/check first admits a final merged-PR snapshot on the requested repository's protected main, using native numeric identities, an explicit main ref, and raw Git reachability. A separate fixed protected-main producer P owns orchestration for candidate C; the configuration hash binds both trees and only identifies compatible execution. This implementation policy and its native-governance trust boundary are recorded in [ADR 0037](../adr/0037-scope-routine-verification-and-gate-releases.md).

`scripts/ci/candidate-verification.ts` binds the actual clean checkout, dispatch commit and verification configuration. Its check command reads GitHub run, job and step metadata. Every required task must have successful compatible evidence. Tasks use their own execution timestamps across runs and reruns; rerunning another task does not advance an unchanged job. A newer manifest's requested but missing work blocks older success through the run's completion. For missing execution times, a completed run's trusted `updated_at` can bound unsuccessful evidence so a later clean run can supersede it. Unbounded times and overlapping intervals block reuse. Local success JSON and ordinary scoped CI runs cannot establish full candidate verification.

`candidate-rehearsal.yml` provides ordinary PR/workflow-call implementation rehearsal using the current implementation and the same ten isolation tasks. Its completion exports selected tasks and the tested commit, but its native workflow identity cannot authorize deployment. Formal `candidate-verification.yml` dispatches only on main; P admits C before privileged setup, and all controller/setup/finalization code comes from P. Native receipts bind repository, channel, C, both configurations and P.


Prerelease has a separate trusted-main producer in `prerelease-candidate-verification.yml` and `scripts/ci/prerelease-verification.ts`. Its immutable ref and integration manifest bind selection and independent feature sources. The same catalog runs against the candidate without formal write credentials. Receipt channel and test runtime are separate: ordinary regressions run stable, explicit pre fixtures select pre, and the production build runs the typed hosted builder with pre metadata. Receipt acceptance binds repository ID, channel, candidate SHA, candidate/policy configuration, and a compatible producer reachable from protected main. Other candidates cannot supersede these results; missing or incompatible work blocks publication. Stable admission is unchanged. Ordinary prerelease push/PR events share the routine plan. Tests: `candidate-verification-prerelease.test.ts`, `candidate-verification.test.ts`, `release-publish.test.ts`, and `candidate-verification-pages.test.ts`.

The catalog executes candidate lifecycle hooks, browser downloads, service setup, builds and tests under a separate UID with a dedicated Docker29.9.3 rootless daemon. The trusted runner owns the canonical source, policy dependencies, command files, logs and receipts. Policy CLIs use native Node TypeScript rather than candidate-writable executables. The root-owned `candidate-user-environment.sh` resets HOME, XDG and Docker paths after PAM for both bootstrap commands and the UID-specific user manager, preserving its notification socket and excluding global environment generators. Candidate commands have no host sudo or rootful Docker access. The root-owned smoke checks identity, no-new-privileges on the client, protected files, real bind ownership and bidirectional host networking. Docker containers remain confined by the daemon's rootless UID mapping; client no-new-privileges does not propagate through the Docker API. Teardown stops the user manager and every descendant cgroup before transferring the candidate tree for source-byte verification and no-follow diagnostic collection. Candidate output is captured privately and escaped before display. Ordinary PR full-catalog CI uses this same executor before merge. Unsupported isolation fails the job. Historical stable receipts are limited by the trusted `LEGACY_STABLE_CUTOFF` ancestor boundary. A candidate cannot select legacy mode by removing a marker. A new main-producer attempt for that candidate blocks fallback to historical success, including incomplete or incompatible attempts. Prerelease receipts always require isolation setup, runtime proof and completed teardown. Tests: `candidate-verification-isolation.test.ts`, `candidate-verification-cli.test.ts` and `candidate-verification.test.ts`.

## Routine scope verification

GitHub Actions is authoritative for integration and release. Local focused checks provide development feedback. `ci.yml` is the only automatic PR and main verifier.

Routine selection follows dependency evidence. Incomplete evidence widens inside a bounded layer, and only a full trigger selects the complete catalog. Release-candidate verification remains the completeness guarantee. Selection rules are in [ADR 0037](../adr/0037-scope-routine-verification-and-gate-releases.md) and [CI checks](../operations/ci-checks.md).

| Responsibility | Entry |
|---|---|
| Plan the branch, checkout, and source fingerprint | `createRepositoryPlan` in `scripts/ci/verification-plan.ts`; `planRoutineVerification` in `scripts/ci/routine-verification-plan.ts`; import graph in `scripts/ci/import-graph.ts` |
| Deterministic file partitions | `routinePartitions` in `scripts/ci/routine-partitions.ts` |
| Execution and Vitest reports | `scripts/ci/scoped-verification.ts`; `scripts/ci/vitest-results.ts` |
| Local affected run | `pnpm verify affected` in `scripts/verify.ts` |
| Required gate | `scripts/ci/routine-verification-gate.ts`; `.github/workflows/ci.yml` calls `.github/workflows/scoped-verification.yml` |

`test-consumers.ts` records which selected tests need database services.

Runtime import selection includes configured Vitest setup consumers. Artifact reads stay on direct readers and direct tests, with local const path aliases resolved. Cached graphs require a matching source fingerprint. Browser walks stop at shared test helpers. `restart-local.sh` prepares the Replay Viewer and its artifacts in one build; the isolated browser runner owns environment creation through tsx, startup failure cleanup, and credential removal. Completed browser JSON results must cover the selected specs. A valid empty documentation plan skips all execution slots. Selection evidence is included in the plan summary.

Tests: `scripts/__tests__/routine-verification-plan.test.ts`, `scripts/__tests__/routine-verification-replay.test.ts`, `scripts/__tests__/verify-affected.test.ts`, `scripts/__tests__/scoped-verification-partitions.test.ts`, `scripts/__tests__/scoped-verification.test.ts`, `scripts/__tests__/scoped-verification-cli.test.ts`, `scripts/__tests__/routine-verification-gate.test.ts`, `scripts/__tests__/isolated-browser.test.ts`, `scripts/__tests__/vitest-results.test.ts`, and `scripts/__tests__/ci-card-impl-boundaries.test.ts`.

## Architecture fitness

`pnpm run check:architecture` owns the architecture check declaration. The quality task consumes its production scanners, type checks, and lint commands. Tests belong to their Vitest groups. The aggregate command also runs contract tests through `check:architecture-tests` and sandbox prompt and documentation checks. Each scanner catches common mistakes by agents and developers and provides actionable diagnostics.

| Invariant | Executable coverage | Limits |
|---|---|---|
| Physical `shared` / `server` / `client` layering | ESLint `architecture/imports` | Imports, not runtime ownership |
| Card Source scope and cross-card references | `pnpm run check:card-impl-boundaries` | Same-file AST over production Card Sources; `Major_*`, `reaches`, purchase and prerequisite candidates are exceptions; no cross-file dataflow; empty or mismatched scope fails |
| Listener subscription selectors | Shared registration contract and `check:card-impl-boundaries`, also run by `verify prepush` | Checks resolved production registrations and authoritative board IDs; reports card-text review candidates separately; does not infer trigger semantics from a space filter |
| Runtime dependency cycles | `pnpm run check:dependencies` | Every runtime SCC, including self-cycles and literal dynamic imports, fails; no baseline; explicit type-only imports erase but inline type specifiers still load; tracked or non-ignored unclassified source roots fail |
| Browser and Replay isolation | `pnpm run check:browser-boundaries` | Source graph plus real Vite module graphs |
| Compile-time architecture contracts | `pnpm run check:architecture-types` | Real no-emit program over `tsconfig.architecture.json` |
| Scan completeness | direct session log, effect-file list, no-DSL, test-project coverage, Card Source and field-boundary checks | Missing or unparseable roots fail |
| Trailing listener snapshots | `pnpm run check:card-impl-boundaries` | Direct `improvements` / `minorPlayed` / `occupationPlayed` length reads fail in `immediatelyAfter` and `after`; membership checks stay valid; resolved handler bodies only |
| Listener state purity | Runtime guard in every listener-dispatching Vitest project, plus `check:card-impl-boundaries` | Proves executed branches only |
| Documentation budgets | `scripts/__tests__/docs-budget.test.ts` | Every Workshop-readable doc under `REFERENCE_LIMITS.fileBytes`; architecture index ≤ 16 KiB, each module document ≤ 32 KiB, no card IDs |
| Generated catalog matches Card Sources | `pnpm run check:generated-cards-sync` | Structural equality |
| `GameSession` owns the command seam | `CONTEXT.md`, ADR 0014, review and layering errors | Ownership, not a whole-program mutation proof |
| Canonical architecture wiring | `pnpm run check:architecture`, `scripts/ci/verification-tasks.ts`, `scripts/__tests__/ci-card-impl-boundaries.test.ts` | Scoped CI selects canonical tasks and always evaluates `verify`; quality retains the production scanners; contract counterexamples belong to their Vitest groups; required checks follow `docs/operations/ci-checks.md` |

Prefer source discovery, file lists, import boundaries and small syntax checks. Scanners reuse `scripts/source-files.ts`; a missing or empty required root, a parse error or an unsupported entry fails, and a named exemption that no longer matches a recognized write is stale. Do not grow checkers into symbol or dataflow engines without a concrete repository case.

The farm-write scan runs inside `check:card-impl-boundaries` across production `shared/` and `server/`, including newly added directories. The CLI gate owns this full-repository audit; small repository fixtures test write-owner, stale-exception and geometry-dependency behavior. It shares `FARM_LAYOUT_KEYS` with operation receipts and checks the authoritative usage/placement geometry reads against that contract. Only the named common writers and two named bootstrap/restore functions are allowed. Missing or empty roots, parse failures and stale exceptions fail the gate. Assignment, array mutation, index writes, common aliases and `Object.assign` are covered by counterexample tests in `scripts/__tests__/farm-write-scan.test.ts`; this syntax check does not prove arbitrary JavaScript. Session tests prove payment, ordering, ownership and usage qualification.

## Qualification and main input coverage

PostgreSQL qualification tests prove fresh grant reads and deletion foreign keys. Authority and retirement tests exercise handoff, source revocation, generation fencing and current restore audits. HTTP and real WebSocket boundary tests reject removed configuration and commands before room allocation, version or Replay changes, then exercise ordinary requests with omitted, empty and unknown capability declarations. Browser coverage retains administrator grant/revoke controls, prerelease entry, ordinary invitations, Hotseat and spectating. Historical ordinary pending snapshots execute their next command through `fixed-room-prices-recovery.test.ts` and `standard-solo-recovery-network.test.ts`.
