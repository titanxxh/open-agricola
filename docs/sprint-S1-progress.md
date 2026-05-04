# Sprint S1 — PendingAction Elimination + InteractionNode skeleton

Architecture refactor sprint replacing the legacy `GameState.pending` value with engine-derived
`InteractionNode` requests, an explicit `EngineStack` cursor, and serialization round-trip support
for confirm/feed kinds.

## Status — completed 2026-05-03

Tasks 1–11 landed plus Task 11 reviewer C-1 / I-1 follow-ups.
fast 0 fail / 35 skip; slow 0 fail / 13 skip.

### Commit summary

- Task 1 — `EngineStepResult` / `InteractionRequest` / `InteractionNode` type defs
- Task 2 — `EngineStack` class + cursor round-trip TDD
- Task 3 — `InteractionNode` rename + `Engine.peekInteraction`
- Task 4 — `reorganize.ts` emit `'request'`
- Task 5 — 15 effect leaves codemod `'choice'` → `'request'`
- Task 6 — `GameCore` engineStack 改造
- Task 7 — R2/R3/R4 残留清理
- Task 8 — D-a cursor 序列化
- Task 9 — confirm/feed 推广
- Task 10 — delete `GameState.pending`; `buildInteraction` rewrite (composite emits cached on `Engine.lastEmittedChoice`)
- Task 11 — codemod stub-test green; skipped tests registered in `docs/skip-tracker.md`
- Task 11 reviewer C-1 — `resolveChoice` dispatch now validates client `value` against the
  active `InteractionNode.choices` for typed kinds (`confirm-next-player`,
  `confirm-player-switch`, `feed`). Pre-S1, a stray submission against any non-`choice`
  pending was rejected by `resolvePendingChoice`'s `pending.type !== 'choice'` guard;
  the S1 dispatch had widened the entry-point and accidentally accepted any string as
  `confirm`. Fix restores BGA-equivalent rejection behaviour. Five sow-fail tests
  un-skipped (B72 ×1 / C70 ×3 / E70 ×1).
- Task 11 reviewer I-1 — `docs/skip-tracker.md` re-categorised. Active skips now carry a
  `Category` column distinguishing **shape-mismatch** (S7 codemod batch),
  **behavior-regression** (S2 urgent — historically zero entries after C-1 fix), and
  **private-field-access** (S2; one E70 entry).

## Carry-overs to Sprint S2

These items intentionally deferred from Sprint S1 to keep the cut surface controlled. Each is
independently scoped; none blocks the InteractionNode/EngineStack landing.

- **Delete 3 GameCore confirm adapter shims**: `confirmNextPlayer`, `confirmPlayerSwitch`,
  `confirmHarvestFeed` still exist as compatibility wrappers around `resolveChoice`. Removing
  them needs a frontend transport rename (`gameTransport.ts` confirm methods → `resolveChoice`)
  plus a ~68-test session test codemod. Not pulled into S1 because the surface area is wide and
  unrelated to the engine-cursor work.

- **Delete `ws.ts` legacy `ClientCommand` variants**: `feed`, `nextPlayer`, `confirmPlayerSwitch`
  command kinds still exist on the protocol. Frontend `WsGameTransport` currently sends these.
  Cleanup pairs with the GameCore shim deletion above.

- **Wrap composite emits in real `InteractionNode`s**: `OrNode` / `XorNode` / `OptionalNode`
  currently emit choice-shaped requests via the runtime cache `Engine.lastEmittedChoice`. Wrapping
  them in actual `InteractionNode` instances eliminates the cache (Task 10 reviewer note S-1).

- **Rewrite `choice-disabled-option.test.ts`**: test currently accesses a private engine field
  (Task 10 reviewer note S-4). Should test through the public `EngineStepResult` boundary
  instead.

- **Resolve remaining 30 `shape-mismatch` skipped tests**: 20 fast suite + 10 slow suite tests
  registered in `docs/skip-tracker.md` with S7 target. All assert the legacy `result.type ===
  'choice'` shape that effect leaves now emit as `'request'`. Mechanical codemod — bulk update
  the narrows. The five sow-fail behavioural skips that previously lived here were resolved
  by the C-1 dispatch fix; see Resolved skips section in the tracker.

- **One `private-field-access` skip (E70)**: `fromSelectedFields rejects committing a different
  extra sow field` mutates `session.pending` / `session.activeSpaceId`, both removed by Task 10.
  Targeted at S2 alongside the wrapped composite emit work — the test should drive through the
  public `resolveChoice` boundary instead.

## Reference

- `docs/sprint-S1-spec.md` — sprint scope + design intent
- `docs/sprint-S1-plan.md` — task breakdown + DoD
- `docs/skip-tracker.md` — registered skips with resolution sprint
- `docs/ENGINE_ARCHITECTURE.md` — engine / node tree / interaction request architecture
