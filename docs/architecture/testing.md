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
- Vitest projects are `fast-shared`, `fast-cards`, `fast-card-runtime`, `fast-client`, `fast-server`, `fast-scripts`, `fast-tests`, `slow` and `llm`. `pnpm test:fast` first runs `check:test-project-coverage`, which requires every test file to belong to exactly one project. Commands and verification records are documented in [`AGENTS.md`](../../AGENTS.md) and [`docs/operations/ci-checks.md`](../operations/ci-checks.md).
- Serialized display projections (`lockedFarmTileKeys`, `playerPanelSummary`, `moorSpecialActionAvailability`, card-state presentation, animal zones, special stables) are derived in the owning Session context and stripped on rehydration; pure perspective filtering lives in `shared/projections/serialized-state.ts`. New fields are additive, and existing Replay Viewer builds and payloads stay immutable.
- Prefer calling `GameSession` methods directly; `/api/game/*` or WebSocket messages serve black-box contracts. Assert resources, played cards, `cardStates`, action spaces, `pending` / `interaction`, `log` and `scores`.

## Architecture fitness

`pnpm run check:architecture` is the single architecture gate, called once by each CI workflow. It runs the architecture scripts, the contract type checks, the contract tests through `check:architecture-tests` and the sandbox prompt / documentation sync. Checks stay simple: they catch common mistakes by agents and developers, not deliberate bypasses, and each diagnostic must be actionable.

| Invariant | Executable coverage | Limits |
|---|---|---|
| Physical `shared` / `server` / `client` layering | ESLint `architecture/imports` | Imports, not runtime ownership |
| Card Source scope and cross-card references | `pnpm run check:card-impl-boundaries` | Same-file AST over production Card Sources; `Major_*`, `reaches`, purchase and prerequisite candidates are exceptions; no cross-file dataflow; empty or mismatched scope fails |
| Runtime dependency cycles | `pnpm run check:dependencies` | Every runtime SCC, including self-cycles and literal dynamic imports, fails; no baseline; explicit type-only imports erase but inline type specifiers still load; tracked or non-ignored unclassified source roots fail |
| Browser and Replay isolation | `pnpm run check:browser-boundaries` | Source graph plus real Vite module graphs |
| Compile-time architecture contracts | `pnpm run check:architecture-types` | Real no-emit program over `tsconfig.architecture.json` |
| Scan completeness | direct session log, effect-file list, no-DSL, test-project coverage, Card Source and field-boundary checks | Missing or unparseable roots fail |
| Trailing listener snapshots | `pnpm run check:card-impl-boundaries` | Direct `improvements` / `minorPlayed` / `occupationPlayed` length reads fail in `immediatelyAfter` and `after`; membership checks stay valid; resolved handler bodies only |
| Listener state purity | Runtime guard in every listener-dispatching Vitest project, plus `check:card-impl-boundaries` | Proves executed branches only |
| Documentation budgets | `scripts/__tests__/docs-budget.test.ts` | Every Workshop-readable doc under `REFERENCE_LIMITS.fileBytes`; architecture index ≤ 16 KiB, each module document ≤ 32 KiB, no card IDs |
| Generated catalog matches Card Sources | `pnpm run check:generated-cards-sync` | Structural equality |
| `GameSession` owns the command seam | `CONTEXT.md`, ADR 0014, review and layering errors | Ownership, not a whole-program mutation proof |
| Canonical architecture wiring | `pnpm run check:architecture`, `scripts/__tests__/ci-card-impl-boundaries.test.ts` | Both CI workflows call the aggregator once; required checks follow `docs/operations/ci-checks.md` |

Prefer source discovery, file lists, import boundaries and small syntax checks. Scanners reuse `scripts/source-files.ts`; a missing or empty required root, a parse error or an unsupported entry fails, and a named exemption that no longer matches a recognized write is stale. Do not grow checkers into symbol or dataflow engines without a concrete repository case.

The farm-write scan runs inside `check:card-impl-boundaries` across production `shared/` and `server/`, including newly added directories. It shares `FARM_LAYOUT_KEYS` with operation receipts and checks the authoritative usage/placement geometry reads against that contract. Only the named common writers and two named bootstrap/restore functions are allowed. Missing or empty roots, parse failures and stale exceptions fail the gate. Assignment, array mutation, index writes, common aliases and `Object.assign` are covered by counterexample tests in `scripts/__tests__/farm-write-scan.test.ts`; this syntax check does not prove arbitrary JavaScript. Session tests prove payment, ordering, ownership and usage qualification.
