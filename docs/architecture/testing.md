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
- Release verification uses the same `scripts/release/` browser flow against an isolated Hosted frontend and an explicitly configured target. Durable checks use the PostgreSQL adapter and Room/configuration codecs. `release-rehearsal.spec.ts` owns the real application integration; `release-diagnostics.spec.ts` and `release-rendering.spec.ts` hold transport, redaction and image-readiness controls. See [CI operations](../operations/ci-checks.md) for the entry point.
- Required browser cases are declared explicitly and matched against immutable reporter evidence bound to the source fingerprint and requirement hash. Review owns scenario selection; `scripts/verify.ts` and `verification-requirements.ts` enforce execution completeness. Diagnostics retain bounded metadata and keep the first failure separately from cleanup errors.
- Vitest projects are `fast-shared`, `fast-cards`, `fast-card-runtime`, `fast-client`, `fast-server`, `fast-scripts`, `fast-tests` and `slow`. `pnpm test:fast` first runs `check:test-project-coverage`, which requires every test file to belong to exactly one project. Commands and verification records are documented in [`AGENTS.md`](../../AGENTS.md) and [`docs/operations/ci-checks.md`](../operations/ci-checks.md).
- Serialized display projections (`lockedFarmTileKeys`, `playerPanelSummary`, `moorSpecialActionAvailability`, card-state presentation, animal zones, special stables) are derived in the owning Session context and stripped on rehydration; pure perspective filtering lives in `shared/projections/serialized-state.ts`. New fields are additive, and existing Replay Viewer builds and payloads stay immutable.
- Prefer calling `GameSession` methods directly; `/api/game/*` or WebSocket messages serve black-box contracts. Assert resources, played cards, `cardStates`, action spaces, `pending` / `interaction`, `log` and `scores`.

## Full candidate verification

The on-demand `candidate-verification.yml` workflow runs the canonical complete task catalog in `scripts/ci/verification-tasks.ts`. It separates fast and slow tests, builds, quality checks and browser lanes so a failed task can be retried independently. Contract and community-card tests belong to their normal Vitest projects rather than additional duplicate runs. Browser tasks reuse `scripts/verify.ts` and its structured browser results.

`scripts/ci/candidate-verification.ts` binds the actual clean checkout, dispatch commit and verification configuration. Its check command reads GitHub run, job and step metadata. Every required task must have successful compatible evidence. Tasks use their own execution timestamps across runs and reruns; rerunning another task does not advance an unchanged job. A newer manifest's requested but missing work blocks older success through the run's completion. For missing execution times, a completed run's trusted `updated_at` can bound unsuccessful evidence so a later clean run can supersede it. Unbounded times and overlapping intervals block reuse. Local success JSON and ordinary scoped CI runs cannot establish full candidate verification.

The workflow also supports reuse for pre-merge execution. Its completion job exports the selected task IDs and checked-out commit only after every selected matrix task succeeds. Formal release evidence requires its dedicated manual run for the exact candidate commit.

## Routine scope verification

GitHub Actions is authoritative for integration and release. Local focused checks and browser reproduction provide development feedback; the complete local `prepush` remains optional. `ci.yml` is the only automatic PR/main verifier. Legacy full-test and browser workflows do not repeat the selected work, and no scheduled full run is configured.

`scripts/ci/verification-plan.ts` discovers test ownership independently of selection and includes the whole branch diff, both rename paths, and actual checkout changes. Unknown ownership and shared configuration expand to the complete catalog. Ordinary documentation selects its constraint tests. Runtime-readable documentation retains the owning business scope.

The planner unions mixed scopes into one complete file set per Vitest project and one browser file set per engine and identical grep selector. Checks and files have stable ordering. An unfiltered file covers narrower selectors for the same engine; specialized catalog browser tasks do not erase inline checks. PR plans include the merge checkout, and main plans include the complete push integration range. Both use the same groups and retain their declared integration browser consumers.

`scripts/ci/frontend-verification.ts` declares complete frontend business groups and their browser consumers. Known farm board, interaction, authentication, transport, locale, and Replay modules select the complete client test group, quality and builds, and explicit browser files or matrix tags. Missing consumers and unknown frontend modules expand to full verification.

`scripts/ci/business-verification.ts` declares authentication/connection/Room, storage/recovery/Replay, shared rule, protocol/projection, and Workshop groups. Each selects complete affected Vitest projects and canonical quality/build tasks. Recovery includes serialization, client transport, Replay model and storage/publishing tests. Shared mechanisms retain the complete slow project, client project, and browser lanes, including consumers of public i18n and farm helpers. Workshop includes current behavior regressions, reference/prompt/document constraints and both sandbox executors, without calling models. Unknown directories, absent declared consumers or missing projects expand to full verification. Public plan and process-level CLI cases live in `scoped-verification-business*.test.ts`.

`scripts/ci/card-verification.ts` associates authoritative Card Source identities with literal references, imports, and local test-helper dependencies across the discovered Vitest and browser inventory. It normalizes leading zeros and selects complete files, including cross-card and slow Session consumers. Production imports and registration bootstrap terminate ownership traversal. Generic registry, filesystem, dynamic-source, hand, and opening consumers remain in a conservative safety group even when they also name cards. The bounded card UI group, browser sandbox, WebKit, quality, and builds remain selected. New or removed card paths, missing behavior associations, ambiguous identities, invalid helper evidence, and cards with hand or global availability expand to full verification. Shared mechanisms retain their broader scope. This is a declared association contract, not semantic dependency inference. Public boundary coverage is in `scripts/__tests__/card-verification.test.ts` and `scoped-verification-cli.test.ts`.

`scripts/ci/scoped-verification.ts` recomputes canonical plans and checks their digest and source identity before execution. `routine-partitions.ts` keeps complete Vitest checks in `units` and sorts browser `(engine, grep, file)` tuples into four round-robin slots, regrouped by their exact engine and selector. It asserts exact-once coverage. Each worker retains `pnpm verify`, isolated dependencies, `restart-local.sh`, and structured case results. Local `all` execution retains the complete plan. Routine results remain separate from full release receipts.

`ci.yml` schedules units, four explicit browser callers, and catalog tasks independently after planning. Scoped callers share `scoped-verification.yml`; empty slots have explicit null descriptors and are skipped. The always-running `verify` gate checks every selected caller’s status, partition ID and digest, full plan digest, SHA, and complete count. A failed or missing caller cannot be covered by another success. Units-only plans retain `catalog_tasks=none`. Browser workers install both engines for embedded launches. Public coverage is in `scoped-verification*.test.ts`, `routine-verification-gate.test.ts`, and `ci-card-impl-boundaries.test.ts`.

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
