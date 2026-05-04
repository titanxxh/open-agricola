# Test Skip Tracker

Tracks tests skipped during architecture refactor sprints. Each skip must list:
- Test file + describe/it name
- Sprint that introduced the skip (S1, S2, ...)
- Reason (one line)
- Expected resolution sprint (default: S7 = card test regression)

## Active skips

| Test | Skipped in | Reason | Resolve in |
|---|---|---|---|
| shared/actions/effects/__tests__/pay.test.ts > "uses stable resource display order in payment labels" | S1 | asserts `result.type === 'choice'` but `buildPaymentChoiceResult` now emits `'request'` | S7 |
| shared/actions/effects/__tests__/pay.test.ts > "sorts same-cost returned-card solutions deterministically" | S1 | same as above | S7 |
| shared/actions/effects/__tests__/pay.test.ts > "emits choice when multiple solutions exist" | S1 | same as above | S7 |
| shared/actions/effects/__tests__/pay.test.ts > "resolveChoice / paymentChoice param applies selected solution" | S1 | initial payment branch returns `'request'`, test still narrows on `'choice'` | S7 |
| shared/actions/effects/__tests__/pay.test.ts > "multi-choice bonus: extraData.bonusChoiceIndex carries chosen index" | S1 | same as above | S7 |
| shared/actions/effects/__tests__/selection.test.ts > "execute() emits promptKey 'ui.interactionOccupationHand' when selectionKind is occupation-hand" | S1 | `selectionAction.execute` returns `'request'`; test asserts `'choice'` | S7 |
| shared/actions/effects/__tests__/selection.test.ts > "execute() keeps farm-position promptKey when selectionKind is absent" | S1 | same as above | S7 |
| shared/actions/effects/__tests__/stables-resolveChoice.test.ts > "first call with multi-combo trade modifier returns choice + actionContextWrite" | S1 | `'choice'` → `'request'` shape mismatch | S7 |
| shared/actions/effects/__tests__/fence-resolveChoice.test.ts > "first call with multi-combo payment returns choice + actionContextWrite" | S1 | `'choice'` → `'request'` shape mismatch | S7 |
| shared/actions/effects/__tests__/exchange-effect-preview.test.ts > "builds scaled resource-exchange previews from affordable cookery trades" | S1 | `'choice'` → `'request'` shape mismatch | S7 |
| shared/cards/__stubs__/__tests__/hook-coverage-matrix.test.ts > Stub_ComputeArgs_ExtraOption > "adds extra option to improvement-any choice" | S1 | `EngineStepResult` choice/request mismatch | S7 |
| shared/cards/__tests__/sourceCard-card-production.test.ts > "D23 Pioneering Spirit card-owned choice options carry sourceCard" | S1 | direct-choice path emits `'request'` | S7 |
| shared/cards/__tests__/sourceCard-card-production.test.ts > "C104 Collector preserves sourceCard on both initial and repeated direct choices" | S1 | same as above | S7 |
| shared/cards/__tests__/sourceCard-card-production.test.ts > "B42 Forest Inn tags its direct exchange choices with sourceCard" | S1 | same as above | S7 |
| shared/cards/__tests__/D50_ForeignAid.test.ts > computeArgs place-farmer > "filters out rounds 12-14 spaces from options" | S1 | computeArgs hook narrowing on `'choice'` | S7 |
| shared/cards/__tests__/A97_Freshman.test.ts > "lets play-occupation ignore normal lessons cost when Freshman provides free play" | S1 | play-occupation flow `'choice'` → `'request'` shape mismatch | S7 |
| shared/cards/__tests__/D51_E10_cards.test.ts > move-farmer-to-space action > "execute lists unoccupied spaces excluding source" | S1 | move-farmer execute returns `'request'` | S7 |
| shared/cards/__tests__/D51_E10_cards.test.ts > move-farmer-to-space action > "execute includes occupied Lessons with A28_ForestSchool" | S1 | same as above | S7 |
| shared/cards/__tests__/priority-plan-implementation.test.ts > "C60 Small Potter's Oven asks which oven to return when both match" | S1 | `'choice'` → `'request'` shape mismatch | S7 |
| server/__tests__/farm-choice.test.ts > farm choice > "requires an explicit payment choice when multiple room payments are legal" | S1 | farm payment `'choice'` → `'request'` shape mismatch | S7 |

## Resolved skips

| Test | Originally skipped in | Resolved in | Notes |
|---|---|---|---|
