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
