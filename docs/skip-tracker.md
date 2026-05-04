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
| server/__tests__/B104_SheepWalker-session.test.ts > B104_SheepWalker session — last harvest enforcement > "forces animalReorg in last harvest even when no breeding occurs (single sheep)" | S1 | `'choice'` → `'request'` shape mismatch (slow suite) | S7 |
| server/__tests__/B146_Illusionist-session.test.ts > discard-from-hand action > "is registered via internalActionDefinitions and exposes choice" | S1 | `'choice'` → `'request'` shape mismatch (slow suite) | S7 |
| server/__tests__/B72_LoveforAgriculture-session.test.ts > B72_LoveforAgriculture session > sow in pasture > "does NOT allow sowing in a size-3+ pasture" | S1 | `resolveChoice('sow')` now succeeds via request path; assertion expects fail | S7 |
| server/__tests__/C104_Collector-multiselect-session.test.ts > C104 — multi-select session (player action space) > "1st use: emits choice with needed=6 and resolves to begging+6 distinct goods" | S1 | `'choice'` → `'request'` shape mismatch (slow suite) | S7 |
| server/__tests__/C104_Collector-multiselect-session.test.ts > C104 — multi-select session (player action space) > "2nd use: needed=7 (after first use bumps the counter)" | S1 | same as above | S7 |
| server/__tests__/C104_Collector-multiselect-session.test.ts > C104 — multi-select session (player action space) > "insufficient selections: re-emits same choice (needed unchanged, no flow)" | S1 | same as above | S7 |
| server/__tests__/C146_WorkshopAssistant-multiselect-session.test.ts > C146 — multi-select pairs (onBuy) > "n=3: emits choice with needed=3, accepts WC,CS,RS → gains wood+2*clay+stone+reed+stone" | S1 | `'choice'` → `'request'` shape mismatch (slow suite) | S7 |
| server/__tests__/C146_WorkshopAssistant-multiselect-session.test.ts > C146 — multi-select pairs (onBuy) > "n=3 with insufficient selections (WC only): re-emits same choice" | S1 | same as above | S7 |
| server/__tests__/C146_WorkshopAssistant-multiselect-session.test.ts > C146 — multi-select pairs (onBuy) > "n=3: duplicate selections collapse and re-emit when unique count is short" | S1 | same as above | S7 |
| server/__tests__/C70_LettucePatch-session.test.ts > C70_LettucePatch session > sow - only vegetable sowable > "does NOT allow sowing grain in the card field" | S1 | `resolveChoice('sow')` now succeeds via request path; assertion expects fail | S7 |
| server/__tests__/C70_LettucePatch-session.test.ts > C70_LettucePatch session > not sowable when crop exists > "does not show card field as sowable when crop already exists" | S1 | same as above | S7 |
| server/__tests__/C70_LettucePatch-session.test.ts > C70_LettucePatch session > isDoable listener > "sow NOT doable without the card" | S1 | same as above | S7 |
| server/__tests__/D131_CraftsmanshipPromoter-session.test.ts > D131_CraftsmanshipPromoter session integration > "cost-unaffordable: bottom-row majors filtered out" | S1 | minor-improvement choice options narrowing on `'choice'` shape | S7 |
| server/__tests__/E70_CropRotationField-session.test.ts > E70_CropRotationField session > sowing on card field > "fromSelectedFields rejects committing a different extra sow field" | S1 | test mutates private `session.pending` / `activeSpaceId` which are now getter-only after Task 10 | S7 |
| server/__tests__/E70_CropRotationField-session.test.ts > E70_CropRotationField session > isDoable listener > "sow is not doable when card already has crop and no regular fields" | S1 | `resolveChoice('sow')` now succeeds via request path; assertion expects fail | S7 |

## Resolved skips

| Test | Originally skipped in | Resolved in | Notes |
|---|---|---|---|
