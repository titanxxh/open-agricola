# Master Plan

> Current execution plan only. Completed sprint notes are omitted.

## 1. Objective

Converge Open Agricola card behavior and metadata with BGA where BGA is the
chosen source of truth, while keeping explicit product-policy differences
visible and out of the implementation queue.

Current target state:

- Canonical BGA/OA card coverage remains `888 / 888`.
- Literal metadata mismatches remain `0`.
- The 11 behavior/registration gaps in `docs/card_progress.md` are closed or
  explicitly moved to deliberate divergence.
- BGA-banned cards that OA keeps available remain documented as policy
  differences, not false-positive bugs.

## 2. Current Work Queue

| Priority | Cards | Why |
|---|---|---|
| P0 | `C71_Slurry` / `C71_SlurrySpreader` | Duplicate registration/name cleanup can leak the wrong legacy card identity. |
| P0 | `D13_Trowel`, `D15_ClaySupports`, `D66_PotterCeramics` | Renovation/baking payment paths differ from BGA and are core rule flows. |
| P0 | `A148_Woolgrower`, `B86_TruffleSearcher` | Capacity calculation is wrong when the card is played after earlier harvests. |
| P1 | `B157_Salter`, `C57_Crudite`, `E5_NightLoot` | Need explicit player choice modeling instead of first-match or single-option shortcuts. |
| P1 | `C8_PlantFertilizer` | Needs logical field-group support now that relevant later field cards are active. |
| P2 | `C140_PackagingArtist` | Needs a reusable action-pool extension point for replacement actions. |

## 3. Suggested Waves

### Wave A: Local Rule Fixes

Scope:

- Fix `A148_Woolgrower` and `B86_TruffleSearcher` to use global completed
  feeding/harvest count.
- Remove or quarantine duplicate `C71_SlurrySpreader` registration.
- Fix `D66_PotterCeramics` so the bake continuation is mandatory.

Verification:

- Targeted session tests for late-play capacity on `A148` and `B86`.
- Targeted session or unit test proving only canonical `C71_Slurry` is exposed.
- Targeted session test for mandatory bake after `D66` conversion.
- `pnpm test:fast`
- `pnpm run lint`

### Wave B: Payment And Renovation Flow

Scope:

- Model `D13_Trowel` wood-to-stone renovation.
- Model `D15_ClaySupports` as an alternate payment/trade instead of a mandatory
  cost delta.

Verification:

- Targeted session tests for wood-to-stone renovation with `D13`.
- Targeted payment tests for `D15` base cost plus optional clay trade.
- Relevant existing renovation/payment tests.
- `pnpm test:fast`
- `pnpm run lint`

### Wave C: Explicit Choice And Action-Pool Semantics

Scope:

- Replace `B157_Salter` single-choice flow with multi-type count selection.
- Convert `C57_Crudite` harvest behavior to an optional explicit source choice.
- Add exact source-space selection for `E5_NightLoot`.
- Make `C8_PlantFertilizer` group-aware for grain/vegetable/wood/stone plantings.
- Add the missing replacement action-pool extension needed by
  `C140_PackagingArtist`.

Verification:

- One targeted slow/session test per card first.
- Add regression cases for multi-listener or multi-option pending where relevant.
- Run broader slow tests only after targeted cases pass.
- `pnpm test:fast`
- `pnpm run lint`

## 4. Documentation Rules

For every card-related code change, update:

- `docs/card_progress.md`: move fixed cards out of the current queue or adjust
  accepted-divergence rows.
- `docs/card_desc_audit.md`: update only when metadata, descriptions, canonical
  names, or audit counts change.
- `docs/master-plan.md`: update only when priorities, waves, or remaining scope
  change.
- `docs/ARCHITECTURE.md`: update when a reusable engine/action-flow/pending
  mechanism changes.

Do not commit `docs/superpowers/*` unless explicitly requested.

## 5. Validation Policy

Prefer targeted validation before broad suites:

```bash
pnpm exec vitest run <targeted-test-file>
pnpm test:fast
pnpm run lint
```

Use `pnpm test:slow` selectively for affected session/card flows. Full slow runs
are useful before major merges, but they should not be the first diagnostic step
for a single-card regression.

Run metadata audit after metadata or card registry changes:

```bash
pnpm exec tsx scripts/audit-bga-metadata-diff.ts
```

## 6. Done Definition

This BGA-alignment pass is done when:

- `docs/card_progress.md` has zero behavior/registration gaps, or every
  remaining row is explicitly moved to deliberate divergence.
- `scripts/audit-bga-metadata-diff.ts` reports:
  - BGA scanned: `888`
  - TS scanned: `888`
  - literal mismatches: `0`
  - complex/schema-up mismatches: accepted and documented
  - BGA-only / TS-only canonical ids: `0 / 0`
- Targeted tests for every fixed card pass.
- `pnpm test:fast` and `pnpm run lint` pass before PR merge.
