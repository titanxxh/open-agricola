# Test Skip Tracker

Tracks tests skipped during architecture refactor sprints. Each skip must list:
- Test file + describe/it name
- Sprint that introduced the skip (S1, S2, ...)
- Category — see legend below
- Reason (one line)
- Expected resolution sprint

## Category legend

- **shape-mismatch** — test asserts the literal pre-S1 `'choice'` discriminator
  on `EngineStepResult` / `ActionExecutionResult`. The S1 codemod replaced
  these with `'request'` (typed `InteractionRequest`); the assertions are
  mechanical narrows that need a one-line shape update. Resolve in **S7**
  (card test regression batch — bulk codemod).
- **behavior-regression** — test exercises BGA-aligned behaviour that S1
  inadvertently changed. These break BGA equivalence and must be addressed
  before any user-facing release. Resolve in **S2 (urgent)**.
- **private-field-access** — test mutates engine internals that became
  getter-only or moved (e.g. `session.pending` deleted by Task 10). Either
  rewrite the test to use the public API or wait for the wrapped composite
  emit work. Resolve in **S2 / S7** depending on viability.

## Active skips

| Test | Skipped in | Category | Reason | Resolve in |
|---|---|---|---|---|
| server/__tests__/B104_SheepWalker-session.test.ts > B104_SheepWalker session — last harvest enforcement > "forces animalReorg in last harvest even when no breeding occurs (single sheep)" | S1 → re-categorized in S7-shape (2026-05-08) | behavior-regression | shape codemod applied; underlying bug: B104 `enforceReorganizeOnLastHarvest` no longer surfaces an animal-reorg request after feed-phase confirm in round 14. Engine's `runEngineSteps` reaches `step.type === 'choice'` but the choice branch (`shared/session/session-core.ts:2278`) does not pivot into `startReorganizeSubFlow`, so the harvest ends in `stateId: 'idle'` instead of `'wait'`. Regression introduced somewhere between original B104 implementation and the S2 pending→interaction migration. | next behavior-regression batch |
| server/__tests__/E70_CropRotationField-session.test.ts > E70_CropRotationField session > sowing on card field > "fromSelectedFields rejects committing a different extra sow field" | S1 | private-field-access | test mutates private `session.pending` / `activeSpaceId` which are now getter-only after Task 10 | S2 |

## Resolved skips

| Test | Originally skipped in | Resolved in | Notes |
|---|---|---|---|
| server/__tests__/B72_LoveforAgriculture-session.test.ts > "does NOT allow sowing in a size-3+ pasture" | S1 | S1 (Task 11 review) | Reviewer C-1 fix: `resolveChoice` dispatch now validates `value` against the InteractionNode's `choices` for confirm/feed kinds. Submitting a stray `'sow'` against a `confirm-next-player` frame correctly returns `ok: false`. |
| server/__tests__/C70_LettucePatch-session.test.ts > "does NOT allow sowing grain in the card field" | S1 | S1 (Task 11 review) | Same fix as above. |
| server/__tests__/C70_LettucePatch-session.test.ts > "does not show card field as sowable when crop already exists" | S1 | S1 (Task 11 review) | Same fix as above. |
| server/__tests__/C70_LettucePatch-session.test.ts > "sow NOT doable without the card" | S1 | S1 (Task 11 review) | Same fix as above. |
| server/__tests__/E70_CropRotationField-session.test.ts > "sow is not doable when card already has crop and no regular fields" | S1 | S1 (Task 11 review) | Same fix as above. |
| shared/actions/effects/__tests__/pay.test.ts > "uses stable resource display order in payment labels" | S1 | S7-shape-codemod 2026-05-08 | bulk codemod: narrow on `result.type === 'request'` then `result.request.kind === 'choice'` then `result.request.options` |
| shared/actions/effects/__tests__/pay.test.ts > "sorts same-cost returned-card solutions deterministically" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/actions/effects/__tests__/pay.test.ts > "emits choice when multiple solutions exist" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/actions/effects/__tests__/pay.test.ts > "resolveChoice / paymentChoice param applies selected solution" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/actions/effects/__tests__/pay.test.ts > "multi-choice bonus: extraData.bonusChoiceIndex carries chosen index" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/actions/effects/__tests__/selection.test.ts > "execute() emits promptKey 'ui.interactionOccupationHand' when selectionKind is occupation-hand" | S1 | S7-shape-codemod 2026-05-08 | same; verified `request.kind === 'choice'` |
| shared/actions/effects/__tests__/selection.test.ts > "execute() keeps farm-position promptKey when selectionKind is absent" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/actions/effects/__tests__/stables-resolveChoice.test.ts > "first call with multi-combo trade modifier returns choice + actionContextWrite" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/actions/effects/__tests__/fence-resolveChoice.test.ts > "first call with multi-combo payment returns choice + actionContextWrite" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/actions/effects/__tests__/exchange-effect-preview.test.ts > "builds scaled resource-exchange previews from affordable cookery trades" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/cards/__stubs__/__tests__/hook-coverage-matrix.test.ts > Stub_ComputeArgs_ExtraOption > "adds extra option to improvement-any choice" | S1 | S7-shape-codemod 2026-05-08 | EngineStepResult discriminator unchanged; mock action `execute()` updated to return `{type:'request', request:{kind:'choice', options}}` |
| shared/cards/__tests__/sourceCard-card-production.test.ts > "D23 Pioneering Spirit card-owned choice options carry sourceCard" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/cards/__tests__/sourceCard-card-production.test.ts > "C104 Collector preserves sourceCard on both initial and repeated direct choices" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/cards/__tests__/sourceCard-card-production.test.ts > "B42 Forest Inn tags its direct exchange choices with sourceCard" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/cards/__tests__/D50_ForeignAid.test.ts > computeArgs place-farmer > "filters out rounds 12-14 spaces from options" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/cards/__tests__/A97_Freshman.test.ts > "lets play-occupation ignore normal lessons cost when Freshman provides free play" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/cards/__tests__/D51_E10_cards.test.ts > move-farmer-to-space action > "execute lists unoccupied spaces excluding source" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/cards/__tests__/D51_E10_cards.test.ts > move-farmer-to-space action > "execute includes occupied Lessons with A28_ForestSchool" | S1 | S7-shape-codemod 2026-05-08 | same |
| shared/cards/__tests__/priority-plan-implementation.test.ts > "C60 Small Potter's Oven asks which oven to return when both match" | S1 | S7-shape-codemod 2026-05-08 | same |
| server/__tests__/farm-choice.test.ts > farm choice > "requires an explicit payment choice when multiple room payments are legal" | S1 | S7-shape-codemod 2026-05-08 | same |
| server/__tests__/B146_Illusionist-session.test.ts > discard-from-hand action > "is registered via internalActionDefinitions and exposes choice" | S1 | S7-shape-codemod 2026-05-08 | same (slow suite) |
| server/__tests__/C104_Collector-multiselect-session.test.ts > "1st use: emits choice with needed=6 and resolves to begging+6 distinct goods" | S1 | S7-shape-codemod 2026-05-08 | same; verified `request.kind === 'choice'` despite "multi-select" name (slow suite) |
| server/__tests__/C104_Collector-multiselect-session.test.ts > "2nd use: needed=7 (after first use bumps the counter)" | S1 | S7-shape-codemod 2026-05-08 | same |
| server/__tests__/C104_Collector-multiselect-session.test.ts > "insufficient selections: re-emits same choice (needed unchanged, no flow)" | S1 | S7-shape-codemod 2026-05-08 | same |
| server/__tests__/C146_WorkshopAssistant-multiselect-session.test.ts > "n=3: emits choice with needed=3, accepts WC,CS,RS → gains wood+2*clay+stone+reed+stone" | S1 | S7-shape-codemod 2026-05-08 | same |
| server/__tests__/C146_WorkshopAssistant-multiselect-session.test.ts > "n=3 with insufficient selections (WC only): re-emits same choice" | S1 | S7-shape-codemod 2026-05-08 | same |
| server/__tests__/C146_WorkshopAssistant-multiselect-session.test.ts > "n=3: duplicate selections collapse and re-emit when unique count is short" | S1 | S7-shape-codemod 2026-05-08 | same |
| server/__tests__/D131_CraftsmanshipPromoter-session.test.ts > "cost-unaffordable: bottom-row majors filtered out" | S1 | S7-shape-codemod 2026-05-08 | same |
