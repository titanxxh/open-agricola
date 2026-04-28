# Stats × BGA Alignment — Track 1 (Per-card stats + Infobox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand per-card stats from 2 fields (paid/gained) to BGA-equivalent 6 fields (used/gained/paid/saved/receivedPayment/paidToOthers), reformat the FarmBoard tooltip accordingly, and put the existing `cardStates[id].infobox` slot to use on progress-style cards.

**Architecture:** All persistent stats stay in `cardStates[cardId].extraData.resourceStats` (existing storage) so GameState full-snapshot sync covers them with no protocol change. Pseudo-resource keys (`occupation`, `field`, `roomWood`, `roomClay`, `roomStone`, `stable`) are added to the `Resource` type so BGA-style "Plows: N / Built: N rooms" lines reuse the same `gained` slot. Payment stats (`paid` / `saved`) are derived from `PaymentSolution.tradesUsed` / `bonusUsed` via a new `recordPaymentStats` helper — no new cost-tracking machinery.

**Tech Stack:** TypeScript, vitest (unit/session), React (tooltip), shared/server/client three-layer split per project CLAUDE.md.

**Spec:** `docs/superpowers/specs/2026-04-28-stats-bga-alignment-track1-per-card-design.md`

**PR ordering:**
- PR-1 (Tasks 1.x) — types + helpers + unit tests, no integration
- PR-2 (Tasks 2.x) — write-points integration + session tests; depends on PR-1
- PR-3 (Tasks 3.x) — tooltip UI + i18n + UI unit tests; depends on PR-1 only, can run in parallel with PR-2
- PR-4 (Tasks 4.x) — infobox writes on selected cards; independent of PR-2/PR-3, depends on PR-1 (only because writeCardInfobox already exists, no PR-1 surface needed — actually independent)

---

## PR-1 — Type extensions + helpers + unit tests

### Task 1.1: Extend `Resource` type with pseudo-resource keys

**Files:**
- Modify: `shared/game/types.ts`
- Test: `shared/cards/helpers/__tests__/card-state.test.ts` (existing or new)

Pseudo-resource keys store "count of buildings/cards" rather than physical resources. They are written **only** to `CardResourceStats.gained`; other fields and the player's `Resource` totals must ignore them.

- [ ] **Step 1: Read current Resource type**

Run: `grep -n "export type Resource\|export interface Resource" shared/game/types.ts`

Confirm the shape (likely `{ wood, clay, stone, reed, grain, vegetable, food, sheep, boar, cattle }` or similar).

- [ ] **Step 2: Audit consumers of `Resource` keys**

Run: `grep -rn "Object.keys.*resources\|for.*resource.*in\|RESOURCE_KEYS\b" shared/ server/ client/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | head -40`

List places that iterate all `Resource` keys. These are the spots that must filter out pseudo-keys. Save the list as a comment in the eventual stats helpers file (Task 1.3).

- [ ] **Step 3: Write the failing test for the type extension**

Add to a new file `shared/game/__tests__/resource-pseudo-keys.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { REAL_RESOURCE_KEYS, PSEUDO_RESOURCE_KEYS, isPseudoResourceKey } from '../resource-keys'

describe('Resource pseudo keys', () => {
  it('exposes the BGA pseudo set', () => {
    expect(PSEUDO_RESOURCE_KEYS).toEqual(
      expect.arrayContaining(['occupation', 'field', 'roomWood', 'roomClay', 'roomStone', 'stable']),
    )
    expect(PSEUDO_RESOURCE_KEYS).toHaveLength(6)
  })

  it('isPseudoResourceKey discriminates real vs pseudo', () => {
    expect(isPseudoResourceKey('wood')).toBe(false)
    expect(isPseudoResourceKey('food')).toBe(false)
    expect(isPseudoResourceKey('field')).toBe(true)
    expect(isPseudoResourceKey('occupation')).toBe(true)
  })

  it('REAL_RESOURCE_KEYS matches the Resource type without pseudo keys', () => {
    REAL_RESOURCE_KEYS.forEach((key) => {
      expect(isPseudoResourceKey(key)).toBe(false)
    })
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run shared/game/__tests__/resource-pseudo-keys.test.ts`
Expected: FAIL — `Cannot find module '../resource-keys'`

- [ ] **Step 5: Create `shared/game/resource-keys.ts`**

```ts
import type { Resource } from './types'

export const REAL_RESOURCE_KEYS = [
  'wood', 'clay', 'stone', 'reed',
  'grain', 'vegetable', 'food',
  'sheep', 'boar', 'cattle',
] as const satisfies ReadonlyArray<keyof Resource>

export const PSEUDO_RESOURCE_KEYS = [
  'occupation', 'field',
  'roomWood', 'roomClay', 'roomStone',
  'stable',
] as const

export type PseudoResourceKey = (typeof PSEUDO_RESOURCE_KEYS)[number]

const PSEUDO_SET: ReadonlySet<string> = new Set(PSEUDO_RESOURCE_KEYS)

export const isPseudoResourceKey = (key: string): key is PseudoResourceKey =>
  PSEUDO_SET.has(key)
```

If your real `Resource` keys differ from the list above, adjust `REAL_RESOURCE_KEYS` to match the actual type and re-run the test.

- [ ] **Step 6: Extend `Resource` type in `shared/game/types.ts`**

Find the `Resource` type and add the pseudo keys as optional `number` fields (keep them optional so existing real-resource literals don't break):

```ts
export type Resource = {
  wood: number
  clay: number
  stone: number
  reed: number
  grain: number
  vegetable: number
  food: number
  sheep: number
  boar: number
  cattle: number
  // Pseudo keys — used ONLY by CardResourceStats.gained to count built rooms /
  // played occupations / plowed fields / built stables. Always 0 in player.resources.
  occupation?: number
  field?: number
  roomWood?: number
  roomClay?: number
  roomStone?: number
  stable?: number
}
```

If `Resource` is currently expressed without optional fields and used in many literal initializers, and adding optional fields breaks too many call sites, fall back to a separate type `CardStatGainedResource = Partial<Resource> & { occupation?: number; field?: number; roomWood?: number; roomClay?: number; roomStone?: number; stable?: number }` and use it only in `CardResourceStats.gained`. Keep this decision local; do not propagate the new keys into player.resources.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm exec vitest run shared/game/__tests__/resource-pseudo-keys.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Run lint + typecheck to catch downstream breakage**

Run: `pnpm run lint 2>&1 | tail -30 && pnpm run build 2>&1 | tail -30`
Expected: zero new TS errors. If new errors appear at sites listed in Step 2, fix them by either:
- Filtering with `isPseudoResourceKey` when iterating
- Using `REAL_RESOURCE_KEYS` instead of `Object.keys`

Show the diff for any fixes inline before committing.

- [ ] **Step 9: Commit**

```bash
git add shared/game/types.ts shared/game/resource-keys.ts shared/game/__tests__/resource-pseudo-keys.test.ts
# plus any downstream files patched in Step 8
git commit -m "feat(stats): add pseudo-resource keys for per-card gained stats"
```

---

### Task 1.2: Extend `CardResourceStats` type to 6 fields

**Files:**
- Modify: `shared/game/types.ts:168-171`
- Modify: `shared/cards/helpers/card-state.ts`

- [ ] **Step 1: Replace the existing `CardResourceStats` definition**

In `shared/game/types.ts:168-171`, replace:

```ts
export type CardResourceStats = {
  paid: Partial<Resource>
  gained: Partial<Resource>
}
```

with:

```ts
export type CardResourceStats = {
  used: number
  gained: Partial<Resource>           // includes pseudo-resource keys
  paid: Partial<Resource>
  saved: Partial<Resource>
  receivedPayment: Partial<Resource>
  paidToOthers: Partial<Resource>
}
```

- [ ] **Step 2: Update `readCardResourceStats` defaults in `card-state.ts`**

In `shared/cards/helpers/card-state.ts:94-104`, replace:

```ts
export const readCardResourceStats = (
  player: PlayerState,
  cardId: string,
): CardResourceStats | undefined => {
  const value = readCardExtraData<Partial<CardResourceStats>>(player, cardId, CARD_RESOURCE_STATS_KEY)
  if (!value || typeof value !== 'object') return undefined
  return {
    paid: normalizePositiveResources(value.paid ?? {}),
    gained: normalizePositiveResources(value.gained ?? {}),
  }
}
```

with:

```ts
export const readCardResourceStats = (
  player: PlayerState,
  cardId: string,
): CardResourceStats | undefined => {
  const value = readCardExtraData<Partial<CardResourceStats>>(player, cardId, CARD_RESOURCE_STATS_KEY)
  if (!value || typeof value !== 'object') return undefined
  return {
    used: typeof value.used === 'number' && value.used > 0 ? value.used : 0,
    gained: normalizeNonNegativeResources(value.gained ?? {}),
    paid: normalizeNonNegativeResources(value.paid ?? {}),
    saved: normalizeNonNegativeResources(value.saved ?? {}),
    receivedPayment: normalizeNonNegativeResources(value.receivedPayment ?? {}),
    paidToOthers: normalizeNonNegativeResources(value.paidToOthers ?? {}),
  }
}
```

`gained` may legitimately contain pseudo-keys, so `normalizePositiveResources` is renamed/aliased to `normalizeNonNegativeResources` (same behaviour) but the rename signals it accepts the wider key set.

Rename the existing local function `normalizePositiveResources` → `normalizeNonNegativeResources` for clarity (no behaviour change); leave behaviour: drops zero / negative / non-number entries. Both real and pseudo keys flow through unchanged.

- [ ] **Step 3: Update `addCardResourceStats` internal helper**

In `shared/cards/helpers/card-state.ts:106-119`, replace the body of `addCardResourceStats` to use the new 6-field default:

```ts
const addCardResourceStats = (
  player: PlayerState,
  cardId: string,
  field: 'gained' | 'paid' | 'saved' | 'receivedPayment' | 'paidToOthers',
  resources: Partial<Resource>,
) => {
  const normalized = normalizeNonNegativeResources(resources)
  if (Object.keys(normalized).length === 0) return
  const current =
    readCardResourceStats(player, cardId) ?? emptyCardResourceStats()
  writeCardExtraData(player, cardId, CARD_RESOURCE_STATS_KEY, {
    ...current,
    [field]: mergeResources(current[field], normalized),
  } satisfies CardResourceStats)
}

const emptyCardResourceStats = (): CardResourceStats => ({
  used: 0,
  gained: {},
  paid: {},
  saved: {},
  receivedPayment: {},
  paidToOthers: {},
})
```

`emptyCardResourceStats()` factory keeps the new-default shape DRY for read fallbacks too — replace the inline `?? { paid: {}, gained: {} }` with `?? emptyCardResourceStats()`.

- [ ] **Step 4: Run lint + typecheck**

Run: `pnpm run lint 2>&1 | tail -30 && pnpm run build 2>&1 | tail -30`
Expected: typecheck failures only at writers of the OLD shape (callers of `addCardResourceStats('paid'|'gained', …)` are unchanged; existing tests that read `.paid` / `.gained` still type-check). Any compile errors → list them as a comment in the next task description and fix in Step 5.

- [ ] **Step 5: Fix downstream compile errors**

Most likely the only failures are tests that destructure `{ paid, gained }` from `readCardResourceStats(...)` and assert deep equality. Update assertions to either use `expect.objectContaining({ paid, gained })` or list all 6 fields. Show each diff inline before the next step.

Run: `pnpm exec vitest run shared/cards/__tests__/A29_AleBenches.test.ts shared/cards/__tests__/A37_Bucksaw.test.ts shared/cards/__tests__/A144_Sequestrator.test.ts`
Expected: PASS after assertion updates.

- [ ] **Step 6: Commit**

```bash
git add shared/game/types.ts shared/cards/helpers/card-state.ts \
        shared/cards/__tests__/A29_AleBenches.test.ts \
        shared/cards/__tests__/A37_Bucksaw.test.ts \
        shared/cards/__tests__/A144_Sequestrator.test.ts
git commit -m "feat(stats): expand CardResourceStats to 6 BGA fields"
```

---

### Task 1.3: Add 4 new write-helpers (`incCardUsed`, `addCardResourceSaved`, `addCardResourceReceivedPayment`, `addCardResourcePaidToOthers`)

**Files:**
- Modify: `shared/cards/helpers/card-state.ts`
- Test: `shared/cards/helpers/__tests__/card-state.test.ts` (new or extend existing)

- [ ] **Step 1: Write the failing tests**

Create or extend `shared/cards/helpers/__tests__/card-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  readCardResourceStats,
  incCardUsed,
  addCardResourcePaid,
  addCardResourceGained,
  addCardResourceSaved,
  addCardResourceReceivedPayment,
  addCardResourcePaidToOthers,
} from '../card-state'
import type { PlayerState } from '../../../game/types'

const mockPlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} } as unknown as PlayerState)

describe('per-card stats helpers', () => {
  it('incCardUsed increments from 0 → 1 → 2', () => {
    const p = mockPlayer()
    incCardUsed(p, 'A1')
    expect(readCardResourceStats(p, 'A1')?.used).toBe(1)
    incCardUsed(p, 'A1')
    expect(readCardResourceStats(p, 'A1')?.used).toBe(2)
  })

  it('addCardResourceSaved accumulates per-resource', () => {
    const p = mockPlayer()
    addCardResourceSaved(p, 'C16', { wood: 1 })
    addCardResourceSaved(p, 'C16', { wood: 2, clay: 1 })
    expect(readCardResourceStats(p, 'C16')?.saved).toEqual({ wood: 3, clay: 1 })
  })

  it('addCardResourceReceivedPayment writes to receivedPayment field', () => {
    const p = mockPlayer()
    addCardResourceReceivedPayment(p, 'E103', { food: 2 })
    expect(readCardResourceStats(p, 'E103')?.receivedPayment).toEqual({ food: 2 })
  })

  it('addCardResourcePaidToOthers writes to paidToOthers field', () => {
    const p = mockPlayer()
    addCardResourcePaidToOthers(p, 'X1', { sheep: 1 })
    expect(readCardResourceStats(p, 'X1')?.paidToOthers).toEqual({ sheep: 1 })
  })

  it('helpers do not interfere with each other', () => {
    const p = mockPlayer()
    incCardUsed(p, 'A1')
    addCardResourceGained(p, 'A1', { wood: 2 })
    addCardResourcePaid(p, 'A1', { food: 1 })
    addCardResourceSaved(p, 'A1', { wood: 1 })
    const stats = readCardResourceStats(p, 'A1')
    expect(stats).toEqual({
      used: 1,
      gained: { wood: 2 },
      paid: { food: 1 },
      saved: { wood: 1 },
      receivedPayment: {},
      paidToOthers: {},
    })
  })

  it('non-positive amounts are ignored', () => {
    const p = mockPlayer()
    addCardResourceSaved(p, 'A1', { wood: 0 })
    addCardResourceSaved(p, 'A1', { wood: -3 })
    expect(readCardResourceStats(p, 'A1')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/card-state.test.ts`
Expected: FAIL — `incCardUsed is not a function` (and similarly for the other 3 new helpers).

- [ ] **Step 3: Implement helpers in `shared/cards/helpers/card-state.ts`**

Append to the file:

```ts
export const incCardUsed = (player: PlayerState, cardId: string) => {
  const current = readCardResourceStats(player, cardId) ?? emptyCardResourceStats()
  writeCardExtraData(player, cardId, CARD_RESOURCE_STATS_KEY, {
    ...current,
    used: current.used + 1,
  } satisfies CardResourceStats)
}

export const addCardResourceSaved = (
  player: PlayerState,
  cardId: string,
  resources: Partial<Resource>,
) => {
  addCardResourceStats(player, cardId, 'saved', resources)
}

export const addCardResourceReceivedPayment = (
  player: PlayerState,
  cardId: string,
  resources: Partial<Resource>,
) => {
  addCardResourceStats(player, cardId, 'receivedPayment', resources)
}

export const addCardResourcePaidToOthers = (
  player: PlayerState,
  cardId: string,
  resources: Partial<Resource>,
) => {
  addCardResourceStats(player, cardId, 'paidToOthers', resources)
}
```

Make sure `emptyCardResourceStats` from Task 1.2 is exported (or defined above these new helpers in the file; either way they must see it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/card-state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/cards/helpers/card-state.ts shared/cards/helpers/__tests__/card-state.test.ts
git commit -m "feat(stats): add used/saved/receivedPayment/paidToOthers helpers"
```

---

### Task 1.4: `recordPaymentStats` central helper

**Files:**
- Create: `shared/cards/helpers/payment-stats.ts`
- Test: `shared/cards/helpers/__tests__/payment-stats.test.ts`

This is the central derivation logic. It reads a `PaymentSolution` (already produced by `pay-helpers.ts`) and writes `paid` / `saved` to each contributing source-card's `CardResourceStats`.

- [ ] **Step 1: Inspect PaymentSolution / Trade / Bonus shapes**

Run: `grep -n "type PaymentSolution\|type Trade\|type Bonus\|tradesUsed\|bonusUsed\|sourceId" shared/game/types.ts shared/actions/effects/pay.ts shared/actions/effects/pay-helpers.ts | head -40`

Note exact field names. Save:
- `solution.tradesUsed: { trade: Trade; count: number }[]` (likely)
- `solution.bonusUsed?: string` (CSV of bonus ids)
- `Trade.sourceId?: string`
- `Trade.from: Partial<Resource>`
- `Trade.to: Partial<Resource>`

If the actual shape differs from this assumption, document the diff in `payment-stats.ts` JSDoc and adjust the helper accordingly (the test below uses the assumed shape — adjust the test too).

- [ ] **Step 2: Write the failing tests**

Create `shared/cards/helpers/__tests__/payment-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { recordPaymentStats } from '../payment-stats'
import { readCardResourceStats } from '../card-state'
import type { PlayerState, PaymentSolution, Trade } from '../../../game/types'

const mockPlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} } as unknown as PlayerState)

const trade = (overrides: Partial<Trade>): Trade => ({
  from: {},
  to: {},
  sourceId: undefined,
  ...overrides,
} as Trade)

describe('recordPaymentStats', () => {
  it('attributes saved + paid to a single trade source', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 1 },
      tradesUsed: [
        { trade: trade({ from: { wood: 2 }, to: { stone: 1 }, sourceId: 'C88' }), count: 1 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    } as unknown as PaymentSolution
    recordPaymentStats(player, solution)
    const stats = readCardResourceStats(player, 'C88')
    expect(stats?.saved).toEqual({ wood: 2 })
    expect(stats?.paid).toEqual({ stone: 1 })
  })

  it('multiplies trade by count', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 3 },
      tradesUsed: [
        { trade: trade({ from: { wood: 2 }, to: { stone: 1 }, sourceId: 'C16' }), count: 3 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    } as unknown as PaymentSolution
    recordPaymentStats(player, solution)
    const stats = readCardResourceStats(player, 'C16')
    expect(stats?.saved).toEqual({ wood: 6 })
    expect(stats?.paid).toEqual({ stone: 3 })
  })

  it('ignores trades without sourceId (engine-internal trades)', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 1 },
      tradesUsed: [
        { trade: trade({ from: { wood: 2 }, to: { stone: 1 } }), count: 1 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    } as unknown as PaymentSolution
    recordPaymentStats(player, solution)
    expect(player.cardStates).toEqual({})
  })

  it('attributes bonusUsed sources via comma-separated card ids', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: {},
      tradesUsed: [],
      bonusUsed: 'E16_BriarHedge',
      cardUsed: undefined,
    } as unknown as PaymentSolution
    // Bonus values are not in the solution shape — recordPaymentStats may need
    // an optional `bonusReductions: Record<cardId, Partial<Resource>>` param.
    // If you take that route, adjust this test accordingly. Otherwise the
    // helper accumulates a count only or is skipped for bonuses.
    recordPaymentStats(player, solution, { 'E16_BriarHedge': { wood: 1 } })
    expect(readCardResourceStats(player, 'E16_BriarHedge')?.saved).toEqual({ wood: 1 })
  })

  it('multiple trades from different cards stack independently', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 1, food: 1 },
      tradesUsed: [
        { trade: trade({ from: { wood: 1 }, to: { stone: 1 }, sourceId: 'C88' }), count: 1 },
        { trade: trade({ from: { reed: 1 }, to: { food: 1 }, sourceId: 'C16' }), count: 1 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    } as unknown as PaymentSolution
    recordPaymentStats(player, solution)
    expect(readCardResourceStats(player, 'C88')?.saved).toEqual({ wood: 1 })
    expect(readCardResourceStats(player, 'C16')?.saved).toEqual({ reed: 1 })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/payment-stats.test.ts`
Expected: FAIL — `Cannot find module '../payment-stats'`.

- [ ] **Step 4: Create `shared/cards/helpers/payment-stats.ts`**

```ts
import type {
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../game/types'
import {
  addCardResourcePaid,
  addCardResourceSaved,
} from './card-state'

const scaleResources = (
  resources: Partial<Resource>,
  factor: number,
): Partial<Resource> => {
  const out: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value === 0) return
    out[key as keyof Resource] = value * factor
  })
  return out
}

/**
 * Distribute `paid` and `saved` over each card that contributed to a
 * PaymentSolution. Mirrors BGA `Pay::updateSourceCardStatsFromCost`
 * (`bga-agricola/modules/php/Actions/Pay.php:271-292`) but uses our pre-built
 * solution so we don't have to re-derive a "reference combination".
 *
 * Trade attribution rules:
 *  - For each tradesUsed[i] with sourceId set:
 *    saved[res] += count * trade.from[res]
 *    paid[res]  += count * trade.to[res]
 *  - tradesUsed without sourceId are engine-internal and skipped.
 *
 * Bonus attribution: bonusUsed is a comma-separated list of card ids. The
 * caller passes an optional `bonusReductions` map keyed by card id giving the
 * resources each bonus saved. (We need this externally because PaymentSolution
 * doesn't carry the bonus's "from/to" semantics directly.)
 */
export const recordPaymentStats = (
  player: PlayerState,
  solution: PaymentSolution,
  bonusReductions: Record<string, Partial<Resource>> = {},
) => {
  for (const used of solution.tradesUsed) {
    const sourceId = used.trade.sourceId
    if (!sourceId) continue
    const saved = scaleResources(used.trade.from as Partial<Resource>, used.count)
    const paid = scaleResources(used.trade.to as Partial<Resource>, used.count)
    if (Object.keys(saved).length > 0) {
      addCardResourceSaved(player, sourceId, saved)
    }
    if (Object.keys(paid).length > 0) {
      addCardResourcePaid(player, sourceId, paid)
    }
  }

  const bonusUsed = solution.bonusUsed
  if (bonusUsed) {
    bonusUsed.split(',').forEach((rawId) => {
      const id = rawId.trim()
      if (!id) return
      const reduction = bonusReductions[id]
      if (!reduction) return
      addCardResourceSaved(player, id, reduction)
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/payment-stats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/cards/helpers/payment-stats.ts \
        shared/cards/helpers/__tests__/payment-stats.test.ts
git commit -m "feat(stats): recordPaymentStats helper attributes paid/saved by source card"
```

---

### Task 1.5: PR-1 wrap — full unit suite + lint clean

- [ ] **Step 1: Run full vitest fast project**

Run: `pnpm test:fast 2>&1 | tail -50`
Expected: all green. If any session test broke because of `CardResourceStats` shape change, update those assertions inline (Task 1.2 Step 5 should have caught most; sweep here).

- [ ] **Step 2: Run lint and typecheck**

Run: `pnpm run lint 2>&1 | tail -20 && pnpm run build 2>&1 | tail -20`
Expected: zero errors. Warnings count must not increase.

- [ ] **Step 3: Open PR or stage commits**

PR-1 is now self-contained: types extended, all helpers in place, fully unit-tested. No write-points wired yet — `used` / `saved` / `receivedPayment` / `paidToOthers` will all be `0` / `{}` at runtime. That's expected.

```bash
git log --oneline -5
git push -u origin worktree-align-stats-with-bga
gh pr create --title "feat(stats): per-card stats — types & helpers (PR-1/4)" \
  --body "$(cat <<'EOF'
## Summary
- Adds 6 pseudo-resource keys to `Resource` (used by `CardResourceStats.gained` only)
- Expands `CardResourceStats` from 2 to 6 fields (used / gained / paid / saved / receivedPayment / paidToOthers)
- Adds helpers: `incCardUsed`, `addCardResourceSaved`, `addCardResourceReceivedPayment`, `addCardResourcePaidToOthers`, `recordPaymentStats`
- All write-points and UI changes deferred to PR-2 / PR-3

## Test plan
- [x] `pnpm test:fast` — all green
- [x] `pnpm run lint` — no new errors
- [x] `pnpm run build` — typecheck passes
EOF
)"
```

---

## PR-2 — Write-point integration

Depends on PR-1.

### Task 2.1: `used` increment on every listener fire

**Files:**
- Modify: `shared/engine/engine.ts:1050-1110` (the `ActivateCardNode` branch)
- Test: `server/__tests__/stats-card-used-session.test.ts`

- [ ] **Step 1: Pick a representative card already implemented**

Run: `grep -rn "incStats('used')" /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/ | head -10`
This is the BGA reference list — find one whose equivalent we have implemented. `D138_PetLover` and `C146_WorkshopAssistant` are good candidates.

Run: `ls shared/cards/D/D138_PetLover.ts shared/cards/C/C146_WorkshopAssistant.ts 2>/dev/null`
Pick whichever exists. The chosen card will be `<USED_CARD>` for the rest of this task.

- [ ] **Step 2: Write the failing session test**

Create `server/__tests__/stats-card-used-session.test.ts` (template — replace `<USED_CARD>` and the trigger sequence with your chosen card's actual mechanics):

```ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

const setupSession = () => {
  // Use existing test fixtures — search server/__tests__ for `createTwoPlayerSession` or similar.
  // ...
}

describe('used stat increments on listener fire', () => {
  it('increments cardStates.used when <USED_CARD>.during fires', () => {
    const session = setupSession()
    // Place the chosen card in player's improvements / occupations / minor played.
    // Trigger an action that fires its listener.
    // Example for D138_PetLover (animal-related effect):
    //   - Player plays D138_PetLover
    //   - Player visits an action that triggers the listener
    const stats = readCardResourceStats(session.state.players[0], '<USED_CARD>')
    expect(stats?.used).toBeGreaterThanOrEqual(1)
  })
})
```

If your project has a higher-level `runScenario` / `playToTrigger` helper, prefer it. Otherwise pattern after an existing session test that already triggers card listeners — search `server/__tests__/*.test.ts` for `cardStates`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run server/__tests__/stats-card-used-session.test.ts`
Expected: FAIL — `stats?.used` is `undefined` or 0.

- [ ] **Step 4: Add the increment in `engine.ts:1050-1110`**

In the `ActivateCardNode` branch, immediately after `executeCardListener(...)` returns (around line 1066-1072), insert:

```ts
const result = executeCardListener(listener, listenerContext as import('../cards/card-listeners').CardListenerContext, {
  ownerPlayerId,
})
const effectPlayer =
  (ownerPlayerId
    ? context.state.players.find((player) => player.id === ownerPlayerId)
    : null) ?? context.player
// NEW: increment per-card `used` stat for this listener fire.
incCardUsed(effectPlayer, node.cardId)
```

Add the import at the top of `engine.ts`:

```ts
import { incCardUsed } from '../cards/helpers/card-state'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run server/__tests__/stats-card-used-session.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full session suite to catch over-counting**

Run: `pnpm test:fast 2>&1 | tail -30`
Expected: all green. If any existing test now over-counts `used`, that's a sign the listener is firing twice — debug rather than weakening the assertion.

- [ ] **Step 7: Commit**

```bash
git add shared/engine/engine.ts server/__tests__/stats-card-used-session.test.ts
git commit -m "feat(stats): track per-card used count via ActivateCardNode"
```

---

### Task 2.2: `gained.occupation` write on occupation play

**Files:**
- Locate + modify: occupation effect (likely `shared/actions/effects/play-occupation.ts` or similar)
- Test: extend `server/__tests__/stats-card-used-session.test.ts` (or new file)

- [ ] **Step 1: Locate the occupation play effect**

Run: `grep -rn "play.*occupation\|occupation.*played\|occupationPlayed.push\|addToOccupationPlayed" shared/actions/effects/ shared/logic/ shared/session/ --include="*.ts" | grep -v __tests__ | head -10`

Identify the file/line where `player.occupationPlayed.push(cardId)` happens (or where the occupation transitions from hand → played). That's the write-point.

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/stats-gained-pseudo-session.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

describe('gained.occupation pseudo-stat', () => {
  it('increments by 1 when the source card causes an occupation to be played', () => {
    // Setup: a card whose listener triggers playing another occupation
    // (e.g., A132_Publican or similar). If no such card is implemented yet,
    // skip this test until we have one.
    // ...
    const sourceCard = '<CARD_THAT_LETS_YOU_PLAY_OCCUPATION>'
    // play through the scenario...
    const stats = readCardResourceStats(player, sourceCard)
    expect(stats?.gained?.occupation).toBe(1)
  })
})
```

If no card currently lets you play an occupation as a side-effect (i.e., all occupation plays are direct player actions with no `sourceCard`), this stat is always 0 — that's correct BGA behaviour. Skip the test and document in the test file's header comment.

The simpler universal test: when a player directly plays an occupation, do **not** write `gained.occupation` to that occupation itself (it's not a side-effect). Add a negative assertion:

```ts
it('does NOT write gained.occupation to the directly-played occupation card', () => {
  // play an occupation through the standard "Family Growth" / similar action
  const stats = readCardResourceStats(player, 'A29_AleBenches' /* whichever you played */)
  expect(stats?.gained?.occupation).toBeFalsy()
})
```

- [ ] **Step 3: Run the test (it should be green even without code change for the negative case)**

Run: `pnpm exec vitest run server/__tests__/stats-gained-pseudo-session.test.ts`
Expected: PASS (negative assertion holds because no write yet).

- [ ] **Step 4: Add the write-point**

In the occupation effect file from Step 1, after the occupation moves to `player.occupationPlayed`, add:

```ts
import { addCardResourceGained } from '../../cards/helpers/card-state'
// ...
if (sourceCard && sourceCard !== cardIdBeingPlayed) {
  addCardResourceGained(player, sourceCard, { occupation: 1 } as Partial<Resource>)
}
```

The `sourceCard !== cardIdBeingPlayed` guard prevents self-attribution (the occupation being played isn't its own source).

- [ ] **Step 5: If a positive-case test was authored, run it**

Run: `pnpm exec vitest run server/__tests__/stats-gained-pseudo-session.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/actions/effects/<occupation-file>.ts \
        server/__tests__/stats-gained-pseudo-session.test.ts
git commit -m "feat(stats): track gained.occupation when source card plays one"
```

---

### Task 2.3: `gained.field` write on plow

**Files:**
- Locate + modify: plow effect (likely `shared/actions/effects/plow.ts` or plow-field, plow-fields)
- Test: extend `server/__tests__/stats-gained-pseudo-session.test.ts`

- [ ] **Step 1: Locate the plow effect**

Run: `grep -rn "plow\|fields.push\|addField" shared/actions/effects/ shared/logic/ --include="*.ts" | grep -v __tests__ | head -10`

Find where `player.fields.push(...)` or equivalent happens. That's the write-point. Also note whether the effect knows `sourceCard` — for the "plow as a side-effect of a card" case (e.g., a free plow from an occupation).

- [ ] **Step 2: Write the failing test**

Add to `stats-gained-pseudo-session.test.ts`:

```ts
it('increments gained.field on the source card when it grants a free plow', () => {
  // pick an implemented card with "you may immediately plow 1 field" text
  // (search shared/cards for "plow" in the desc)
  // ...
  const stats = readCardResourceStats(player, '<PLOW_CARD>')
  expect(stats?.gained?.field).toBe(1)
})
```

If no such implemented card exists, write only the negative case (a normal player-action plow does not write `gained.field` anywhere).

- [ ] **Step 3: Run test, expect FAIL on positive case (or PASS on negative-only)**

Run: `pnpm exec vitest run server/__tests__/stats-gained-pseudo-session.test.ts`

- [ ] **Step 4: Add the write-point**

In the plow effect, after the new field is appended to `player.fields`:

```ts
if (sourceCard) {
  addCardResourceGained(player, sourceCard, { field: 1 } as Partial<Resource>)
}
```

If multiple fields are plowed in one effect call, multiply: `{ field: count }`.

- [ ] **Step 5: Run test to verify pass**

Run: `pnpm exec vitest run server/__tests__/stats-gained-pseudo-session.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track gained.field on source card for free plows"
```

---

### Task 2.4: `gained.roomWood/roomClay/roomStone` and `gained.stable`

**Files:**
- Locate + modify: construct effect (rooms) and stable/fence effect
- Test: extend `stats-gained-pseudo-session.test.ts`

- [ ] **Step 1: Locate construct + stable write-points**

Run: `grep -rn "construct\|buildRoom\|player.rooms\|stables.push\|buildStable" shared/actions/effects/ shared/logic/ --include="*.ts" | grep -v __tests__ | head -15`

Find:
- where new rooms are appended (track house material at the time of construction → `roomWood/roomClay/roomStone` key)
- where new stables are added

- [ ] **Step 2: Write the failing tests**

Add to `stats-gained-pseudo-session.test.ts`:

```ts
it('increments gained.roomWood when source card grants free wooden room', () => {
  // pick a card like "free room" / "build extra room"
  const stats = readCardResourceStats(player, '<ROOM_CARD>')
  expect(stats?.gained?.roomWood).toBe(1)
})

it('increments gained.stable when source card grants free stable', () => {
  // C88_CarpentersApprentice or similar
  const stats = readCardResourceStats(player, '<STABLE_CARD>')
  expect(stats?.gained?.stable).toBeGreaterThanOrEqual(1)
})
```

- [ ] **Step 3: Run tests, expect FAIL**

Run: `pnpm exec vitest run server/__tests__/stats-gained-pseudo-session.test.ts`

- [ ] **Step 4: Add the write-points**

Construct effect:
```ts
const houseType = player.houseType  // 'wood' | 'clay' | 'stone'
const roomKey: keyof Resource = houseType === 'wood' ? 'roomWood'
  : houseType === 'clay' ? 'roomClay'
  : 'roomStone'
if (sourceCard) {
  addCardResourceGained(player, sourceCard, { [roomKey]: roomsBuilt } as Partial<Resource>)
}
```

Stable / fence effect:
```ts
if (sourceCard) {
  addCardResourceGained(player, sourceCard, { stable: stablesBuilt } as Partial<Resource>)
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm exec vitest run server/__tests__/stats-gained-pseudo-session.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track gained.roomWood/Clay/Stone and gained.stable"
```

---

### Task 2.5: Rewrite `pay-resources.ts` to use `recordPaymentStats`

**Files:**
- Modify: `shared/actions/effects/pay-resources.ts`
- Modify: callers that pass `cost` directly without going through PaymentSolution (audit)
- Test: `server/__tests__/stats-payment-saved-session.test.ts`

The current implementation (`pay-resources.ts:21-22`) calls `addCardResourcePaid(player, sourceCard, cost as Partial<Resource>)` with the raw `cost` — this incorrectly attributes everything as `paid`, ignoring `saved`. Replace with `recordPaymentStats(player, solution)` after threading the solution through.

- [ ] **Step 1: Audit how `pay-resources.ts` is invoked**

Run: `grep -rn "payResourcesAction\|'pay-resources'" shared/ server/ --include="*.ts" | head -15`

The `pay-resources` action receives `params` as the cost. It doesn't currently see a `PaymentSolution`. Two options:
1. **Direct-attribution stays direct, only solution-attribution callers use new helper.** `pay-resources` action keeps `addCardResourcePaid(player, sourceCard, cost)` because it has no solution. **Real** `paid` / `saved` distribution happens in callers that DO build solutions (i.e., `executePaymentSolution` in `pay-helpers.ts`).
2. Refactor `pay-resources` to require a solution.

Option 1 is dramatically less invasive. Take it.

- [ ] **Step 2: Locate `executePaymentSolution`**

Run: `grep -n "executePaymentSolution\|export function executePayment" shared/actions/effects/pay.ts shared/actions/effects/pay-helpers.ts`

Open the file and find the function body.

- [ ] **Step 3: Write the failing test for solution-based saved attribution**

Create `server/__tests__/stats-payment-saved-session.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

describe('saved attribution via PaymentSolution', () => {
  it('C88_CarpentersApprentice attributes saved.wood when used to discount stable cost', () => {
    // 1. setup 2-player game, add C88_CarpentersApprentice to player.minorPlayed
    // 2. give player some wood/stone (whatever is needed)
    // 3. trigger build-stable action — solution should select the C88 trade
    // 4. assert saved
    // ...
    const stats = readCardResourceStats(session.state.players[0], 'C88_CarpentersApprentice')
    expect(stats?.saved?.wood).toBeGreaterThan(0)
  })

  it('C16_FieldFences attributes saved.wood for fences built free', () => {
    // similar setup with C16_FieldFences and a fencing action
    const stats = readCardResourceStats(session.state.players[0], 'C16_FieldFences')
    expect(stats?.saved?.wood).toBeGreaterThan(0)
  })
})
```

If your project has utility helpers like `setupSessionWithCards` / `playerWithCard`, use them. Pattern after `server/__tests__/B30_WoodPalisades-session.test.ts` (which already drives a session and inspects state).

- [ ] **Step 4: Run, expect FAIL**

Run: `pnpm exec vitest run server/__tests__/stats-payment-saved-session.test.ts`
Expected: FAIL — `stats?.saved` is `{}` or `undefined`.

- [ ] **Step 5: Wire `recordPaymentStats` into `executePaymentSolution`**

In `shared/actions/effects/pay.ts` (or wherever `executePaymentSolution` lives), replace:

```ts
export const executePaymentSolution = (player: PlayerState, solution: PaymentSolution) => {
  // ... existing body that mutates player.resources ...
}
```

with:

```ts
import { recordPaymentStats } from '../../cards/helpers/payment-stats'
// ...
export const executePaymentSolution = (player: PlayerState, solution: PaymentSolution) => {
  // ... existing body that mutates player.resources ...
  recordPaymentStats(player, solution)
}
```

If `executePaymentSolution` is also called for cases where stats should NOT be written (e.g., harvest auto-payment), pass an opt-out flag:

```ts
export const executePaymentSolution = (
  player: PlayerState,
  solution: PaymentSolution,
  options: { trackStats?: boolean } = { trackStats: true },
) => {
  // ...
  if (options.trackStats !== false) {
    recordPaymentStats(player, solution)
  }
}
```

Default: track. Audit other callers of `executePaymentSolution` and confirm none should opt out — typically only auto-feeding. If unsure, leave opt-out off for now; tweak later.

- [ ] **Step 6: Decide what `pay-resources.ts` direct path does**

The direct `addCardResourcePaid(player, sourceCard, cost)` in `pay-resources.ts:22` is correct for the "no solution, just spend" path (e.g., a card explicitly costs 1 food). Keep it. No change.

- [ ] **Step 7: Run the failing test to verify pass**

Run: `pnpm exec vitest run server/__tests__/stats-payment-saved-session.test.ts`
Expected: PASS.

- [ ] **Step 8: Run full session suite to catch double-attribution**

Run: `pnpm test:fast 2>&1 | tail -30`
Expected: all green. If existing tests now see unexpected `paid` on cards (because solutions now record stats they previously didn't), update those assertions to include the new fields.

- [ ] **Step 9: Commit**

```bash
git add shared/actions/effects/pay.ts shared/actions/effects/pay-helpers.ts \
        server/__tests__/stats-payment-saved-session.test.ts
git commit -m "feat(stats): attribute paid/saved via recordPaymentStats in executePaymentSolution"
```

---

### Task 2.6: `receivedPayment` / `paidToOthers` on player-to-player transfers

**Files:**
- Locate: player-to-player transfer entry (audit `gain-other-players.ts` and any `payResourceTo` analogue)
- Modify: that entry
- Test: `server/__tests__/stats-cross-player-payment-session.test.ts`

- [ ] **Step 1: Find all player-to-player transfer paths**

Run: `grep -rn "state.players.filter\|recipients\|otherPlayer\|to.*player" shared/actions/effects/ --include="*.ts" | grep -v __tests__ | head -20`

Already known: `shared/actions/effects/gain-other-players.ts:14-22` already handles "other players gain" with `addCardResourceGained` writes. That's not a payment — that's a gift; skip it.

Search for actual transfers (player A → player B): `grep -rn "player.resources\[.*\] -=" shared/ --include="*.ts" | head -20`. Look for sites that decrement one player's resource AND increment another's.

If no such site exists in the current implementation, only the helper sits idle and the cross-player test is a placeholder. Document in the test header. Skip writes.

- [ ] **Step 2: If a transfer site exists, write the failing test**

Create `server/__tests__/stats-cross-player-payment-session.test.ts` driving a 2-player scenario where player A pays player B via a card effect (search BGA `Pay::updateSourceCardStatsFromCost` / `Pay.php:191-213` for the canonical "ctxArgs.to" semantics). Assert:

```ts
expect(readCardResourceStats(playerA, sourceCard)?.paidToOthers).toEqual({ food: 1 })
expect(readCardResourceStats(playerB, sourceCard)?.receivedPayment).toEqual({ food: 1 })
```

- [ ] **Step 3: Run test, expect FAIL**

- [ ] **Step 4: Add writes at the transfer site**

```ts
import { addCardResourcePaidToOthers, addCardResourceReceivedPayment } from '../../cards/helpers/card-state'
// ...
// payer side
if (sourceCard) {
  addCardResourcePaidToOthers(payerPlayer, sourceCard, transferred)
}
// recipient side
if (sourceCard) {
  addCardResourceReceivedPayment(recipientPlayer, sourceCard, transferred)
}
```

Note: BGA writes both sides to the **same** card id (the card on the payer's tableau is also conceptually the recipient's card via shared rules — see `Pay.php:200-203`). If our model differs, document and pick one side; spec acceptance is "stats are written for the transfer", not "both sides identical".

- [ ] **Step 5: Run test, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): track receivedPayment/paidToOthers on cross-player transfers"
```

If no transfer site was found, skip this task entirely and add a TODO note in the spec's "待实施时确认" section that this didn't ship.

---

### Task 2.7: PR-2 wrap

- [ ] **Step 1: Run full test suite**

Run: `pnpm test 2>&1 | tail -50`
Expected: all green (fast + slow projects).

- [ ] **Step 2: Run lint and build**

Run: `pnpm run lint 2>&1 | tail -20 && pnpm run build 2>&1 | tail -20`

- [ ] **Step 3: Push and PR**

```bash
git push
gh pr create --title "feat(stats): per-card stats — write points (PR-2/4)" \
  --body "$(cat <<'EOF'
## Summary
- `used` increments per listener fire in `ActivateCardNode` (engine.ts)
- `gained.occupation/field/roomWood/roomClay/roomStone/stable` written by occupation/plow/construct/stable effects when a `sourceCard` is present
- `paid` / `saved` derived from `PaymentSolution` via `recordPaymentStats` in `executePaymentSolution`
- `receivedPayment` / `paidToOthers` on cross-player transfers (or skipped if no such site)

## Test plan
- [x] `pnpm test` — fast + slow green
- [x] New session tests cover used / pseudo-gained / saved
- [x] No double-attribution regressions
EOF
)"
```

---

## PR-3 — Tooltip UI + i18n

Depends on PR-1 only. Can run in parallel with PR-2 from a separate branch.

### Task 3.1: `formatCardStatsLines` pure helper

**Files:**
- Create: `client/components/common/cardStatsFormat.ts`
- Test: `client/components/common/__tests__/cardStatsFormat.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { formatCardStatsLines } from '../cardStatsFormat'
import type { CardResourceStats } from '../../../../shared/game/types'

const empty: CardResourceStats = {
  used: 0, gained: {}, paid: {}, saved: {},
  receivedPayment: {}, paidToOthers: {},
}

describe('formatCardStatsLines', () => {
  it('returns empty array for an all-zero stats object', () => {
    expect(formatCardStatsLines(empty, 'C99', 'en')).toEqual([])
  })

  it('emits a used line when used > 0', () => {
    const stats = { ...empty, used: 3 }
    const lines = formatCardStatsLines(stats, 'C99', 'en')
    expect(lines).toEqual([
      { key: 'used', labelKey: 'ui.cardStats.used', value: 3 },
    ])
  })

  it('separates real-resource gained from pseudo-resource gained', () => {
    const stats: CardResourceStats = {
      ...empty,
      gained: { wood: 2, occupation: 1, roomWood: 1, stable: 1 } as any,
    }
    const lines = formatCardStatsLines(stats, 'C99', 'en')
    const keys = lines.map((l) => l.key)
    expect(keys).toEqual([
      'gained-resources',
      'gained-occupation',
      'gained-rooms',
      'gained-stables',
    ])
    expect(lines[0]).toMatchObject({
      labelKey: 'ui.cardStats.gained',
      resources: { wood: 2 },
    })
    expect(lines[1]).toMatchObject({
      labelKey: 'ui.cardStats.gainedOccupation',
      value: 1,
    })
    expect(lines[2]).toMatchObject({
      labelKey: 'ui.cardStats.builtRoom',
      value: 1,
    })
    expect(lines[3]).toMatchObject({
      labelKey: 'ui.cardStats.builtStable',
      value: 1,
    })
  })

  it('emits gained.field as a Plows line', () => {
    const stats = { ...empty, gained: { field: 2 } as any }
    expect(formatCardStatsLines(stats, 'C99', 'en')).toEqual([
      { key: 'gained-field', labelKey: 'ui.cardStats.gainedField', value: 2 },
    ])
  })

  it('emits paid / saved / receivedPayment / paidToOthers in BGA-aligned order', () => {
    const stats: CardResourceStats = {
      used: 1,
      gained: { wood: 1 },
      paid: { stone: 1 },
      saved: { wood: 1 },
      receivedPayment: { food: 1 },
      paidToOthers: { sheep: 1 },
    }
    const keys = formatCardStatsLines(stats, 'C99', 'en').map((l) => l.key)
    expect(keys).toEqual([
      'used',
      'gained-resources',
      'received',
      'paid',
      'paid-to-others',
      'saved',
    ])
  })

  it('drops keys whose values are 0', () => {
    const stats = { ...empty, used: 0, gained: { wood: 0 } as any }
    expect(formatCardStatsLines(stats, 'C99', 'en')).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect FAIL — module missing**

- [ ] **Step 3: Implement `cardStatsFormat.ts`**

```ts
import type { Locale } from '../../../shared/i18n'
import type { CardResourceStats, Resource } from '../../../shared/game/types'
import { isPseudoResourceKey } from '../../../shared/game/resource-keys'

export type CardStatLine = {
  key: string
  labelKey: string
  value?: number
  resources?: Partial<Resource>
}

const filterRealResources = (
  resources: Partial<Resource>,
): Partial<Resource> => {
  const out: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    if (isPseudoResourceKey(key)) return
    out[key as keyof Resource] = value
  })
  return out
}

const sumRoomKeys = (gained: Partial<Resource>): number => {
  return (
    (gained.roomWood ?? 0) + (gained.roomClay ?? 0) + (gained.roomStone ?? 0)
  )
}

const hasResources = (resources: Partial<Resource>): boolean =>
  Object.keys(filterRealResources(resources)).length > 0

export const formatCardStatsLines = (
  stats: CardResourceStats | undefined,
  _cardId: string,
  _locale: Locale,
): CardStatLine[] => {
  if (!stats) return []
  const out: CardStatLine[] = []

  if (stats.used > 0) {
    out.push({ key: 'used', labelKey: 'ui.cardStats.used', value: stats.used })
  }

  // gained: real resources
  if (hasResources(stats.gained)) {
    out.push({
      key: 'gained-resources',
      labelKey: 'ui.cardStats.gained',
      resources: filterRealResources(stats.gained),
    })
  }

  // gained: pseudo keys
  if ((stats.gained.occupation ?? 0) > 0) {
    out.push({
      key: 'gained-occupation',
      labelKey: 'ui.cardStats.gainedOccupation',
      value: stats.gained.occupation!,
    })
  }
  if ((stats.gained.field ?? 0) > 0) {
    out.push({
      key: 'gained-field',
      labelKey: 'ui.cardStats.gainedField',
      value: stats.gained.field!,
    })
  }
  const totalRooms = sumRoomKeys(stats.gained)
  if (totalRooms > 0) {
    out.push({
      key: 'gained-rooms',
      labelKey: 'ui.cardStats.builtRoom',
      value: totalRooms,
    })
  }
  if ((stats.gained.stable ?? 0) > 0) {
    out.push({
      key: 'gained-stables',
      labelKey: 'ui.cardStats.builtStable',
      value: stats.gained.stable!,
    })
  }

  if (hasResources(stats.receivedPayment)) {
    out.push({
      key: 'received',
      labelKey: 'ui.cardStats.receivedFrom',
      resources: filterRealResources(stats.receivedPayment),
    })
  }
  if (hasResources(stats.paid)) {
    out.push({
      key: 'paid',
      labelKey: 'ui.cardStats.paid',
      resources: filterRealResources(stats.paid),
    })
  }
  if (hasResources(stats.paidToOthers)) {
    out.push({
      key: 'paid-to-others',
      labelKey: 'ui.cardStats.paidToOthers',
      resources: filterRealResources(stats.paidToOthers),
    })
  }
  if (hasResources(stats.saved)) {
    out.push({
      key: 'saved',
      labelKey: 'ui.cardStats.saved',
      resources: filterRealResources(stats.saved),
    })
  }

  return out
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `pnpm exec vitest run client/components/common/__tests__/cardStatsFormat.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add client/components/common/cardStatsFormat.ts \
        client/components/common/__tests__/cardStatsFormat.test.ts
git commit -m "feat(stats): cardStatsFormat helper for tooltip rendering"
```

---

### Task 3.2: i18n keys (zh + en)

**Files:**
- Modify: `shared/i18n/zh.ts`
- Modify: `shared/i18n/en.ts`

- [ ] **Step 1: Locate the existing `cardStatsPaid` / `cardStatsGained` entries**

Run: `grep -n "cardStatsPaid\|cardStatsGained" shared/i18n/zh.ts shared/i18n/en.ts`

Confirm format (likely a `ui` section with key strings).

- [ ] **Step 2: Add new keys**

In `shared/i18n/zh.ts` `ui` section, add:

```ts
cardStats: {
  used: '使用次数',
  gained: '获得',
  gainedOccupation: '出牌职业次数',
  gainedField: '开垦次数',
  builtRoom: '建房间数',
  builtStable: '建畜舍数',
  receivedFrom: '他人支付',
  paid: '支付',
  paidToOthers: '支付给他人',
  saved: '节省',
},
```

In `shared/i18n/en.ts`:

```ts
cardStats: {
  used: 'Used',
  gained: 'Gained',
  gainedOccupation: 'Occupations played',
  gainedField: 'Plows',
  builtRoom: 'Rooms built',
  builtStable: 'Stables built',
  receivedFrom: 'Received from others',
  paid: 'Paid',
  paidToOthers: 'Paid to others',
  saved: 'Saved',
},
```

If the i18n module nests differently (flat keys with dotted strings), use:

```ts
'cardStats.used': '使用次数',
'cardStats.gained': '获得',
// ...
```

— follow the file's existing style.

- [ ] **Step 3: Verify the translation lookup works**

Run: `pnpm exec vitest run client/components/common/__tests__/cardStatsFormat.test.ts`

If `formatCardStatsLines` already returns labelKeys, no test should change. Add a runtime smoke test that `t(locale, 'ui.cardStats.used')` returns the expected translated string for both locales:

```ts
import { t } from '../../../../shared/i18n'
it('translates cardStats keys', () => {
  expect(t('zh', 'ui.cardStats.used')).toBe('使用次数')
  expect(t('en', 'ui.cardStats.used')).toBe('Used')
})
```

- [ ] **Step 4: Commit**

```bash
git add shared/i18n/zh.ts shared/i18n/en.ts client/components/common/__tests__/cardStatsFormat.test.ts
git commit -m "feat(stats): i18n keys for per-card stat tooltip"
```

---

### Task 3.3: Refactor `FarmBoard` tooltip JSX to use `formatCardStatsLines`

**Files:**
- Modify: `client/components/board/FarmBoard.tsx:440-484`
- Test: extend `client/components/board/__tests__/FarmBoard.test.tsx`

- [ ] **Step 1: Find the tooltip JSX**

Open `client/components/board/FarmBoard.tsx` and locate lines 440-484 — the `played-card-stats-tooltip` div. Note current props: `resourceStats`, `bonusVp`, `cardType`, `rawId`, `locale`, `tooltipRef`, `tooltipPosition`, `emptyResources`.

- [ ] **Step 2: Write the failing test**

In `client/components/board/__tests__/FarmBoard.test.tsx`, add:

```ts
it('renders 6-field tooltip with new format helper', () => {
  // build a minimal player with cardStates resourceStats covering all 6 fields
  const players = [
    {
      id: 'p1',
      cardStates: {
        C99: {
          extraData: {
            resourceStats: {
              used: 2,
              gained: { wood: 1, occupation: 1, stable: 1 },
              paid: { food: 1 },
              saved: { stone: 1 },
              receivedPayment: { sheep: 1 },
              paidToOthers: { reed: 1 },
            },
          },
        },
      },
      // ... other PlayerState fields
    },
  ]
  // render FarmBoard with hover-active tooltip on C99
  // assert: tooltip contains 6 lines with correct labels
  // ...
})
```

Pattern after existing FarmBoard tests for setup conventions.

- [ ] **Step 3: Run test, expect FAIL — old tooltip only renders 2 fields**

- [ ] **Step 4: Refactor the JSX**

Replace lines 440-484 with:

```tsx
import { formatCardStatsLines, type CardStatLine } from '../common/cardStatsFormat'
// ...

const lines = formatCardStatsLines(resourceStats, rawId, locale)
const showBonusVp = bonusVp > 0

return (
  <div
    ref={tooltipRef}
    className="played-card-stats-tooltip"
    role="tooltip"
    style={{
      top: tooltipPosition?.top ?? -9999,
      left: tooltipPosition?.left ?? -9999,
    }}
  >
    <div className="played-card-stats-title">
      {/* ... existing card-name resolution unchanged ... */}
    </div>
    {lines.map((line: CardStatLine) => (
      <div key={line.key} className="played-card-stats-section">
        <div className="played-card-stats-label">{t(locale, line.labelKey)}</div>
        {line.resources ? (
          <ResourceLine
            locale={locale}
            resources={{ ...emptyResources, ...line.resources }}
            className="played-card-stats-line"
          />
        ) : line.value !== undefined ? (
          <div className="played-card-stats-value">{line.value}</div>
        ) : null}
      </div>
    ))}
    {showBonusVp ? (
      <div className="played-card-stats-section">
        <div className="played-card-stats-label">{t(locale, 'ui.bonusVp')}</div>
        <div className="played-card-stats-value">{bonusVp}</div>
      </div>
    ) : null}
  </div>
)
```

If `bonusVp` was previously merged into the gained section, keep that merge if visually preferable. Otherwise the explicit dedicated row is clearer.

- [ ] **Step 5: Run test to verify pass**

Run: `pnpm exec vitest run client/components/board/__tests__/FarmBoard.test.tsx`

- [ ] **Step 6: Visual sanity check**

Spec requires: per project CLAUDE.md, UI changes need a browser sanity check. Start dev server (`./restart-intranet.sh`), open a played card with stats (e.g., a card that's been used multiple times), confirm the tooltip looks right at all 6 line types.

- [ ] **Step 7: Commit**

```bash
git add client/components/board/FarmBoard.tsx \
        client/components/board/__tests__/FarmBoard.test.tsx
git commit -m "feat(stats): render 6-field per-card tooltip via formatCardStatsLines"
```

---

### Task 3.4: PR-3 wrap

- [ ] **Step 1: Run full UI + lint + build**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: green.

- [ ] **Step 2: Push + PR**

```bash
git push
gh pr create --title "feat(stats): per-card stats — tooltip UI (PR-3/4)" \
  --body "..."
```

---

## PR-4 — Infobox writes on progress-style cards

Depends on PR-1 only. Independent of PR-2 / PR-3.

### Task 4.1: Inventory progress-style cards

- [ ] **Step 1: Find candidate cards**

Run: `grep -rn "cardStates?.\[CARD_ID\]?.counters\|initCardState" shared/cards/ --include="*.ts" | grep -v __tests__ | head -20`

Each match is a card that already accumulates a counter — candidates for an infobox progress display.

Run: `grep -rn "updateInfobox\|->setInfobox\|infobox" /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/ | head -20` to cross-check the BGA reference list. Common cards: A53_Claypipe, C148_MudWallower, D36_BreedRegistry, E27_PiggyBank, E74_AshTrees, A25_Bassinet (clears infobox).

For each candidate that exists in `shared/cards/`, add a sub-task in this PR. Skip candidates not implemented yet.

- [ ] **Step 2: Document the chosen list**

Add a comment block at the top of a new file `client/components/common/cardInfoboxList.md` or to the spec's "待实施时确认" section recording the final list. The remaining sub-tasks treat each card individually.

---

### Task 4.2 .. 4.N: Per-card infobox writes (template)

**Repeat this template for each chosen card.**

**Files:**
- Modify: the chosen card's `.ts` file (e.g., `shared/cards/D/D36_BreedRegistry.ts`)
- Test: extend that card's existing session test or add `<CARD>-infobox.test.ts`

- [ ] **Step 1: Identify the trigger point**

Find where the card's counter increments (e.g., D36 increments when sheep count crosses thresholds). The infobox write goes at the end of the same hook that updates the counter.

- [ ] **Step 2: Write the failing test**

```ts
it('writes infobox "n / cap" after each counter update', () => {
  // setup: place D36_BreedRegistry on player.minorPlayed; give 1 sheep
  // ...
  // trigger the listener once (gain 1 more sheep)
  expect(player.cardStates['D36_BreedRegistry']?.infobox).toBe('1 / 2')
  // gain another sheep
  expect(player.cardStates['D36_BreedRegistry']?.infobox).toBe('2 / 2')
})
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Add the write**

In the card's hook body, after updating the counter:

```ts
import { writeCardInfobox } from '../helpers/card-state'
// ...
writeCardInfobox(player, CARD_ID, `${current} / ${cap}`)
```

For A25_Bassinet which clears the infobox at end of game, use `clearCardInfobox`:

```ts
import { clearCardInfobox } from '../helpers/card-state'
clearCardInfobox(player, CARD_ID)
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(stats): D36_BreedRegistry shows infobox progress"
```

Repeat Task 4.2 for each chosen card. One commit per card.

---

### Task 4.last: PR-4 wrap

- [ ] **Step 1: Visual check across all cards**

Start dev server, play a quick scenario where each updated card triggers, confirm the badge appears with the correct number.

- [ ] **Step 2: Tests + lint + build**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: green.

- [ ] **Step 3: Push + PR**

```bash
git push
gh pr create --title "feat(stats): infobox badges on progress cards (PR-4/4)" \
  --body "..."
```

---

## Cross-PR exit criteria

After all four PRs land:

- [ ] `pnpm test` — full suite green (fast + slow)
- [ ] `pnpm run lint` — no new errors
- [ ] `pnpm run build` — typecheck clean
- [ ] Visual: pick 3 played cards in a session and confirm tooltip shows used / gained / paid / saved / receivedPayment / paidToOthers correctly per the gameplay path
- [ ] Visual: verify infobox badges show on the chosen progress cards
- [ ] Update `docs/card_progress.md` §7 (基础设施) with a one-line entry: "Per-card 6-field stats + infobox badges (Track 1)"
- [ ] Update `docs/card_progress.md` §2 (current round) with the date + a one-line summary
