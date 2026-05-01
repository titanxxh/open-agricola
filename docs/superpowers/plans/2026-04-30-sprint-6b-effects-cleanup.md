# Sprint 6b Effects/ Cleanup + 6a Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `shared/actions/effects/` from 63 files to ~26-30 (matching BGA's 22 + necessary extensions). Refactor 4 mutation-pattern violations to special-effect leaf. Migrate 51 callers of card-state leaves (flag-card / unflag-card / etc.) to special-effect with kind discriminator. Tie up two 6a follow-up items.

**Architecture:** Five batches in sequence: (A) dead code + helper relocation; (B) ad-hoc action registry for single-card effects; (C) special-effect replaces 5 redundant leaves; (D) mutation cleanup with `targetPlayerId`; (E) 6a follow-up. No main-path changes outside `shared/actions/index.ts` (one fallback line) and the affected effect files. Listener-handler-mutate prohibition strictly enforced for the 4 cleanup cards.

**Tech Stack:** TypeScript, vitest, existing engine + special-effect dispatcher (added in 6a).

---

## File Map

| File | Responsibility | Touch |
|---|---|---|
| `shared/actions/effects/registry.ts` | Ad-hoc action registry | Create (Task 2) |
| `shared/actions/index.ts:104-106` | getActionDefinition fallback | Modify (Task 2) |
| `shared/actions/effects/special-effect.ts` | targetPlayerId support | Modify (Task 4) |
| `shared/actions/helpers/` | New helper directory | Create (Task 1) |
| `shared/actions/effects/{pay-helpers,cost-preview,room-payment,placement-availability,placement-constants,selection,selection-effect-registry,feed-family}.ts` | Helpers (move) | Move to helpers/ + update imports (Task 1) |
| `shared/actions/effects/{flag-card,unflag-card,set-card-infobox,clear-card-infobox,write-card-extra-data}.ts` | Card-state leaves (delete after Task 5) | Delete (Task 6) |
| `shared/actions/effects/{grain-thief-protect,scythe-harvest-field,build-farmhand-room,mark-card-observed,discard-from-hand,first-player}.ts` | Single-card effects | Delete + inline into card files (Task 3) |
| `shared/actions/effects/{move-farmer-to-space,swap-field-crop,store-on-card,take-from-card}.ts` | Possibly shared | Inspect (Task 3) — multi-card → helpers/, single → ad-hoc |
| `shared/actions/effects/internal-actions.ts` | Static action list | Modify (remove deleted actions) |
| `shared/actions/effects/__tests__/registry.test.ts` | Ad-hoc registry tests | Create (Task 2) |
| `shared/cards/{deck}/{card}.ts` | 51+ card files | Modify (Tasks 3, 5, 7) |
| `shared/cards/E/E149_MidnightFencer.ts` | Mutation cleanup | Modify (Task 7) |
| `shared/cards/E/E38_RodCollection.ts` | Mutation cleanup | Modify (Task 7) |
| `shared/cards/D/D134_OysterEater.ts` | Mutation cleanup | Modify (Task 7) |
| `shared/cards/C/C104_Collector.ts` | PlayerActionCard rewrite | Modify (Task 7) |
| `shared/cards/types.ts` | CardExchange.trigger removal | Modify (Task 8) |
| `shared/cards/E/E53_BoarSpear.ts` | triggers: [] | Modify (Task 8) |
| `shared/i18n/{zh,en}.ts` | Remove obsolete i18n keys | Modify (Tasks 1, 6) |
| `docs/{card_progress,master-plan,ENGINE_ARCHITECTURE,CUSTOM_CARD_SANDBOX}.md` | Sync | Modify (Task 9) |

---

## Task 1: Dead Code Removal + Helper Relocation

**Goal:** Verify each dead code candidate is truly unreferenced; delete confirmed dead. Move helpers (non-`ActionDefinition`) to `shared/actions/helpers/`.

**Files:**
- Delete (after verify): subset of `{push-card-stack, release-worker-from-card, hold-worker-on-card, animals}.ts`
- Move: `shared/actions/effects/{pay-helpers,cost-preview,room-payment,placement-availability,placement-constants,selection,selection-effect-registry,feed-family}.ts` → `shared/actions/helpers/`
- Modify all callers' import paths

- [ ] **Step 1.1: Verify dead code candidates (grep each)**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola

# future-meeples — ALREADY VERIFIED NOT DEAD (86 callers); SKIP
# reorganize — ALREADY VERIFIED NOT DEAD (internal-actions.ts:15); SKIP
# write-card-extra-data — wait for Task 5 (will become dead after Task 5)
# Below need verify:

for f in push-card-stack release-worker-from-card hold-worker-on-card animals; do
  echo "=== $f ==="
  grep -rln "from.*'.*$f'" shared/ server/ src/ 2>/dev/null | grep -v "$f.ts" | head -5
  grep -rn "actionId: '" shared/actions/effects/$f.ts 2>/dev/null | head -1
done
```

Expected output for each file: list of importers (excluding the file itself). Verify each:
- 0 importers → truly dead
- only `__tests__` importers → consider dead (test will be deleted too)
- card files importing → NOT dead, keep

- [ ] **Step 1.2: Delete confirmed dead files + their tests**

For each truly-dead file F:
```bash
rm shared/actions/effects/F.ts
rm shared/actions/effects/__tests__/F.test.ts  # if exists
# Remove import from internal-actions.ts (if present)
```

Expected: 1-3 files deleted (per spec §2.1 estimate).

- [ ] **Step 1.3: Run tests to verify no breakage**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
```
Expected: all PASS, build success.

- [ ] **Step 1.4: Create shared/actions/helpers/ directory and move helper files**

```bash
mkdir -p shared/actions/helpers/
git mv shared/actions/effects/pay-helpers.ts shared/actions/helpers/pay-helpers.ts
git mv shared/actions/effects/cost-preview.ts shared/actions/helpers/cost-preview.ts
git mv shared/actions/effects/room-payment.ts shared/actions/helpers/room-payment.ts
git mv shared/actions/effects/placement-availability.ts shared/actions/helpers/placement-availability.ts
git mv shared/actions/effects/placement-constants.ts shared/actions/helpers/placement-constants.ts
git mv shared/actions/effects/selection.ts shared/actions/helpers/selection.ts
git mv shared/actions/effects/selection-effect-registry.ts shared/actions/helpers/selection-effect-registry.ts
```

For `feed-family.ts`:
```bash
grep -n "ActionDefinition\|export const.*Action" shared/actions/effects/feed-family.ts | head -5
```
- If exports `ActionDefinition` → keep in `effects/`
- Otherwise → `git mv shared/actions/effects/feed-family.ts shared/actions/helpers/feed-family.ts`

- [ ] **Step 1.5: Update import paths across the codebase**

```bash
# Find all callers and update path
for h in pay-helpers cost-preview room-payment placement-availability placement-constants selection selection-effect-registry; do
  echo "=== $h ==="
  grep -rl "from '\(\.\.\)*/actions/effects/$h'" shared/ server/ src/ 2>/dev/null
done
```

For each match, replace `'.../actions/effects/$h'` with `'.../actions/helpers/$h'`. Use sed:

```bash
# Example for pay-helpers:
grep -rl "from '\(\.\.\)*/actions/effects/pay-helpers'" shared/ server/ src/ 2>/dev/null | \
  xargs sed -i "s|/actions/effects/pay-helpers|/actions/helpers/pay-helpers|g"
# Repeat for each helper
```

Verify no stragglers:
```bash
grep -rn "from '\(\.\.\)*/actions/effects/pay-helpers'" shared/ server/ src/ 2>/dev/null
# Expected: 0 matches
```

- [ ] **Step 1.6: Run tests + build + lint**

```bash
pnpm run build 2>&1 | tail -5
pnpm test:fast 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
```
Expected: all green; type errors caught here mean an import path was missed.

- [ ] **Step 1.7: Commit**

```bash
git add -A
git commit -m "refactor(effects): remove dead code + move helpers to shared/actions/helpers/"
```

---

## Task 2: Ad-Hoc Action Registry Infrastructure

**Goal:** Create `registerAdHocAction(def)` helper + integrate into `getActionDefinition` lookup chain.

**Files:**
- Create: `shared/actions/effects/registry.ts`
- Modify: `shared/actions/index.ts:104-106`
- Test: `shared/actions/effects/__tests__/registry.test.ts`

- [ ] **Step 2.1: Read current getActionDefinition entry point**

```bash
sed -n '90,110p' shared/actions/index.ts
```
Expected: see `actionDefinitionLookup.get(actionId)` at line 106.

- [ ] **Step 2.2: Write failing test for registry**

Create `shared/actions/effects/__tests__/registry.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import type { ActionDefinition } from '../../../game/types'
import { registerAdHocAction, getAdHocAction, getAllAdHocActions, _resetAdHocRegistry } from '../registry'

const makeDef = (id: string): ActionDefinition => ({
  id,
  nameKey: 'actions.test.name',
  descriptionKey: 'actions.test.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
})

describe('ad-hoc action registry', () => {
  beforeEach(() => _resetAdHocRegistry())
  
  it('register + lookup correctly', () => {
    const def = makeDef('card_TestCard_action')
    registerAdHocAction(def)
    expect(getAdHocAction('card_TestCard_action')).toBe(def)
  })
  
  it('throws when id does not start with card_', () => {
    expect(() => registerAdHocAction(makeDef('plow'))).toThrow(/must start with 'card_'/)
  })
  
  it('throws on duplicate id', () => {
    const def = makeDef('card_X_y')
    registerAdHocAction(def)
    expect(() => registerAdHocAction(def)).toThrow(/already registered/)
  })
  
  it('returns undefined for unknown id', () => {
    expect(getAdHocAction('card_UnknownX')).toBeUndefined()
  })
  
  it('lists all registered via getAllAdHocActions', () => {
    registerAdHocAction(makeDef('card_A_x'))
    registerAdHocAction(makeDef('card_B_y'))
    expect(getAllAdHocActions().map(d => d.id).sort()).toEqual(['card_A_x', 'card_B_y'])
  })
})
```

- [ ] **Step 2.3: Run tests — expect FAIL (registry.ts doesn't exist)**

```bash
pnpm exec vitest run shared/actions/effects/__tests__/registry.test.ts
```
Expected: FAIL with module-not-found.

- [ ] **Step 2.4: Create registry.ts**

```ts
// shared/actions/effects/registry.ts
import type { ActionDefinition } from '../../game/types'

const adHocActions = new Map<string, ActionDefinition>()

export const registerAdHocAction = (def: ActionDefinition): void => {
  if (!def.id.startsWith('card_')) {
    throw new Error(`Ad-hoc action id must start with 'card_': ${def.id}`)
  }
  if (adHocActions.has(def.id)) {
    throw new Error(`Ad-hoc action already registered: ${def.id}`)
  }
  adHocActions.set(def.id, def)
}

export const getAdHocAction = (id: string): ActionDefinition | undefined => {
  return adHocActions.get(id)
}

export const getAllAdHocActions = (): ActionDefinition[] => {
  return [...adHocActions.values()]
}

// Test-only: reset registry between tests
export const _resetAdHocRegistry = (): void => {
  adHocActions.clear()
}
```

- [ ] **Step 2.5: Run tests — expect PASS**

```bash
pnpm exec vitest run shared/actions/effects/__tests__/registry.test.ts
```
Expected: 5 PASS.

- [ ] **Step 2.6: Integrate registry into getActionDefinition fallback**

Modify `shared/actions/index.ts:104-106`:

```ts
import { getAdHocAction } from './effects/registry'

export const getActionDefinition = (
  actionId: string,
): ActionDefinition | undefined =>
  actionDefinitionLookup.get(actionId) ?? getAdHocAction(actionId)
```

- [ ] **Step 2.7: Verify LLM workshop / DSL runner action discovery**

```bash
grep -rn 'getActionDefinition\|actionDefinitionLookup' shared/custom-code/ src/app/workshop/ 2>/dev/null | head -10
```

Expected: see whether custom-code DSL runner / LLM workshop call `getActionDefinition`. If yes, ad-hoc actions are automatically picked up. If they use a different lookup (e.g. their own static map), document the limitation: ad-hoc actions are NOT exposed to LLM workshop (single-card actions are not user-extensible).

(Plan note: LLM workshop has its own ast-validator + actionId allowlist in `shared/custom-code/ast-validator.ts`. Ad-hoc actions are NOT added to allowlist — workshop-generated cards cannot dispatch `card_*` actions. This is intentional: ad-hoc registry is for repo-internal cards only.)

- [ ] **Step 2.8: Run full tests**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
```
Expected: all green.

- [ ] **Step 2.9: Commit**

```bash
git add shared/actions/effects/registry.ts shared/actions/effects/__tests__/registry.test.ts shared/actions/index.ts
git commit -m "feat(action): registerAdHocAction infrastructure"
```

---

## Task 3: Inline Single-Card Effects to Ad-Hoc Registry

**Goal:** Move single-card effect files into their respective card files via `registerAdHocAction`. Reclassify multi-card-shared files as helpers.

**Files (single-card, plan 阶段精确化):**
- Inline: `grain-thief-protect.ts`, `scythe-harvest-field.ts`, `build-farmhand-room.ts`, `mark-card-observed.ts`, `discard-from-hand.ts`, `first-player.ts` (verify single-card)
- Inspect (multi-card?): `move-farmer-to-space.ts`, `swap-field-crop.ts`, `store-on-card.ts`, `take-from-card.ts`

- [ ] **Step 3.1: For each candidate file, identify the owning card(s)**

```bash
for f in grain-thief-protect scythe-harvest-field build-farmhand-room mark-card-observed discard-from-hand first-player move-farmer-to-space swap-field-crop store-on-card take-from-card; do
  echo "=== $f ==="
  # Find the actionId
  ID=$(grep "id: '" shared/actions/effects/$f.ts | head -1 | sed -E "s/.*id: '([^']+)'.*/\\1/")
  echo "actionId: $ID"
  # Find caller cards
  if [ -n "$ID" ]; then
    grep -rln "actionId: '$ID'" shared/cards/ 2>/dev/null
  fi
done
```

For each:
- 1 caller card → single-card → inline into card via `registerAdHocAction`
- 2+ caller cards → multi-card → move to `shared/actions/helpers/` (handler function form, not ActionDefinition)

(If a multi-card file has 2 callers and the action is intrinsically a card-effect dispatch — not a generic helper — make a judgment call: keep as-is in `effects/` if BGA has equivalent generic action; otherwise inline both into a shared `card_<group>_<action>` ad-hoc.)

- [ ] **Step 3.2: For each single-card file, inline into the card**

For each file F with single caller card C (using `grain-thief-protect` + 1 caller card as illustrative example — apply the pattern to each):

Read the effect file:
```bash
cat shared/actions/effects/grain-thief-protect.ts
```

Read the caller card:
```bash
grep -n "actionId: 'grain-thief-protect'" shared/cards/...
```

Modify the card file to add at top (after existing imports):

```ts
import { registerAdHocAction } from '../../actions/effects/registry'
import type { ActionDefinition } from '../../game/types'

const grainThiefProtectAction: ActionDefinition = {
  id: 'card_<CARD_ID>_grain-thief-protect',
  nameKey: 'actions.card_grain-thief-protect.name',
  descriptionKey: 'actions.card_grain-thief-protect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, ... }) => {
    /* same logic from original effect file */
  },
}
registerAdHocAction(grainThiefProtectAction)
```

Update card listener references:

```ts
// before:
{ type: 'leaf', actionId: 'grain-thief-protect', sourceCard: CARD_ID }
// after:
{ type: 'leaf', actionId: 'card_<CARD_ID>_grain-thief-protect', sourceCard: CARD_ID }
```

Delete the old effect file:
```bash
rm shared/actions/effects/grain-thief-protect.ts
```

Remove import from `internal-actions.ts`:
```bash
sed -i '/grain-thief-protect/d' shared/actions/effects/internal-actions.ts
```

- [ ] **Step 3.3: Add i18n keys for new ad-hoc action**

For each newly-created `card_*` action:

Modify `shared/i18n/zh.ts`:
```ts
'card_<CARD_ID>_grain-thief-protect': { name: '...', description: '...' },
```

Modify `shared/i18n/en.ts`:
```ts
'card_<CARD_ID>_grain-thief-protect': { name: '...', description: '...' },
```

(Reuse the original i18n key text if it existed.)

- [ ] **Step 3.4: For multi-card-shared files, move to helpers/ as functions**

For each multi-card file F (e.g. `swap-field-crop.ts` with 2 caller cards):

Refactor from `ActionDefinition` to a helper function that the cards call directly inside their listener handler:

```ts
// BEFORE (effects/swap-field-crop.ts):
export const swapFieldCropAction: ActionDefinition = {
  id: 'swap-field-crop',
  execute: ({ state, player }) => { /* mutation */ }
}
```

If both caller cards' handlers were dispatching this action via `flow: { type:'leaf', actionId:'swap-field-crop' }`, then the mutation must remain an ActionDefinition (cannot move to helper). In that case: judgment: treat as single ad-hoc with shared actionId `card_swap-field-crop` (still under ad-hoc registry, but registered once at module load via a barrel `shared/cards/shared-actions.ts`). Plan task 3 step 3.4 fallback: register in `shared/cards/shared-actions.ts` if 2+ caller cards exist — keeps registry usage uniform.

(This is the only nuance: if engine flow is fundamental, the action lives in registry, not helper. Helper functions are pure-call, not flow-dispatched.)

- [ ] **Step 3.5: Run tests after each card migration**

After migrating each card:
```bash
pnpm exec vitest run shared/cards/__tests__/<CARD>* server/__tests__/<CARD>*-session.test.ts
```
Expected: PASS.

- [ ] **Step 3.6: Run full tests after all migrations**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
```
Expected: all green.

- [ ] **Step 3.7: Commit**

```bash
git add -A
git commit -m "refactor(card-effects): inline single-card actions to ad-hoc registry"
```

---

## Task 4: special-effect targetPlayerId Support

**Goal:** Extend `special-effect` to support `actionContext.targetPlayerId` for cross-player mutations (D134 owner-on-actor scenario).

**Files:**
- Modify: `shared/actions/effects/special-effect.ts`
- Test: `shared/actions/effects/__tests__/special-effect.test.ts`

- [ ] **Step 4.1: Verify targetPlayerId is not used elsewhere**

```bash
grep -rn 'targetPlayerId' shared/ server/ 2>/dev/null
```
Expected: 0 existing uses (or only docs/spec). If any other code uses `targetPlayerId` in a different sense, choose alternative name (e.g. `mutationTargetId`).

- [ ] **Step 4.2: Write failing test for targetPlayerId**

Append to `shared/actions/effects/__tests__/special-effect.test.ts`:

```ts
it('targetPlayerId routes mutation to specified player', () => {
  const p1 = makeTestPlayer({ id: 'p1' })
  const p2 = makeTestPlayer({ id: 'p2' })
  const state = { players: [p1, p2] } as any
  
  // Without targetPlayerId, mutation goes to context.player (default = p1)
  specialEffectAction.execute({
    state, player: p1, sourceCard: 'TEST',
    params: { kind: 'increment-extra-data', key: 'foo', amount: 5 },
    actionContext: undefined,
  } as any)
  expect(readCardExtraData<number>(p1, 'TEST', 'foo')).toBe(5)
  expect(readCardExtraData<number>(p2, 'TEST', 'foo')).toBeUndefined()
  
  // With targetPlayerId='p2', mutation goes to p2 instead
  specialEffectAction.execute({
    state, player: p1, sourceCard: 'TEST',
    params: { kind: 'increment-extra-data', key: 'foo', amount: 7 },
    actionContext: { targetPlayerId: 'p2' },
  } as any)
  expect(readCardExtraData<number>(p1, 'TEST', 'foo')).toBe(5)  // unchanged
  expect(readCardExtraData<number>(p2, 'TEST', 'foo')).toBe(7)  // p2 mutated
})
```

- [ ] **Step 4.3: Run test — expect FAIL (targetPlayerId ignored)**

```bash
pnpm exec vitest run shared/actions/effects/__tests__/special-effect.test.ts -t 'targetPlayerId'
```
Expected: FAIL — both p1 and p2 unchanged for the second call (because mutation still went to p1).

- [ ] **Step 4.4: Update special-effect.ts to honor targetPlayerId**

Modify `shared/actions/effects/special-effect.ts`:

```ts
import type { ActionDefinition, GameState, PlayerState } from '../../game/types'
import { setCardFlag, writeCardInfobox, readCardExtraData, writeCardExtraData } from '../../cards/helpers/card-state'

export type SpecialEffectParams =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | { kind: 'set-flag'; flag: boolean }
  | { kind: 'set-infobox'; text: string }

const resolveTargetPlayer = (
  state: GameState,
  player: PlayerState,
  actionContext: unknown,
): PlayerState => {
  const ctx = actionContext as { targetPlayerId?: string } | undefined
  if (!ctx?.targetPlayerId) return player
  return state.players.find(p => p.id === ctx.targetPlayerId) ?? player
}

export const specialEffectAction: ActionDefinition = {
  id: 'special-effect',
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, sourceCard, params, actionContext }) => {
    if (!sourceCard) return { type: 'fail', logKey: 'log.specialEffectFail' }
    const target = resolveTargetPlayer(state, player, actionContext)
    const p = params as SpecialEffectParams | undefined
    if (!p) return { type: 'fail', logKey: 'log.specialEffectFail' }
    switch (p.kind) {
      case 'increment-extra-data': {
        const current = readCardExtraData<number>(target, sourceCard, p.key) ?? 0
        writeCardExtraData(target, sourceCard, p.key, current + p.amount)
        return { type: 'ok' }
      }
      case 'set-extra-data':
        writeCardExtraData(target, sourceCard, p.key, p.value)
        return { type: 'ok' }
      case 'set-flag':
        setCardFlag(target, sourceCard, p.flag)
        return { type: 'ok' }
      case 'set-infobox':
        writeCardInfobox(target, sourceCard, p.text)
        return { type: 'ok' }
    }
  },
}
```

- [ ] **Step 4.5: Run test — expect PASS**

```bash
pnpm exec vitest run shared/actions/effects/__tests__/special-effect.test.ts
```
Expected: 5 PASS (4 existing + 1 new).

- [ ] **Step 4.6: Verify bonus-vp leaf needs similar extension (D134 will use)**

```bash
grep -n 'targetPlayerId\|recipientPlayerId\|player.cardStates' shared/actions/effects/bonus-vp.ts
```

If `bonus-vp` already supports a player override (e.g. via `recipientPlayerId` or similar) → reuse. If not, plan note: `bonus-vp` extension is NOT in scope; D134 will use a workaround (write VP increment via special-effect kind:`'increment-extra-data'` against the bonus-VP cardStates key directly). This avoids extending two effects.

- [ ] **Step 4.7: Commit**

```bash
git add shared/actions/effects/special-effect.ts shared/actions/effects/__tests__/special-effect.test.ts
git commit -m "feat(special-effect): targetPlayerId actionContext for cross-player mutation"
```

---

## Task 5: Migrate 51 Card-State Callers to special-effect

**Goal:** Replace `actionId: 'flag-card'` (39 callers), `'unflag-card'` (8), `'write-card-extra-data'` (~1), `'set-card-infobox'` (~2), `'clear-card-infobox'` (~1) with `actionId: 'special-effect'` + appropriate kind params.

**Files:** ~51 card files in `shared/cards/{A,B,C,D,E}/`

- [ ] **Step 5.1: Build complete caller list**

```bash
echo "=== flag-card callers ==="
grep -rn "actionId: 'flag-card'" shared/cards/ 2>/dev/null | sort > /tmp/flag-card-callers.txt
wc -l /tmp/flag-card-callers.txt
cat /tmp/flag-card-callers.txt

echo "=== unflag-card callers ==="
grep -rn "actionId: 'unflag-card'" shared/cards/ 2>/dev/null > /tmp/unflag-card-callers.txt
cat /tmp/unflag-card-callers.txt

echo "=== other 3 ==="
grep -rn "actionId: 'write-card-extra-data'\|actionId: 'set-card-infobox'\|actionId: 'clear-card-infobox'" shared/cards/ 2>/dev/null > /tmp/other-callers.txt
cat /tmp/other-callers.txt
```

Expected: 39 + 8 + ~4 = ~51 entries. Save to /tmp for batch processing.

- [ ] **Step 5.2: Migrate flag-card (39 callers) — A deck**

For each `shared/cards/A/...ts` file in flag-card-callers.txt:

Original pattern:
```ts
{ type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID }
```

Replace with:
```ts
{ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'set-flag', flag: true } }
```

If the original passed `params.infoboxText`:
```ts
{ type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID,
  params: { infoboxText: '...' } }
```

Replace with two leaves (preserve infobox separately):
```ts
// option A: SEQ wrapper if multiple state changes
{ type: 'seq', children: [
  { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
    params: { kind: 'set-flag', flag: true } },
  { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
    params: { kind: 'set-infobox', text: '...' } },
]}
```

- [ ] **Step 5.3: Run A-deck card tests after migration**

```bash
pnpm exec vitest run shared/cards/A/__tests__/ server/__tests__/A*-session.test.ts
```
Expected: all PASS unchanged.

- [ ] **Step 5.4: Migrate flag-card — B deck**

Same pattern as Step 5.2; apply to all `shared/cards/B/...ts` callers.

- [ ] **Step 5.5: Run B-deck tests**

```bash
pnpm exec vitest run shared/cards/B/__tests__/ server/__tests__/B*-session.test.ts
```

- [ ] **Step 5.6: Migrate flag-card — C deck**

Same pattern; apply to `shared/cards/C/...ts`.

- [ ] **Step 5.7: Run C-deck tests**

```bash
pnpm exec vitest run shared/cards/C/__tests__/ server/__tests__/C*-session.test.ts
```

- [ ] **Step 5.8: Migrate flag-card — D deck**

Same pattern; apply to `shared/cards/D/...ts`.

- [ ] **Step 5.9: Run D-deck tests**

```bash
pnpm exec vitest run shared/cards/D/__tests__/ server/__tests__/D*-session.test.ts
```

- [ ] **Step 5.10: Migrate flag-card + unflag-card + 4 others — E deck**

For E deck, in addition to flag-card pattern:

`unflag-card` callers:
```ts
// before:
{ type: 'leaf', actionId: 'unflag-card', sourceCard: CARD_ID }
// after:
{ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'set-flag', flag: false } }
```

`write-card-extra-data` callers:
```ts
// before:
{ type: 'leaf', actionId: 'write-card-extra-data', sourceCard: CARD_ID,
  params: { key: 'foo', value: 1 } }
// after:
{ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: 'foo', value: 1 } }
```

`set-card-infobox` callers:
```ts
// before:
{ type: 'leaf', actionId: 'set-card-infobox', sourceCard: CARD_ID,
  params: { text: 'msg' } }
// after:
{ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'set-infobox', text: 'msg' } }
```

`clear-card-infobox` callers:
```ts
// before:
{ type: 'leaf', actionId: 'clear-card-infobox', sourceCard: CARD_ID }
// after:
{ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'set-infobox', text: '' } }
```

- [ ] **Step 5.11: Run E-deck + remaining tests**

```bash
pnpm exec vitest run shared/cards/E/__tests__/ server/__tests__/E*-session.test.ts
```

- [ ] **Step 5.12: Verify 0 residual callers**

```bash
grep -rn "actionId: 'flag-card'\|actionId: 'unflag-card'\|actionId: 'write-card-extra-data'\|actionId: 'set-card-infobox'\|actionId: 'clear-card-infobox'" shared/cards/ 2>/dev/null
```
Expected: 0 matches.

- [ ] **Step 5.13: Run full test + lint + build**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
```
Expected: all green.

- [ ] **Step 5.14: Commit**

```bash
git add -A
git commit -m "refactor(card-state): migrate 51 callers (flag-card / unflag-card / write-extra-data / set/clear-infobox) to special-effect"
```

---

## Task 6: Remove 5 Redundant Card-State Effect Files

**Goal:** Delete the now-orphan effect files and clean up registrations.

**Files:**
- Delete: `shared/actions/effects/{flag-card,unflag-card,set-card-infobox,clear-card-infobox,write-card-extra-data}.ts`
- Modify: `shared/actions/effects/internal-actions.ts`
- Modify: `shared/i18n/{zh,en}.ts` (remove obsolete keys)

- [ ] **Step 6.1: Re-verify 0 residual callers (sanity check before delete)**

```bash
grep -rn "actionId: 'flag-card'\|actionId: 'unflag-card'\|actionId: 'write-card-extra-data'\|actionId: 'set-card-infobox'\|actionId: 'clear-card-infobox'" shared/ server/ 2>/dev/null
```
Expected: 0 matches.

- [ ] **Step 6.2: Find static action registry references**

```bash
grep -n "flagCardAction\|unflagCardAction\|setCardInfoboxAction\|clearCardInfoboxAction\|writeCardExtraDataAction\|flag-card\|unflag-card\|write-card-extra-data\|set-card-infobox\|clear-card-infobox" shared/actions/effects/internal-actions.ts shared/actions/index.ts 2>/dev/null
```
Expected: see imports + array entries to remove.

- [ ] **Step 6.3: Delete 5 effect files**

```bash
rm shared/actions/effects/flag-card.ts
rm shared/actions/effects/unflag-card.ts
rm shared/actions/effects/set-card-infobox.ts
rm shared/actions/effects/clear-card-infobox.ts
rm shared/actions/effects/write-card-extra-data.ts

# Delete corresponding tests (if exist)
rm -f shared/actions/effects/__tests__/flag-card.test.ts
rm -f shared/actions/effects/__tests__/unflag-card.test.ts
rm -f shared/actions/effects/__tests__/set-card-infobox.test.ts
rm -f shared/actions/effects/__tests__/clear-card-infobox.test.ts
rm -f shared/actions/effects/__tests__/write-card-extra-data.test.ts
```

- [ ] **Step 6.4: Remove imports/exports from internal-actions.ts**

Modify `shared/actions/effects/internal-actions.ts`:

Remove lines like:
```ts
import { flagCardAction } from './flag-card'
import { unflagCardAction } from './unflag-card'
// ... etc

// In the actions array:
flagCardAction,
unflagCardAction,
// ... etc
```

- [ ] **Step 6.5: Remove obsolete i18n keys**

```bash
grep -n "'flag-card'\|'unflag-card'\|'set-card-infobox'\|'clear-card-infobox'\|'write-card-extra-data'" shared/i18n/zh.ts shared/i18n/en.ts | head
```

Delete each entry from both files.

- [ ] **Step 6.6: Run full tests + build + lint**

```bash
pnpm run build 2>&1 | tail -5
pnpm test:fast 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
pnpm run check:prompt-sync 2>&1 | tail -10
```
Expected: all green; prompt-sync GREEN (no hook/action drift).

- [ ] **Step 6.7: Commit**

```bash
git add -A
git commit -m "refactor(effects): remove 5 redundant card-state action files"
```

---

## Task 7: Mutation Cleanup — E149 / E38 / D134 / C104

**Goal:** Replace direct cardStates mutations in listener handlers / `execute` with special-effect leaves.

**Files:**
- Modify: `shared/cards/E/E149_MidnightFencer.ts`
- Modify: `shared/cards/E/E38_RodCollection.ts`
- Modify: `shared/cards/D/D134_OysterEater.ts`
- Modify: `shared/cards/C/C104_Collector.ts`

### 7.A E149 MidnightFencer

- [ ] **Step 7.A.1: Read current resolveChoice implementation**

```bash
grep -n 'resolveChoice\|owedFences\|writeCardExtraData' shared/cards/E/E149_MidnightFencer.ts
```

Expected: locate `writeCardExtraData(player, CARD_ID, KEY_OWED, readOwed(player) + k)` pattern.

- [ ] **Step 7.A.2: Replace mutation with special-effect SEQ**

In `shared/cards/E/E149_MidnightFencer.ts`, find resolveChoice and replace direct mutation:

```ts
// Before (rough):
resolveChoice: (state, player, choice) => {
  const k = parseInt(choice, 10)
  if (k <= 0) return { type: 'ok' }
  writeCardExtraData(player, CARD_ID, KEY_OWED, readOwed(player) + k)
  return { type: 'ok' }
}

// After:
resolveChoice: (state, player, choice) => {
  const k = parseInt(choice, 10)
  if (k <= 0) return { type: 'ok' }
  return {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
        params: { kind: 'increment-extra-data', key: KEY_OWED, amount: k } },
    ],
  }
}
```

- [ ] **Step 7.A.3: Run E149 tests**

```bash
pnpm exec vitest run shared/cards/__tests__/E149_MidnightFencer*.test.ts server/__tests__/E149*-session.test.ts
```
Expected: PASS.

### 7.B E38 RodCollection

- [ ] **Step 7.B.1: Read current listener handler**

```bash
cat shared/cards/E/E38_RodCollection.ts
```

- [ ] **Step 7.B.2: Replace mutation with returned flow**

In `shared/cards/E/E38_RodCollection.ts`:

```ts
// Before listener handler:
handler: (context) => {
  if (context.space?.id !== 'fishing') return
  const current = readCardExtraData<number>(context.player, CARD_ID, 'woodCount') ?? 0
  writeCardExtraData(context.player, CARD_ID, 'woodCount', current + 2)
}

// After:
handler: (context) => {
  if (context.space?.id !== 'fishing') return
  return {
    flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
            params: { kind: 'increment-extra-data', key: 'woodCount', amount: 2 } },
    sourceCard: CARD_ID,
  }
}
```

- [ ] **Step 7.B.3: Run E38 tests**

```bash
pnpm exec vitest run shared/cards/__tests__/E38_RodCollection*.test.ts server/__tests__/E38*-session.test.ts
```
Expected: PASS (assertions may need a 1-line tweak if checking `pending.type` post-listener).

### 7.C D134 OysterEater

- [ ] **Step 7.C.1: Read current listener handler**

```bash
cat shared/cards/D/D134_OysterEater.ts
```

- [ ] **Step 7.C.2: Replace mutation with SEQ + targetPlayerId**

```ts
// Before:
handler: (context) => {
  if (context.space?.id !== 'fishing') return
  const owner = context.ownerPlayer ?? context.player
  // direct mutation
  const counters = owner.cardStates?.[CARD_ID]?.extraData ?? {}
  const pending = typeof counters.skipNextPlacement === 'number' ? counters.skipNextPlacement : 0
  writeCardExtraData(owner, CARD_ID, 'skipNextPlacement', pending + 1)
  return {
    flow: { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
    sourceCard: CARD_ID,
  }
}

// After:
handler: (context) => {
  if (context.space?.id !== 'fishing') return
  const owner = context.ownerPlayer ?? context.player
  return {
    flow: {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
          params: { kind: 'increment-extra-data', key: 'skipNextPlacement', amount: 1 },
          actionContext: { targetPlayerId: owner.id } },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        // bonus-vp: if not supporting targetPlayerId yet, sourceCard auto-routes to owner
        // via existing convention (verify in plan); else, add actionContext: { targetPlayerId: owner.id }
      ],
    },
    sourceCard: CARD_ID,
  }
}
```

- [ ] **Step 7.C.3: Verify bonus-vp player-routing**

```bash
grep -n 'sourceCard\|owner' shared/actions/effects/bonus-vp.ts
```

If bonus-vp routes its VP via `sourceCard` lookup (looks up `owner` of card by who has it in `improvements/minorPlayed/occupationPlayed`), then no targetPlayerId needed — owner is auto-detected. Verify and adjust if necessary.

- [ ] **Step 7.C.4: Run D134 tests**

```bash
pnpm exec vitest run server/__tests__/D134*-session.test.ts shared/cards/__tests__/D134*.test.ts
```
Expected: PASS.

### 7.D C104 Collector — PlayerActionCard rewrite

- [ ] **Step 7.D.1: Read current C104**

```bash
cat shared/cards/C/C104_Collector.ts
```

- [ ] **Step 7.D.2: Verify resolveChoice can return SEQ flow**

```bash
grep -n 'resolveChoice' shared/cards/player-action-space.ts shared/actions/index.ts | head
```

Look at PlayerActionCard interface to confirm `resolveChoice` returns `ActionExecutionResult | ActionFlow | { type: 'choice', ... }`. If only `{type:'ok'}` / `{type:'choice'}` allowed, SEQ flow needs an interface extension first.

If extension needed, add it as part of Task 7.D.

- [ ] **Step 7.D.3: Refactor C104 — execute does NOT mutate; resolveChoice does via SEQ**

Replace `execute` to be read-only:

```ts
execute: ({ player }) => {
  // READ-ONLY: peek at next useCount to compute needed; do NOT mutate yet
  const useCount = (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) + 1
  const needed = USES_TO_RESOURCES[useCount] ?? 6
  return {
    type: 'choice' as const,
    promptKey: 'ui.interactionCollectorSelect',
    promptParams: { needed },
    options: RESOURCE_TYPES.map((r) => ({
      value: r,
      labelKey: `resources.${r}`,
      sourceCard: CARD_ID,
    })),
  }
}
```

Refactor `resolveChoice` to return SEQ flow:

```ts
resolveChoice: ({ player }, choice) => {
  const selections = choice.split(',').filter((s) => RESOURCE_TYPES.includes(s as any))
  const unique = [...new Set(selections)]
  const useCount = (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) + 1
  const needed = USES_TO_RESOURCES[useCount] ?? 6
  if (unique.length !== needed) {
    return {
      type: 'choice' as const,
      promptKey: 'ui.interactionCollectorSelect',
      promptParams: { needed },
      options: RESOURCE_TYPES.map((r) => ({
        value: r,
        labelKey: `resources.${r}`,
        sourceCard: CARD_ID,
      })),
    }
  }
  // Build gain map: 1 of each selected resource + 1 begging
  const gainMap: Record<string, number> = { begging: 1 }
  for (const res of unique) gainMap[res] = 1
  return {
    type: 'seq' as const,
    children: [
      { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
        params: { kind: 'increment-extra-data', key: 'used', amount: 1 } },
      { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID,
        params: gainMap },
    ],
  }
}
```

- [ ] **Step 7.D.4: Run C104 tests**

```bash
pnpm exec vitest run server/__tests__/C104*-session.test.ts shared/cards/__tests__/C104*.test.ts
```
Expected: PASS. If existing tests break because they assert `pending.type === 'ok'` after the first usage, update to assert SEQ engine completes instead.

- [ ] **Step 7.E: Commit (entire mutation cleanup batch)**

```bash
git add shared/cards/E/E149_MidnightFencer.ts shared/cards/E/E38_RodCollection.ts shared/cards/D/D134_OysterEater.ts shared/cards/C/C104_Collector.ts
git commit -m "refactor(mutation cleanup): E149 / E38 / D134 / C104 listener mutate → special-effect leaf"
```

---

## Task 8: Trigger Array Unification + E53 Listener-Only

**Goal:** Migrate 18 cards using legacy `trigger: ExchangeWindow` (singular) to `triggers: ExchangeWindow[]` (array). Remove the legacy field. Set E53 `triggers: []` to fully match BGA listener-only behavior.

**Files:**
- Modify: 18 card files (find via grep)
- Modify: `shared/cards/types.ts` (remove `trigger?` field, keep only `triggers`)
- Modify: `shared/actions/effects/exchange.ts` (remove `exchangeTriggers` helper)
- Modify: `shared/cards/E/E53_BoarSpear.ts` (`triggers: []`)
- Modify: existing E53 tests (anytime exchange flip)

- [ ] **Step 8.1: Find all single-trigger callers**

```bash
grep -rn "trigger: '\(harvest\|anytime\|bake-bread\)'" shared/cards/ 2>/dev/null > /tmp/single-trigger.txt
wc -l /tmp/single-trigger.txt
cat /tmp/single-trigger.txt
```
Expected: 18 entries.

- [ ] **Step 8.2: Migrate each to triggers array**

For each match, rewrite:
```ts
// Before:
{ from: { vegetable: 1 }, to: { food: 5 }, sourceId: 'X', max: 1, trigger: 'harvest' }
// After:
{ from: { vegetable: 1 }, to: { food: 5 }, sourceId: 'X', max: 1, triggers: ['harvest'] }
```

Use sed for bulk:
```bash
# Apply to each file individually to avoid regex misfires
sed -i "s/trigger: 'harvest'/triggers: ['harvest']/g" <FILE>
sed -i "s/trigger: 'anytime'/triggers: ['anytime']/g" <FILE>
sed -i "s/trigger: 'bake-bread'/triggers: ['bake-bread']/g" <FILE>
```

- [ ] **Step 8.3: Verify 0 residual single-trigger usage**

```bash
grep -rn "trigger: '\(harvest\|anytime\|bake-bread\)'" shared/cards/ 2>/dev/null
```
Expected: 0 matches.

- [ ] **Step 8.4: Remove `trigger?` field from CardExchange type**

Modify `shared/cards/types.ts`. Find:
```ts
export type CardExchange = {
  from: Partial<Resource>
  to: Partial<Resource>
  sourceId: string
  max?: number
  trigger?: ExchangeWindow      // ← legacy, remove
  triggers: ExchangeWindow[]    // ← keep this
}
```

Remove the `trigger?` line.

- [ ] **Step 8.5: Remove exchangeTriggers helper if exists**

```bash
grep -n 'exchangeTriggers' shared/actions/effects/exchange.ts shared/cards/types.ts
```

If found:
- Remove the helper function definition
- Find all callers and replace `exchangeTriggers(ex)` with `ex.triggers`:

```bash
grep -rn 'exchangeTriggers(' shared/ server/ 2>/dev/null
# For each: replace `exchangeTriggers(ex)` with `ex.triggers`
```

- [ ] **Step 8.6: E53 triggers: [] for listener-only**

Modify `shared/cards/E/E53_BoarSpear.ts`:

```ts
exchanges: [
  { from: { boar: 1 }, to: { food: 4 }, sourceId: 'E53_BoarSpear',
    triggers: [] },   // ← was triggers: ['anytime']; now empty (listener-only per BGA)
]
```

- [ ] **Step 8.7: Update E53 tests for listener-only**

Run existing tests:
```bash
pnpm exec vitest run server/__tests__/E53*-session.test.ts
```

If any test asserts E53 trade visible in anytime exchange action prompt → flip to assert NOT visible. Specifically:
- "anytime exchange shows E53 boar→food" → test should now assert E53 NOT in `getExchangesInWindow(player, 'anytime')`
- Listener-triggered path (gain/collect/receive after with boar > 0) → unchanged

- [ ] **Step 8.8: Run full tests + lint + build**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
```
Expected: all green.

- [ ] **Step 8.9: Commit**

```bash
git add -A
git commit -m "refactor(exchange triggers): unify trigger array + E53 listener-only"
```

---

## Task 9: Documentation Sync

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`
- Modify: `docs/ENGINE_ARCHITECTURE.md`
- Modify: `docs/CUSTOM_CARD_SANDBOX.md`
- Modify: `client/services/llmPrompts.ts` (if any new public actions/hooks added)
- Verify: `pnpm run check:prompt-sync` passes

- [ ] **Step 9.1: Update card_progress.md changelog**

Append to §2.0:

```markdown
- **2026-04-30 Sprint 6b — effects/ 反模式清理 + 6a follow-up（4 batch + 2 收尾）**：
  - **Batch A**：删 dead code（实际验证 1-3 个真 dead）+ 移 ~10 helper 文件到新建 `shared/actions/helpers/`（pay-helpers / cost-preview / room-payment / placement-availability / placement-constants / selection / selection-effect-registry [feed-family]）。
  - **Batch B**：新增 `registerAdHocAction(def)` 基础设施，id 强制 `card_` 前缀；8-10 张单卡专用 effect（grain-thief-protect / scythe-harvest-field / build-farmhand-room / mark-card-observed / discard-from-hand / first-player 等）内联到卡文件，删原 effects/ 文件；多卡共用文件按需移 helpers/ 或 shared/cards/shared-actions.ts。
  - **Batch C**：51 张卡 caller `flag-card` (39) / `unflag-card` (8) / `write-card-extra-data` (~1) / `set-card-infobox` (~2) / `clear-card-infobox` (~1) → 全替换 `special-effect` kind 参数化 leaf；删 5 个 effects/ 文件 + i18n keys + internal-actions 注册。
  - **Batch D**：4 张 mutation 反模式清理（E149 resolveChoice → SEQ + special-effect / E38 listener handler → flow with special-effect leaf / D134 listener → SEQ + targetPlayerId / C104 PlayerActionCard execute 不立即 mutate，resolveChoice 走 SEQ 含 special-effect + gain）；special-effect 加 `actionContext.targetPlayerId` 支持跨玩家 mutation。
  - **6a follow-up①**：18 张已用 `trigger: 'X'` 单数的卡迁移到 `triggers: [...]` 数组；删 `CardExchange.trigger` 字段 + `exchangeTriggers` 兼容 helper。
  - **6a follow-up②**：E53 metadata `triggers: []`（仅 listener 触发，对齐 BGA listener-only）；E53 anytime exchange 测试翻转。
  - effects/ 文件数 63 → ~26-30（接近 BGA 22 + 必要扩展）。spec / plan：`docs/superpowers/specs/2026-04-30-sprint-6b-effects-cleanup-design.md` / `docs/superpowers/plans/2026-04-30-sprint-6b-effects-cleanup.md`。
```

- [ ] **Step 9.2: Update card_progress.md §3 infrastructure**

Append:

```markdown
| **`registerAdHocAction` 卡内 ActionDefinition 注册**（2026-04-30, Sprint 6b） | ✅ | `shared/actions/effects/registry.ts` 提供 `registerAdHocAction(def)` / `getAdHocAction(id)` / `getAllAdHocActions()`。id 强制 `card_` 前缀；接入 `getActionDefinition` lookup fallback（shared/actions/index.ts）。LLM workshop 不暴露（ast-validator 不放行 `card_*` 前缀）。用例：8-10 张单卡专用 effect 内联到卡文件实现卡牌闭包。|
| **`special-effect` `actionContext.targetPlayerId`**（2026-04-30, Sprint 6b） | ✅ | `actionContext.targetPlayerId?: string` 让 special-effect mutation 路由到指定玩家（默认 actor，传入则查 state.players）。用例：D134 OysterEater 给 owner 累加 skipNextPlacement，actor 是 fishing 触发玩家不一定是 owner。 |
| **`CardExchange.triggers` 数组化完成**（2026-04-30, Sprint 6b） | ✅ | 删除 `trigger?: ExchangeWindow`（单数 legacy）字段，仅保留 `triggers: ExchangeWindow[]` 数组。18 张 6a 时遗留单数语法的卡迁移完成。E53 设 `triggers: []` 对齐 BGA listener-only 语义。|
| **`shared/actions/helpers/` 新目录**（2026-04-30, Sprint 6b） | ✅ | 把 ~10 个 helper 文件从 `effects/` 迁出（pay-helpers / cost-preview / room-payment / placement-availability / placement-constants / selection / selection-effect-registry / [feed-family]），让 `effects/` 仅剩 ActionDefinition。|
```

- [ ] **Step 9.3: Update card_progress.md §6 follow-up section**

Remove the entries for the 4 mutation cards (E149 / E38 / D134 / C104) since they are now done.
Remove the `flag-card / unflag-card 重定向到 special-effect` line — done.

- [ ] **Step 9.4: Update card_progress.md §8 timeline**

Append:

```markdown
| Sprint 6b (effects/ cleanup + 6a follow-up: 4 batch + 2 收尾, 63→~26-30 files) | 04-30 | 0 | 822 | 92.1% |
```

- [ ] **Step 9.5: Update master-plan.md §1 / §8**

Update Sprint 6 row in §8 — progress notation includes 6b (~6.5-8d). Add 6b entries to spec / plan / branch columns.

- [ ] **Step 9.6: Update ENGINE_ARCHITECTURE.md**

Append after §15.11 (from 6a):

```markdown
## 15.12 Ad-Hoc Action Registry (Sprint 6b)

`shared/actions/effects/registry.ts` provides per-card `ActionDefinition` registration. Cards that need a single-card-specific action call `registerAdHocAction(def)` at module load time. ID convention: `'card_<CARD_ID>_<short-name>'`.

Integration: `getActionDefinition(actionId)` in `shared/actions/index.ts:104` falls back to `getAdHocAction(actionId)` when the static lookup misses. This keeps single-card actions out of the static `internal-actions.ts` import list, preserving the "card encapsulation" principle (CLAUDE.md: 卡牌特殊性能在卡牌文件内部闭包).

**Constraints:**
- ID must start with `'card_'` (enforced; throws on register otherwise)
- Duplicate registration throws (catches accidental double-load)
- LLM workshop sandbox does NOT expose ad-hoc actions: `card_*` actionIds are blocked by `shared/custom-code/ast-validator.ts` actionId allowlist (no entry added).

## 15.13 special-effect targetPlayerId Routing (Sprint 6b)

`actionContext.targetPlayerId?: string` extends `special-effect` execute to mutate a specific player (default: `context.player` = actor). Used when a card listener's owner ≠ actor and the mutation should land on the owner.

Example: D134 OysterEater listens to ALL players' fishing place-farmer; the cardStates `skipNextPlacement` must increment on the **owner** (card-holder), not the actor. The listener emits:
```ts
{ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'increment-extra-data', key: 'skipNextPlacement', amount: 1 },
  actionContext: { targetPlayerId: ownerPlayerId } }
```

If `targetPlayerId` is unset or the player ID is not found in state, mutation falls back to `context.player`.

## 15.14 Helper Directory Split (Sprint 6b)

`shared/actions/helpers/` (new) holds non-`ActionDefinition` modules previously misplaced in `shared/actions/effects/`:
- `pay-helpers.ts` / `cost-preview.ts` / `room-payment.ts` (pay infrastructure)
- `placement-availability.ts` / `placement-constants.ts` (placement rules)
- `selection.ts` / `selection-effect-registry.ts` (UI selection)

`effects/` is now reserved for `ActionDefinition` exports only.
```

- [ ] **Step 9.7: Update CUSTOM_CARD_SANDBOX.md**

The ad-hoc registry is intentionally NOT exposed to LLM workshop. Add a clarifying note:

In a section about "available actions" or similar, add:

```markdown
**Ad-hoc card actions (`card_*` prefix)**: These are repo-internal, single-card actions registered via `registerAdHocAction`. Workshop-generated cards CANNOT dispatch them; the ast-validator's actionId allowlist excludes the `card_*` prefix. If you need a card-specific action in workshop, write the mutation inline using `special-effect` (`set-flag` / `set-extra-data` / `set-infobox`) or the standard `gain` / etc. actions.
```

Run prompt-sync verification:

```bash
pnpm run check:prompt-sync 2>&1 | tail -10
```
Expected: GREEN. If drift, add missing hook/identifier to CUSTOM_CARD_SANDBOX.md or llmPrompts.ts in same commit.

- [ ] **Step 9.8: Final test sweep + lint + build**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm test:slow 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
pnpm run check:prompt-sync 2>&1 | tail -5
pnpm run check:catalog-types 2>&1 | tail -3
```
All must be GREEN.

- [ ] **Step 9.9: Commit docs**

```bash
git add docs/card_progress.md docs/master-plan.md docs/ENGINE_ARCHITECTURE.md docs/CUSTOM_CARD_SANDBOX.md client/services/llmPrompts.ts
git commit -m "docs: sync card_progress / master-plan / ENGINE_ARCHITECTURE / CUSTOM_CARD_SANDBOX for sprint-6b"
```

---

## Final Validation

- [ ] **Step F.1: Inspect commit list**

```bash
git log --oneline origin/main..HEAD
```

Expected: 9 commits (Tasks 1-9, listed sequentially).

- [ ] **Step F.2: effects/ file count check**

```bash
ls shared/actions/effects/*.ts | grep -v __tests__ | wc -l
```
Expected: 26-30 (down from 63). Compare with BGA Actions count:
```bash
ls /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Actions/ | wc -l
# Expected: 22
```

- [ ] **Step F.3: Final test + lint + build sweep**

```bash
pnpm test:fast 2>&1 | tail -5
pnpm test:slow 2>&1 | tail -5
pnpm run lint 2>&1 | tail -3
pnpm run build 2>&1 | tail -3
pnpm run check:prompt-sync 2>&1 | tail -5
pnpm run check:catalog-types 2>&1 | tail -3
```
All must be GREEN.

- [ ] **Step F.4: Hand off for push**

Report:
> "Sprint 6b implementation complete. 9 commits ready on `sprint-6b-effects-cleanup` branch.
> Tests: fast PASS, slow PASS, lint 0 errors, build success, prompt-sync GREEN, catalog-types GREEN.
> effects/ file count: 63 → X (close to BGA's 22).
> Push command (manual, after rebase if main moved):
> ```bash
> cd /data00/home/xuxinhao.titan/raw/open-agricola
> git fetch origin main
> # If main moved: cd .worktree/sprint-6b-effects-cleanup && git rebase origin/main
> git checkout main && git merge --ff-only sprint-6b-effects-cleanup && git push origin main
> ```
> Then verify CI run on https://github.com/titanxxh/open-agricola/actions."

---

## Spec Coverage Self-Check

- [x] Spec §2.1 dead code → Task 1 Steps 1.1-1.3
- [x] Spec §2.2 helper move → Task 1 Steps 1.4-1.7
- [x] Spec §3 ad-hoc registry → Task 2
- [x] Spec §3.2-3.5 single-card inline → Task 3
- [x] Spec §4 51 caller migration → Task 5
- [x] Spec §4.3 5 effect file deletion → Task 6
- [x] Spec §5.1 targetPlayerId → Task 4
- [x] Spec §5.2-5.5 mutation cleanup (E149/E38/D134/C104) → Task 7 sub-batches A-D
- [x] Spec §6.1 trigger array unification → Task 8 Steps 8.1-8.5
- [x] Spec §6.2 E53 listener-only → Task 8 Steps 8.6-8.7
- [x] Spec §7 docs sync → Task 9
- [x] Spec §8 risks → Risk mitigations in Task verify steps (1.1, 5.12, 6.1)
- [x] Spec §9 DoD → Final Validation steps F.1-F.4
- [x] Spec §10 工时 ~6.5-8d → Task count and step granularity match

---

## Notes for Implementer

1. **Test boilerplate**: Always copy from a recently-committed neighbor (e.g., `server/__tests__/A4_Baseboards-session.test.ts` for session tests, `shared/cards/__tests__/A151_Minstrel.test.ts` for unit tests). Do not invent helpers.

2. **Plan adaptation**: If actual code differs from plan assumptions (e.g., resolveChoice signature, listener context fields), adapt to existing convention. Plan structure decisions (registry pattern, 4-kind dispatcher, targetPlayerId field) are non-negotiable.

3. **Batch C migration scale**: 51 callers across 5 decks is mechanical but error-prone. Always Step 5.12 grep verify 0 residual before Step 6.3 file deletion. If Step 5.12 finds any residual, fix first; do NOT delete files until 0 callers.

4. **`pnpm run check:prompt-sync` discipline**: Run this command before committing Task 6 (effect file deletion) and Task 9 (docs). The CI failed in 5b/6a due to skipped prompt-sync; do NOT commit if drift detected.

5. **Mutation cleanup principle**: Listener handler MUST NOT call `writeCardExtraData / setCardFlag / writeCardInfobox` directly. Mutation must be in a returned flow's `special-effect` leaf so the engine sees and replays it. Verify each refactor with a "decline SEQ" test if applicable.

6. **D157 was Occupation** (corrected post-6a hot-fix in main): D157_PartyOrganizer.ts uses `class Occupation` and is registered in `occupationCards` in catalog.ts. Do NOT touch this in 6b.

7. **C104 PlayerActionCard interface verification (Step 7.D.2)**: If `resolveChoice` only allows `{type:'ok'}` / `{type:'choice'}`, you must extend the type union before refactoring C104. Verify the current type signature in `shared/cards/types.ts` PlayerActionCard or `shared/cards/player-action-space.ts`.

8. **Single-trigger search (Step 8.1)**: The grep is anchored on `trigger: '`. If a card uses `triggers: 'X'` (singular value, plural key) the regex won't catch it; do a parallel grep with that pattern just in case:
   ```bash
   grep -rn "triggers: '\(harvest\|anytime\|bake-bread\)'" shared/cards/ 2>/dev/null
   ```

9. **`internal-actions.ts` cleanup**: After Task 6, the static action list shrinks by 5 entries. Verify the export array still type-checks; remove orphaned imports.

10. **Per-batch commit gating**: Each Task's tests MUST pass before commit. Run `pnpm test:fast` after each Task. Avoid batched failing commits; clean revertability is the goal.
