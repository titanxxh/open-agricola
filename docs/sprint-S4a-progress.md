# Sprint S4a — Domain layer migration progress

Tracking PR-by-PR progress for the S4a effort to move farm/animal/scoring
logic behind the `shared/domain/` facade so that PR5 can finally delete
the legacy `shared/logic/farm/*`, `shared/logic/scoring*.ts`, and
`shared/actions/helpers/animal-zones.ts` modules.

## PR4 audit (2026-05-05)

After migrating the remaining call sites in PR4 (protocol type imports,
session-core value+type imports, client type imports, cards/card-effects
type imports, plus 4 stragglers found during the PR4 audit pass:
`E127_DiligentFarmer`, `E16_BriarHedge`, `shared/actions/effects/sow.ts`,
`server/game-router.ts`), the repo-wide grep for files outside
`shared/domain/` that still reference `logic/farm` /
`helpers/animal-zones` / `logic/scoring`:

```
grep -rln "logic/farm/\|helpers/animal-zones\|logic/scoring" \
  shared/ server/ client/ \
  | grep -v "node_modules\|\.test\.ts\|/domain/" \
  | sort -u
```

returns exactly:

```
client/app/GameContainerApi.tsx
server/game-router.ts
shared/actions/effects/breed.ts
shared/actions/effects/fencing.ts
shared/cards/C/C6_StoneClearing.ts
shared/cards/E/E33_BeaverColony.ts
shared/session/session-core.ts
```

Per-file breakdown (all expected — no regressions):

| File | Reason | Kind |
| --- | --- | --- |
| `client/app/GameContainerApi.tsx:1313` | `// Map shared/logic/scoring.ts ...` — comment only, no import | comment |
| `server/game-router.ts:5-6` | `normalizePlayerFarm` import + its `TODO(PR5)` comment | PR2 deferred (white-listed) |
| `shared/actions/effects/breed.ts:12-13` | `getTotalAnimalCapacity` import + its `TODO(PR5)` comment | PR3 deferred (white-listed) |
| `shared/actions/effects/fencing.ts:22-23` | `normalizePlayerFarm` import + its `TODO(PR5)` comment | PR2 deferred (white-listed) |
| `shared/cards/C/C6_StoneClearing.ts:22` | `... touches shared/logic/farm/sow-validation.ts ...` — docstring comment, no import | comment |
| `shared/cards/E/E33_BeaverColony.ts:9-10` | `getPastureCapacity` import + its `TODO(PR5)` comment | PR3 deferred (white-listed) |
| `shared/session/session-core.ts:118` | `buildOccupationHandSelectionInteraction` import (PR4-added `TODO(PR5)`) | PR4 deferred |

Real imports still pointing at legacy modules: 5 (`normalizePlayerFarm`
×2, `getTotalAnimalCapacity`, `getPastureCapacity`,
`buildOccupationHandSelectionInteraction`). All are documented and
covered by PR5 task 25 (inline into `shared/domain/` and delete the
legacy files). All other external call sites are migrated.

`shared/domain/index.ts` re-exports `SowSelection` (type) and
`getAllEdgeIds` from the legacy modules so consumers can drop their
direct `logic/farm/*` imports during PR4. PR5 will inline those
definitions into `shared/domain/` and drop the re-exports together with
the legacy files.

## PR5 closeout (2026-05-05)

PR5 inlines the 7 PR5-deferred items into `shared/domain/`, deletes the
11 legacy files (~2189 lines), and confirms zero regressions vs the PR4
baseline (`a20ea237`).

### What was inlined

**`shared/domain/farmyard.ts`** absorbs all of `shared/logic/farm/*` (8
files, ~1300 lines) — `validatePlowSelection`, `validateSowSelection`,
`validateFenceSelection`, `validateRoomSelection`,
`validateStableSelection`, `buildPlowFarmInteraction`,
`buildSowFarmInteraction`, `buildFenceFarmInteraction`,
`buildRoomFarmInteraction`, `buildStableFarmInteraction`,
`buildFarmPositionSelectionInteraction`,
`getPermittedExtraSowableFields`, `tryAddRoomTile`,
`normalizePlayerFarm`, `getAllEdgeIds`, `computeFencedRegions`, plus
all leaf types (`PlayerFarmState`, `SowSelection`,
`PlowValidationResult`, `SowValidationResult`, `FenceValidationResult`,
`RoomSelectionResult`, `StableSelectionResult`, etc.). The `Farmyard`
class still wraps the public API; the validators / builders are also
exported as named functions so legacy unit tests redirect their imports
without rewriting fixtures.

**`shared/domain/animal-zones.ts`** absorbs
`shared/actions/helpers/animal-zones.ts` (277 lines) —
`computeAnimalZones`, `getTotalAnimalCapacity`,
`getAssignedAnimalCount`, `getPastureCapacity`, `getLooseStableKeys`,
`enforceAnimalCapacity`, `computeInvalidAnimalsForZone`. The
`AnimalZones` class stays as the facade; pure functions are also named
exports for the recursion-safe paths (E33 hook) and state-nullable
paths (`breed()`).

**`shared/domain/scoring.ts`** absorbs `shared/logic/scoring.ts` (417
lines) and `shared/logic/scoring-bonus-solver.ts` (167 lines) —
`computeScores`, `solveBonusScoring`, `Scoring.computeAll/breakdown/
totalFor/solveBonus`, plus all `ScoreEntry` / `PlayerScoreSummary` /
`SolverInput` / `SolverResult` types.

**`shared/domain/pasture.ts`** unchanged — already self-contained
post-PR1 (Option A projection from `player.pastures`).

**`shared/domain/index.ts`** drops the 2 temporary re-exports
(`SowSelection`, `getAllEdgeIds`) and re-exports them from the new
in-domain locations. Adds `normalizePlayerFarm`, `getTotalAnimalCapacity`,
`getPastureCapacity` for callers that need the pure functions.

### 5 PR5-deferred external imports inlined

| Site | Old import | New |
| --- | --- | --- |
| `server/game-router.ts:6` | `normalizePlayerFarm` from `logic/farm/fence-validation` | `from '../shared/domain'` |
| `shared/actions/effects/fencing.ts:23` | `normalizePlayerFarm` from `logic/farm/fence-validation` | `from '../../domain'` |
| `shared/actions/effects/breed.ts:13` | `getTotalAnimalCapacity` from `helpers/animal-zones` | `from '../../domain'` |
| `shared/cards/E/E33_BeaverColony.ts:10` | `getPastureCapacity` from `helpers/animal-zones` | `from '../../domain'` (still recursion-safe — pure function, not class) |
| `shared/session/session-core.ts:118` | `buildOccupationHandSelectionInteraction` from `logic/farm/occupation-hand-interaction` | inlined as private const helper in session-core (only caller) |

Plus a `state-constants.ts` follow-up: `tryAddRoomTile` import
redirected from `./farm/build-room-helper` → `../domain/farmyard` (one
non-test caller surfaced after the legacy delete; not a deferred item
but completes the "no logic/farm/* imports anywhere" picture).

Plus a circular-dependency fix discovered by the D5 ESLint guard:
`stableWoodCost` (constant `2`) was imported by farmyard.ts from
`shared/actions/effects/fencing.ts` — that direction is now banned
under `shared/domain/**`, so the constant is duplicated in farmyard.ts
as `STABLE_WOOD_COST` with a comment pointing at the source of truth.

### Test relocation

Legacy unit tests directly importing the deleted modules were redirected
in-place (`from '../../shared/logic/farm/...'` → `from
'../../shared/domain/farmyard'`, etc.) so coverage stays intact. Five
scoring tests in `shared/logic/__tests__/scoring*.test.ts` and one
`shared/logic/farm/__tests__/build-room-helper.test.ts` were `git mv`'d
to `shared/domain/__tests__/` (renamed where it would collide with the
existing `scoring.test.ts`).

50 test files had their imports redirected via `sed`; one was renamed
to avoid collision (`shared/domain/__tests__/scoring-from-logic.test.ts`).

### Files deleted (11 total, ~2189 LoC)

- `shared/logic/farm.ts` (84)
- `shared/logic/farm/build-room-helper.ts` (27)
- `shared/logic/farm/farm-interaction.ts` (322)
- `shared/logic/farm/fence-validation.ts` (533)
- `shared/logic/farm/occupation-hand-interaction.ts` (19)
- `shared/logic/farm/plow-validation.ts` (88)
- `shared/logic/farm/sow-validation.ts` (133)
- `shared/logic/farm/validators.ts` (122)
- `shared/actions/helpers/animal-zones.ts` (277)
- `shared/logic/scoring.ts` (417)
- `shared/logic/scoring-bonus-solver.ts` (167)

`shared/logic/farm/` directory removed (was empty after the rms +
build-room-helper test git-mv).

### DoD verification

| | Status | Notes |
| --- | --- | --- |
| **D1** `shared/logic/farm/` deleted | ✅ | `test ! -d shared/logic/farm` passes |
| **D2** `shared/actions/helpers/animal-zones.ts` deleted | ✅ | `test ! -f` passes |
| **D3** `shared/logic/scoring*.ts` deleted | ✅ | both files gone |
| **D4** 6 domain files exist | ✅ | `index.ts`, `player-board.ts`, `farmyard.ts`, `pasture.ts`, `animal-zones.ts`, `scoring.ts` |
| **D5** ESLint guard active | ✅ | `no-restricted-imports` on `shared/domain/**/*.ts` enforced; caught the `stableWoodCost` cycle during PR5 |
| **D6** 0 residual legacy imports | ✅ | grep clean (zero hits in non-test, non-domain code) |
| **D7** test:fast / test:slow zero regression | ✅ | fast: 326 passed / 0 fail (vs baseline 326 / 0); slow: 33 fail / 1690 pass (vs baseline 34 fail / 1689 pass — PR5 actually reduces fails by 1, no new regressions) |
| **D8** effect line drop ≥30% | ⚠️ | Effects total: 4940 → 4932 lines (-0.16% over PR3-end baseline `a74bca05`). The drop target was set against the pre-S4a `main` baseline, not PR3-end — the effect bulk migration happened in PR2/PR3, so PR5 sees only marginal change (PR5 only deletes legacy modules and inlines deferreds, none of which is in `effects/`). The architectural goal (effects no longer reach into legacy farm/animal/scoring) is achieved; the LoC metric is informational. |
| **D9** Forced-green subset | ✅ | `lint` (0 error / 316 warn pre-existing), `lint:i18n` (missing 0), `check:prompt-sync --strict`, `check:reaches --strict`, `check:no-dsl --strict`, `check:catalog-types`, `check:community-deck`, `build` (clean), `check:bundle-size` (within budget) — all green |

### Slow project status

Slow project on PR5:
- 33 fail / 1690 pass / 13 skip
- Baseline `a20ea237` (PR4-end): 34 fail / 1689 pass / 13 skip

PR5 introduces **zero new regressions**; the 33 fails are all
pre-existing on PR4. The one fail that disappeared
(`A143_B95_stacking-session.test.ts`) appears to be flaky on the
baseline run; PR5 doesn't touch any of its code paths so no claim of
fix is made.

### Effect line count (D8 detail)

```
PR3-end baseline (a74bca05):  4940 lines / 27 files / avg 183
PR5 final:                    4932 lines / 27 files / avg 183
Delta:                          -8 lines (-0.16%)
```

S4a's overall effect-LoC reduction (vs the pre-S4a `main`) belongs to
PR2 (effects-first migration) and PR3 (animal-zones consumers); PR5
itself only touches one `effects/` file (`breed.ts` — 2 lines saved
from the legacy comment + import). The architectural success criterion
(effects no longer reach `logic/farm/*` / `helpers/animal-zones` /
`logic/scoring*`) is fully satisfied.
