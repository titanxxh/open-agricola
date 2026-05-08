# Sprint S6a: Contract Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `shared/contract/` (pure-type only) + `shared/utils/` directories; migrate `shared/game/`, `shared/logic/`, `shared/protocol/` contents to their new homes (contract / domain / session / utils / cards-display); split `shared/cards/types.ts` into 3 files. Zero behavior change — pure file/import migration.

**Architecture:** 4-phase migration via `git mv` + sed batch replace. Each phase ends with `pnpm test:fast` green and a single commit. No codemod script needed — migration is one-shot.

**Tech Stack:** TypeScript, Vitest (`pnpm test:fast`), ESLint (`pnpm run lint`), Vite (`pnpm run build`).

**Spec:** `docs/superpowers/specs/2026-05-08-sprint-S6-physical-layering-design.md` §1 (S6a section).

**Setup:** worktree `.worktree/sprint-S6a` on branch `sprint-S6a-contract` from main.

---

## File Structure

| File | Action |
|------|--------|
| `shared/contract/types.ts` | Create (from `shared/game/types.ts`) |
| `shared/contract/prompt-keys.ts` | Create (from `shared/game/prompt-keys.ts`) |
| `shared/contract/resource-keys.ts` | Create (from `shared/game/resource-keys.ts`) |
| `shared/contract/animals.ts` | Create (type half from `shared/game/animals.ts`) |
| `shared/contract/cards.ts` | Create (type half from `shared/cards/types.ts`) |
| `shared/contract/protocol/game.ts` | Create (from `shared/protocol/game.ts`) |
| `shared/contract/protocol/ws.ts` | Create (from `shared/protocol/ws.ts`) |
| `shared/cards-display/types.ts` | Create (class half from `shared/cards/types.ts`) — S6a creates skeleton + filled exports; S6b populates per-card files |
| `shared/cards-display/_lookup.ts` | Create (from `shared/game/{major,minor}-improvements.ts` + `occupations.ts`) |
| `shared/cards/registry-runtime.ts` | Create (register helper half from `shared/cards/types.ts`) |
| `shared/domain/animals.ts` | Create (runtime half from `shared/game/animals.ts`) |
| `shared/domain/farm.ts` | Create (from `shared/game/farm.ts`) |
| `shared/domain/field.ts` | Create (from `shared/game/field.ts`) |
| `shared/domain/space.ts` | Create (from `shared/game/space.ts`) |
| `shared/domain/player.ts` | Create (from `shared/game/player.ts`) |
| `shared/session/serialization.ts` | Create (from `shared/game/serialization.ts`) |
| `shared/session/state-bootstrap.ts` | Create (from `shared/logic/state.ts`) |
| `shared/session/round.ts` | Create (from `shared/logic/round.ts`) |
| `shared/session/stats.ts` | Create (from `shared/logic/stats.ts`) |
| `shared/session/work-phase-resources.ts` | Create (from `shared/logic/work-phase-resources.ts`) |
| `shared/session/state-constants.ts` | Create (from `shared/logic/state-constants.ts` — runtime, NOT contract per recon) |
| `shared/utils/rng.ts` | Create (from `shared/logic/rng.ts`) |
| `client/utils/format.ts` | Create (from `shared/logic/format.ts`) |
| `shared/game/`, `shared/logic/`, `shared/protocol/` | Delete (after all files moved) |

**Note (correction from spec §1.2):** `shared/logic/state-constants.ts` is NOT pure const (contains `normalizeFenceSegments`, `generateRoundActionOrder`, imports rng + domain helpers) — moves to `shared/session/state-constants.ts` as one whole file.

---

## Phase A: Skeleton + Protocol Migration

### Task A1: Create new directory skeletons

**Files:**
- Create: `shared/contract/.gitkeep`, `shared/contract/protocol/.gitkeep`
- Create: `shared/utils/.gitkeep`
- Create: `client/utils/.gitkeep`

- [ ] **Step 1: Create dirs and gitkeep**

```bash
mkdir -p shared/contract/protocol shared/utils client/utils
touch shared/contract/.gitkeep shared/contract/protocol/.gitkeep shared/utils/.gitkeep client/utils/.gitkeep
```

- [ ] **Step 2: Verify**

```bash
ls -d shared/contract/ shared/contract/protocol/ shared/utils/ client/utils/
```
Expected: all 4 dirs exist.

- [ ] **Step 3: Commit**

```bash
git add shared/contract shared/utils client/utils
git commit -m "chore(s6a): create contract/utils/client-utils skeleton dirs (Phase A)"
```

---

### Task A2: Move shared/protocol/* → shared/contract/protocol/*

**Files:**
- Move: `shared/protocol/game.ts` → `shared/contract/protocol/game.ts`
- Move: `shared/protocol/ws.ts` → `shared/contract/protocol/ws.ts`
- Delete `shared/protocol/.gitkeep`, `shared/contract/protocol/.gitkeep` once files exist

- [ ] **Step 1: git-mv the two files**

```bash
git mv shared/protocol/game.ts shared/contract/protocol/game.ts
git mv shared/protocol/ws.ts shared/contract/protocol/ws.ts
rm shared/contract/protocol/.gitkeep
rmdir shared/protocol
```

- [ ] **Step 2: Find all importers**

```bash
grep -rln "shared/protocol/\|from '../protocol/\|from '../../protocol/\|from '../../../protocol/" shared/ server/ client/ scripts/ 2>/dev/null
```

- [ ] **Step 3: Batch update imports**

Use `sed -i` on each file found:

```bash
# Replace `shared/protocol/` with `shared/contract/protocol/`
grep -rl "shared/protocol/" shared/ server/ client/ scripts/ 2>/dev/null | xargs -r sed -i 's|shared/protocol/|shared/contract/protocol/|g'
# Relative paths like `../protocol/` → `../contract/protocol/` (only apply where target dir is shared/)
grep -rl "from '\.\./protocol/" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./protocol/|from '../contract/protocol/|g"
grep -rl "from '\.\./\.\./protocol/" shared/ server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./protocol/|from '../../contract/protocol/|g"
grep -rl "from '\.\./\.\./\.\./protocol/" client/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./\\.\\./protocol/|from '../../../shared/contract/protocol/|g"
```

- [ ] **Step 4: Run test:fast**

```bash
pnpm test:fast 2>&1 | tail -5
```
Expected: 2271 pass / 0 fail.

- [ ] **Step 5: Run tsc**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -10
pnpm exec tsc -p tsconfig.server.json --noEmit 2>&1 | grep -v node_modules | head -10
```
Expected: empty output (0 errors).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(s6a): move shared/protocol/* → shared/contract/protocol/* (Phase A)"
```

---

## Phase B: shared/game/types.ts → shared/contract/types.ts

### Task B1: Move types.ts (whole file — verified pure type-only via grep)

**Files:**
- Move: `shared/game/types.ts` → `shared/contract/types.ts`

- [ ] **Step 1: Move file**

```bash
git mv shared/game/types.ts shared/contract/types.ts
```

- [ ] **Step 2: Find importers**

```bash
grep -rln "shared/game/types\|from '../game/types\|from '../../game/types\|from '../../../game/types\|from './types'" shared/ server/ client/ scripts/ 2>/dev/null | head -30
```

(Note: `from './types'` matches files inside `shared/game/`, but those will be moved later — for now we expect these are still siblings in `shared/game/*`. Don't sed those in this task; only fix cross-directory imports.)

- [ ] **Step 3: Batch update cross-dir imports**

```bash
# absolute-style
grep -rl "shared/game/types" shared/ server/ client/ scripts/ 2>/dev/null | xargs -r sed -i 's|shared/game/types|shared/contract/types|g'
# 1-up relative (from siblings of shared/game/, e.g. shared/cards/X.ts → ../game/types)
grep -rl "from '\.\./game/types" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./game/types|from '../contract/types|g"
# 2-up (from shared/cards/A/X.ts → ../../game/types)
grep -rl "from '\.\./\.\./game/types" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./game/types|from '../../contract/types|g"
# server (from server/X.ts → ../shared/game/types)
grep -rl "from '\.\./shared/game/types" server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./shared/game/types|from '../shared/contract/types|g"
grep -rl "from '\.\./\.\./shared/game/types" server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/game/types|from '../../shared/contract/types|g"
# client
grep -rl "from '\.\./\.\./shared/game/types" client/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/game/types|from '../../shared/contract/types|g"
grep -rl "from '\.\./\.\./\.\./shared/game/types" client/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./\\.\\./shared/game/types|from '../../../shared/contract/types|g"
```

- [ ] **Step 4: Update `from './types'` inside shared/game/* siblings (they import the now-moved file)**

```bash
# shared/game/animals.ts, farm.ts etc. used to do `from './types'` — now they need `from '../contract/types'`
grep -rl "from '\\./types'" shared/game/ 2>/dev/null | xargs -r sed -i "s|from '\\./types'|from '../contract/types'|g"
```

- [ ] **Step 5: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
```
Expected: 2271 pass / 0 fail; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(s6a): move shared/game/types.ts → shared/contract/types.ts (Phase B)"
```

---

## Phase C: prompt-keys, resource-keys, cards/types.ts split

### Task C1: Move prompt-keys.ts and resource-keys.ts

**Files:**
- Move: `shared/game/prompt-keys.ts` → `shared/contract/prompt-keys.ts`
- Move: `shared/game/resource-keys.ts` → `shared/contract/resource-keys.ts`

- [ ] **Step 1: Move files**

```bash
git mv shared/game/prompt-keys.ts shared/contract/prompt-keys.ts
git mv shared/game/resource-keys.ts shared/contract/resource-keys.ts
```

- [ ] **Step 2: Batch update imports**

```bash
for kind in prompt-keys resource-keys; do
  grep -rl "shared/game/$kind" shared/ server/ client/ scripts/ 2>/dev/null | xargs -r sed -i "s|shared/game/$kind|shared/contract/$kind|g"
  grep -rl "from '\.\./game/$kind" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./game/$kind|from '../contract/$kind|g"
  grep -rl "from '\.\./\.\./game/$kind" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./game/$kind|from '../../contract/$kind|g"
  grep -rl "from '\.\./shared/game/$kind" server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./shared/game/$kind|from '../shared/contract/$kind|g"
  grep -rl "from '\.\./\.\./shared/game/$kind" client/ server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/game/$kind|from '../../shared/contract/$kind|g"
done
```

- [ ] **Step 3: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3 && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
```
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(s6a): move prompt-keys + resource-keys to shared/contract/ (Phase C1)"
```

---

### Task C2: Split shared/cards/types.ts into 3 files

**Files:**
- Create: `shared/contract/cards.ts` (pure types)
- Create: `shared/cards-display/types.ts` (class hierarchy)
- Create: `shared/cards/registry-runtime.ts` (runtime register helpers)
- Modify: `shared/cards/types.ts` (becomes a re-export aggregate to preserve existing import paths during transition)

- [ ] **Step 1: Read current `shared/cards/types.ts` end-to-end to identify exact boundaries**

```bash
wc -l shared/cards/types.ts
grep -nE "^export\s+(type|class|const)" shared/cards/types.ts
```
Expected output reference (already verified): types at lines 1-90, register helpers at 91-117 + 211-215, classes at 119-209.

- [ ] **Step 2: Create `shared/contract/cards.ts`**

Content (extract pure types from current types.ts):

```typescript
// Pure card-related types. Sourced from S6a split of shared/cards/types.ts.
import type { Resource } from './types'
import type { CostModifier, BonusModifier, ComplexCost } from './types'

export type CardType = 'major' | 'minor' | 'occupation'

export type ExchangeWindow = 'anytime' | 'harvest' | 'bake-bread'

export type CardExchange = {
  // ... copy from current shared/cards/types.ts L7-26 verbatim
}

export type CardPrerequisites = {
  // ... copy from current shared/cards/types.ts L28-31 verbatim
}

export type CardDefinition = {
  // ... copy from current shared/cards/types.ts L33-89 verbatim
}
```

(Engineer: open `shared/cards/types.ts`, copy lines 1-89 verbatim to the new file, prepend the contract-types import line. Adjust `import` lines as needed.)

- [ ] **Step 3: Create `shared/cards-display/types.ts`**

Content (extract class hierarchy + getRegistered* lookup):

```typescript
// Card display class hierarchy. Sourced from S6a split of shared/cards/types.ts.
// Owns: CardBase + 3 subclass markers + ad-hoc lookup map for tests.
// Production lookup is wired by `shared/cards/registry-runtime.ts` via registerCardLookups().

import type { Resource } from '../contract/types'
import type { CardType, CostModifier, ComplexCost, CardExchange, CardPrerequisites } from '../contract/cards'
import type { CardDefinition } from '../contract/cards'

// Late-bound lookup hooks installed by registry-runtime.ts.
let minorLookup: ((id: string) => CardBase | undefined) | undefined
let occupationLookup: ((id: string) => CardBase | undefined) | undefined

export const __setMinorLookup = (fn: ((id: string) => CardBase | undefined) | undefined): void => { minorLookup = fn }
export const __setOccupationLookup = (fn: ((id: string) => CardBase | undefined) | undefined): void => { occupationLookup = fn }

const adHocMinors = new Map<string, CardBase>()
const adHocOccupations = new Map<string, CardBase>()

export const __getAdHocMinors = (): Map<string, CardBase> => adHocMinors
export const __getAdHocOccupations = (): Map<string, CardBase> => adHocOccupations

export class CardBase {
  // ... copy fields + constructor + toJSON from current shared/cards/types.ts L119-203
}

export class MinorImprovement extends CardBase {}
export class Occupation extends CardBase {}
export class PlayerActionCard extends CardBase {}

export const getRegisteredMinorImprovement = (id: string): CardBase | undefined =>
  minorLookup?.(id) ?? adHocMinors.get(id)

export const getRegisteredOccupation = (id: string): CardBase | undefined =>
  occupationLookup?.(id) ?? adHocOccupations.get(id)
```

(Engineer: copy `CardBase` class verbatim from L119-203 of current `shared/cards/types.ts`.)

- [ ] **Step 4: Create `shared/cards/registry-runtime.ts`**

```typescript
// Runtime registration helpers. Sourced from S6a split of shared/cards/types.ts.
// Provides registerCardLookups() and registerAdHoc{Minor,Occupation} that
// install lookup functions into shared/cards-display/types.ts.

import {
  CardBase,
  __setMinorLookup,
  __setOccupationLookup,
  __getAdHocMinors,
  __getAdHocOccupations,
} from '../cards-display/types'

export const registerCardLookups = (lookups: {
  minor: (id: string) => CardBase | undefined
  occupation: (id: string) => CardBase | undefined
}): void => {
  __setMinorLookup(lookups.minor)
  __setOccupationLookup(lookups.occupation)
}

export const registerAdHocMinorImprovement = (card: CardBase): void => {
  __getAdHocMinors().set(card.id, card)
}

export const registerAdHocOccupation = (card: CardBase): void => {
  __getAdHocOccupations().set(card.id, card)
}
```

- [ ] **Step 5: Replace `shared/cards/types.ts` with re-export aggregate**

```typescript
// S6a transition shim — preserves existing `from './types'` / `from '../types'`
// imports across all 824 card files. S6b will rewrite card imports directly to
// `shared/cards-display/types` and `shared/contract/cards`, after which this
// shim can be deleted.

export type {
  CardType,
  ExchangeWindow,
  CardExchange,
  CardPrerequisites,
  CardDefinition,
} from '../contract/cards'

export {
  CardBase,
  MinorImprovement,
  Occupation,
  PlayerActionCard,
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
} from '../cards-display/types'

export {
  registerCardLookups,
  registerAdHocMinorImprovement,
  registerAdHocOccupation,
} from './registry-runtime'
```

- [ ] **Step 6: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3 && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -10
```
Expected: 2271 pass / 0 fail; tsc clean. The shim ensures all existing imports resolve.

- [ ] **Step 7: Update `shared/cards/catalog.ts` import for `registerCardLookups`**

```bash
grep -n "registerCardLookups" shared/cards/catalog.ts
```
Should still work via the shim. But for clarity, update to direct import:

```bash
sed -i "s|from './types'|from './registry-runtime'|" shared/cards/catalog.ts
```

Verify the edit only affects the `registerCardLookups` import line (catalog imports both types and registry helper from `./types` historically; check):

```bash
grep -nB1 -A1 "registerCardLookups\|MinorImprovement,\|Occupation,\|PlayerActionCard" shared/cards/catalog.ts | head -30
```

If catalog imports BOTH classes and `registerCardLookups` from `./types` in a single import statement, undo the sed and split the import manually:

```typescript
// Old:
import { MinorImprovement, Occupation, PlayerActionCard, registerCardLookups } from './types'
// New:
import { MinorImprovement, Occupation, PlayerActionCard } from './types'  // still via shim
import { registerCardLookups } from './registry-runtime'
```

- [ ] **Step 8: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3 && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
```
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(s6a): split shared/cards/types.ts into contract/cards + cards-display/types + cards/registry-runtime (Phase C2)"
```

---

## Phase D: Runtime files migration + cleanup

### Task D1: Move shared/game/animals.ts (split type vs runtime)

**Files:**
- Create: `shared/contract/animals.ts` (just `export type AnimalKey = 'sheep' | 'boar' | 'cattle'`)
- Move: `shared/game/animals.ts` → `shared/domain/animals.ts` (runtime helpers)

- [ ] **Step 1: Create `shared/contract/animals.ts`**

```typescript
// Pure type. Sourced from S6a split of shared/game/animals.ts.
export type AnimalKey = 'sheep' | 'boar' | 'cattle'
```

- [ ] **Step 2: Move runtime + update internal type import**

```bash
git mv shared/game/animals.ts shared/domain/animals.ts
# Inside the moved file: replace `export type AnimalKey =` with `import type { AnimalKey } from '../contract/animals'\nexport type { AnimalKey }` and update any internal references.
```

Edit `shared/domain/animals.ts` manually:

```typescript
import type { PlayerState } from '../contract/types'
import type { AnimalKey } from '../contract/animals'
export type { AnimalKey }  // re-export for back-compat

const ZERO: Record<AnimalKey, number> = { sheep: 0, boar: 0, cattle: 0 }

const isAnimalKey = (s: unknown): s is AnimalKey =>
  s === 'sheep' || s === 'boar' || s === 'cattle'

// ... rest of original file unchanged
```

- [ ] **Step 3: Batch update imports**

```bash
grep -rl "shared/game/animals" shared/ server/ client/ scripts/ 2>/dev/null | xargs -r sed -i 's|shared/game/animals|shared/domain/animals|g'
grep -rl "from '\.\./game/animals" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./game/animals|from '../domain/animals|g"
grep -rl "from '\.\./\.\./game/animals" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./game/animals|from '../../domain/animals|g"
grep -rl "from '\.\./shared/game/animals" server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./shared/game/animals|from '../shared/domain/animals|g"
grep -rl "from '\.\./\.\./shared/game/animals" client/ server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/game/animals|from '../../shared/domain/animals|g"
```

- [ ] **Step 4: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3 && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(s6a): split animals → contract/animals (type) + domain/animals (runtime) (Phase D1)"
```

---

### Task D2: Move shared/game/{farm,field,space,player}.ts → shared/domain/

**Files:**
- Move: `shared/game/farm.ts` → `shared/domain/farm.ts`
- Move: `shared/game/field.ts` → `shared/domain/field.ts`
- Move: `shared/game/space.ts` → `shared/domain/space.ts`
- Move: `shared/game/player.ts` → `shared/domain/player.ts`

- [ ] **Step 1: Move 4 files**

```bash
for f in farm field space player; do
  git mv shared/game/$f.ts shared/domain/$f.ts
done
```

- [ ] **Step 2: Update internal type imports inside each moved file**

Each moved file probably had `import { ... } from './types'` (was `shared/game/types`, now moved to `shared/contract/types`). Already handled by Phase B's `from './types'` sed inside `shared/game/`, but those files are now in `shared/domain/`. Verify and fix:

```bash
grep -nE "from '\\.\\./game/types|from '\\.\\./contract/types|from '\\./types'" shared/domain/farm.ts shared/domain/field.ts shared/domain/space.ts shared/domain/player.ts
```

If any line still says `from './types'` or `from '../game/types'`, fix:

```bash
sed -i "s|from '\\.\\./game/types|from '../contract/types|g" shared/domain/{farm,field,space,player}.ts
sed -i "s|from '\\./types'|from '../contract/types'|g" shared/domain/{farm,field,space,player}.ts
```

- [ ] **Step 3: Batch update cross-dir imports**

```bash
for f in farm field space player; do
  grep -rl "shared/game/$f" shared/ server/ client/ scripts/ 2>/dev/null | xargs -r sed -i "s|shared/game/$f|shared/domain/$f|g"
  grep -rl "from '\.\./game/$f" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./game/$f|from '../domain/$f|g"
  grep -rl "from '\.\./\.\./game/$f" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./game/$f|from '../../domain/$f|g"
  grep -rl "from '\.\./shared/game/$f" server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./shared/game/$f|from '../shared/domain/$f|g"
  grep -rl "from '\.\./\.\./shared/game/$f" client/ server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/game/$f|from '../../shared/domain/$f|g"
done
```

- [ ] **Step 4: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3 && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(s6a): move farm/field/space/player from shared/game → shared/domain (Phase D2)"
```

---

### Task D3: Move shared/game/serialization.ts → shared/session/serialization.ts

**Files:**
- Move: `shared/game/serialization.ts` → `shared/session/serialization.ts`

- [ ] **Step 1: Move + fix internal type imports**

```bash
git mv shared/game/serialization.ts shared/session/serialization.ts
# fix internal imports
sed -i "s|from '\\.\\./game/types|from '../contract/types|g" shared/session/serialization.ts
sed -i "s|from '\\./types'|from '../contract/types'|g" shared/session/serialization.ts
```

Manually verify other internal imports if file references e.g. `./player.ts`:

```bash
grep -nE "from '\\.\\./|from '\\./" shared/session/serialization.ts
```

Fix any references to moved siblings (`./player` → `../domain/player`, etc.):

```bash
sed -i "s|from '\\./player'|from '../domain/player'|g" shared/session/serialization.ts
sed -i "s|from '\\./animals'|from '../domain/animals'|g" shared/session/serialization.ts
sed -i "s|from '\\./farm'|from '../domain/farm'|g" shared/session/serialization.ts
sed -i "s|from '\\./field'|from '../domain/field'|g" shared/session/serialization.ts
sed -i "s|from '\\./space'|from '../domain/space'|g" shared/session/serialization.ts
```

- [ ] **Step 2: Batch update cross-dir imports**

```bash
grep -rl "shared/game/serialization" shared/ server/ client/ scripts/ 2>/dev/null | xargs -r sed -i 's|shared/game/serialization|shared/session/serialization|g'
grep -rl "from '\.\./game/serialization" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./game/serialization|from '../session/serialization|g"
grep -rl "from '\.\./\.\./game/serialization" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./game/serialization|from '../../session/serialization|g"
grep -rl "from '\.\./shared/game/serialization" server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./shared/game/serialization|from '../shared/session/serialization|g"
grep -rl "from '\.\./\.\./shared/game/serialization" client/ server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/game/serialization|from '../../shared/session/serialization|g"
```

- [ ] **Step 3: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3 && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(s6a): move serialization.ts → shared/session/serialization.ts (Phase D3)"
```

---

### Task D4: Move shared/game/{major,minor}-improvements.ts + occupations.ts → shared/cards-display/_lookup.ts

**Files:**
- Move 3 small files (150–590 bytes each) into a single consolidated `shared/cards-display/_lookup.ts`

- [ ] **Step 1: Read content of 3 source files**

```bash
cat shared/game/major-improvements.ts shared/game/minor-improvements.ts shared/game/occupations.ts
```

- [ ] **Step 2: Create `shared/cards-display/_lookup.ts`**

Combine all 3 files' contents into one. Update internal imports to point at `shared/contract/types` and `shared/cards-display/types`.

Example structure (engineer tailors based on actual content):

```typescript
// Consolidated card-id lookup. Sourced from S6a merge of:
// - shared/game/major-improvements.ts
// - shared/game/minor-improvements.ts
// - shared/game/occupations.ts

// ... merged content
```

- [ ] **Step 3: Delete the 3 source files**

```bash
git rm shared/game/major-improvements.ts shared/game/minor-improvements.ts shared/game/occupations.ts
```

- [ ] **Step 4: Batch update imports**

```bash
for f in major-improvements minor-improvements occupations; do
  grep -rl "shared/game/$f" shared/ server/ client/ scripts/ 2>/dev/null | xargs -r sed -i "s|shared/game/$f|shared/cards-display/_lookup|g"
  grep -rl "from '\.\./game/$f" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./game/$f|from '../cards-display/_lookup|g"
  grep -rl "from '\.\./\.\./game/$f" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./game/$f|from '../../cards-display/_lookup|g"
  grep -rl "from '\.\./shared/game/$f" server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./shared/game/$f|from '../shared/cards-display/_lookup|g"
  grep -rl "from '\.\./\.\./shared/game/$f" client/ server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/game/$f|from '../../shared/cards-display/_lookup|g"
done
```

- [ ] **Step 5: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3 && pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(s6a): consolidate {major,minor}-improvements + occupations → shared/cards-display/_lookup.ts (Phase D4)"
```

---

### Task D5: Move shared/logic/* → shared/session/* and shared/utils/

**Files (one batch since they're all related runtime modules):**
- Move: `shared/logic/state.ts` → `shared/session/state-bootstrap.ts`
- Move: `shared/logic/round.ts` → `shared/session/round.ts`
- Move: `shared/logic/stats.ts` → `shared/session/stats.ts`
- Move: `shared/logic/work-phase-resources.ts` → `shared/session/work-phase-resources.ts`
- Move: `shared/logic/state-constants.ts` → `shared/session/state-constants.ts`
- Move: `shared/logic/rng.ts` → `shared/utils/rng.ts`
- Move: `shared/logic/format.ts` → `client/utils/format.ts`

- [ ] **Step 1: Move all 7 files**

```bash
git mv shared/logic/state.ts shared/session/state-bootstrap.ts
git mv shared/logic/round.ts shared/session/round.ts
git mv shared/logic/stats.ts shared/session/stats.ts
git mv shared/logic/work-phase-resources.ts shared/session/work-phase-resources.ts
git mv shared/logic/state-constants.ts shared/session/state-constants.ts
git mv shared/logic/rng.ts shared/utils/rng.ts
git mv shared/logic/format.ts client/utils/format.ts
```

- [ ] **Step 2: Fix internal cross-references inside moved files**

Each moved file had `from '../game/types'` (now `../contract/types`), some had `from './rng'` (now `../utils/rng`), `from '../domain/farmyard'` (unchanged), etc. Fix per-file:

```bash
# state-bootstrap.ts (originally logic/state.ts)
sed -i "s|from '\\.\\./game/types|from '../contract/types|g" shared/session/state-bootstrap.ts
sed -i "s|from '\\./rng'|from '../utils/rng'|g" shared/session/state-bootstrap.ts
sed -i "s|from '\\./state-constants'|from './state-constants'|g" shared/session/state-bootstrap.ts  # sibling, unchanged
sed -i "s|from '\\.\\./domain/|from '../domain/|g" shared/session/state-bootstrap.ts  # unchanged
sed -i "s|from '\\.\\./draft/|from '../draft/|g" shared/session/state-bootstrap.ts  # unchanged

# state-constants.ts (originally logic/state-constants.ts)
sed -i "s|from '\\.\\./game/types|from '../contract/types|g" shared/session/state-constants.ts
sed -i "s|from '\\./rng'|from '../utils/rng'|g" shared/session/state-constants.ts
sed -i "s|from '\\.\\./domain/|from '../domain/|g" shared/session/state-constants.ts
sed -i "s|from '\\.\\./draft/|from '../draft/|g" shared/session/state-constants.ts

# round.ts, stats.ts, work-phase-resources.ts
for f in round stats work-phase-resources; do
  sed -i "s|from '\\.\\./game/types|from '../contract/types|g" shared/session/$f.ts
  sed -i "s|from '\\./rng'|from '../utils/rng'|g" shared/session/$f.ts
done

# rng.ts (originally logic/rng.ts) — typically only imports nothing, but verify
grep -n "^import" shared/utils/rng.ts

# format.ts in client/utils — fix imports if any
grep -n "^import" client/utils/format.ts
sed -i "s|from '\\.\\./\\.\\./game/types|from '../../shared/contract/types|g" client/utils/format.ts
```

- [ ] **Step 3: Batch update cross-dir imports**

```bash
# logic/state → session/state-bootstrap (renamed!)
for src_dst in 'logic/state:session/state-bootstrap' 'logic/round:session/round' 'logic/stats:session/stats' 'logic/work-phase-resources:session/work-phase-resources' 'logic/state-constants:session/state-constants' 'logic/rng:utils/rng'; do
  src="${src_dst%:*}"
  dst="${src_dst#*:}"
  grep -rl "shared/$src" shared/ server/ client/ scripts/ 2>/dev/null | xargs -r sed -i "s|shared/$src|shared/$dst|g"
  grep -rl "from '\\.\\./$src" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./$src|from '../$dst|g"
  grep -rl "from '\\.\\./\\.\\./$src" shared/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./$src|from '../../$dst|g"
  grep -rl "from '\\.\\./shared/$src" server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./shared/$src|from '../shared/$dst|g"
  grep -rl "from '\\.\\./\\.\\./shared/$src" client/ server/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/$src|from '../../shared/$dst|g"
done

# logic/format → client/utils/format (cross-layer move; only client uses it)
grep -rl "shared/logic/format" client/ 2>/dev/null | xargs -r sed -i 's|shared/logic/format|client/utils/format|g'
grep -rl "from '\\.\\./\\.\\./shared/logic/format" client/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./shared/logic/format|from '../utils/format|g"
grep -rl "from '\\.\\./\\.\\./\\.\\./shared/logic/format" client/ 2>/dev/null | xargs -r sed -i "s|from '\\.\\./\\.\\./\\.\\./shared/logic/format|from '../../utils/format|g"
```

- [ ] **Step 4: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -10
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -10
pnpm exec tsc -p tsconfig.server.json --noEmit 2>&1 | grep -v node_modules | head -10
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(s6a): move shared/logic/* → session/utils/client-utils (Phase D5)"
```

---

### Task D6: Delete empty directories

**Files:**
- Delete (rmdir): `shared/game/`, `shared/logic/`

- [ ] **Step 1: Verify no files left in either**

```bash
ls shared/game/ shared/logic/ 2>&1
```
Expected: empty (only `__tests__/` may remain — handle separately if so).

- [ ] **Step 2: Move test directories if any**

```bash
ls shared/game/__tests__/ shared/logic/__tests__/ 2>&1
```

If they exist, the tests may have been moved with their target files (test files for `farm.ts` go with farm.ts to `shared/domain/__tests__/`). If standalone tests remain, decide per file:
- Tests of types (e.g. type-only tests) → delete or move to `shared/contract/__tests__/`
- Tests of moved runtime → already moved with the file

For each test:
```bash
ls shared/game/__tests__/ 2>/dev/null
# For each xxx.test.ts found:
# - if it tests an animal/farm/field/space/player function, move to shared/domain/__tests__/
# - if it tests a type guard, decide (probably move to shared/contract/__tests__/)
```

Move with `git mv` per case, then update internal imports in moved test files.

- [ ] **Step 3: rmdir empty dirs**

```bash
[ -d shared/game ] && rmdir shared/game
[ -d shared/logic ] && rmdir shared/logic
```

- [ ] **Step 4: Verify directories gone**

```bash
ls shared/ | grep -E "^game$|^logic$|^protocol$"
```
Expected: no output.

- [ ] **Step 5: Run test:fast + tsc + lint + build**

```bash
pnpm test:fast 2>&1 | tail -3
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
pnpm exec tsc -p tsconfig.server.json --noEmit 2>&1 | grep -v node_modules | head -5
pnpm run lint 2>&1 | tail -3
pnpm run build 2>&1 | tail -5
```

Expected:
- test:fast: 2271 pass / 0 fail
- tsc: 0 errors
- lint: 0 errors (warns OK)
- build: success
- main bundle ≈ same as before S6a (~541 KB raw)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(s6a): delete empty shared/game and shared/logic directories (Phase D6)"
```

---

## Phase E: Final verification + push

### Task E1: Sanity grep — no leftover old paths

- [ ] **Step 1: Grep for any leftover references**

```bash
echo "=== leftover shared/game ==="
grep -rln "shared/game/" shared/ server/ client/ scripts/ 2>/dev/null | head -5

echo "=== leftover shared/logic ==="
grep -rln "shared/logic/" shared/ server/ client/ scripts/ 2>/dev/null | head -5

echo "=== leftover shared/protocol ==="
grep -rln "shared/protocol/" shared/ server/ client/ scripts/ 2>/dev/null | head -5

echo "=== leftover relative ../game ==="
grep -rln "from '\\.\\./game/\|from '\\.\\./\\.\\./game/" shared/ 2>/dev/null | head -5

echo "=== leftover relative ../logic ==="
grep -rln "from '\\.\\./logic/\|from '\\.\\./\\.\\./logic/" shared/ 2>/dev/null | head -5
```

Expected: all blocks empty (no leftover).

If any leftover found, fix with sed and rerun grep. Commit any fixes:

```bash
git add -A
git commit -m "refactor(s6a): mop up leftover legacy import paths"
```

---

### Task E2: Push and wait for CI

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline | head -10
```

Expected: ~10 commits on `sprint-S6a-contract` (Phase A: 2, Phase B: 1, Phase C: 2, Phase D: 6, Phase E: 0–1). All `refactor(s6a):` prefix.

- [ ] **Step 2: Fast-forward main + push**

```bash
git fetch origin main
git checkout main
git merge --ff-only sprint-S6a-contract
git push origin main
```

- [ ] **Step 3: Wait for GitHub Actions all green**

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
HEAD_SHA=$(git rev-parse HEAD)
curl -s -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=5" | jq -r ".workflow_runs[] | select(.head_sha == \"$HEAD_SHA\") | \"\\(.name) | \\(.status) | \\(.conclusion)\""
```

Expected (after ~5–10 min): CI / Deploy Backend / Deploy Frontend all `completed | success`.

---

## DoD Checklist

After all tasks complete:

- [ ] D1: `shared/contract/`, `shared/utils/`, `client/utils/` directories exist
- [ ] D2: `shared/game/`, `shared/logic/`, `shared/protocol/` directories deleted (`ls shared/ | grep -E "game|logic|protocol"` empty)
- [ ] D3: `shared/cards/types.ts` is a thin re-export shim (S6b will inline + delete)
- [ ] D4: `shared/contract/cards.ts`, `shared/cards-display/types.ts`, `shared/cards/registry-runtime.ts` all exist with correct content
- [ ] D5: `pnpm test:fast` 2271 pass / 0 fail
- [ ] D6: `pnpm exec tsc -p tsconfig.app.json --noEmit` and `tsc -p tsconfig.server.json --noEmit` 0 errors
- [ ] D7: `pnpm run lint` 0 errors
- [ ] D8: `pnpm run build` success; main bundle ≈ 541 KB raw (unchanged — S6a doesn't shrink bundle, S6b does)
- [ ] D9: GitHub Actions CI / Deploy Backend / Deploy Frontend all green

S6b unblocked once S6a lands on main.
