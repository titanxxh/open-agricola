# Sprint 6e — C62 Cookery Extension stub completion

**Date:** 2026-05-01
**Branch / Worktree:** `sprint-6e-c62` at `.worktree/sprint-6e-c62`
**Scope:** Last remaining real stub on `card_progress.md` §2.7 (`C62_CookeryExtension`).
**Effort estimate:** ~1 day (1 card + 1 generic listener phase + 1 sideEffect kind + 1 small helper).

## 0. Goal

Complete C62 alignment with BGA so `card_progress.md` §1 reaches 834/892 (93.5%) and the §2.7 "remaining real stub" list goes empty (Sprint 7 P3 simplifications still optional / deferred per master-plan §0).

## 1. BGA reference behavior

Source: `bga-agricola/modules/php/Cards/C/C62_CookeryExtension.php`.

```php
public function getExchanges()
{
  $exchanges = parent::getExchanges();
  // collect every player-played card with canCook() == true (isCookery)
  $cookeries = [...$player->getCards(MAJOR), ...$player->getCards(MINOR)] |> filter canCook();

  $validFrom = [VEGETABLE, SHEEP, PIG, CATTLE];
  foreach ($cookeries as $cookery) {
    $flag   = $cookery->id;                        // shared per-cookery flag
    $source = $cookery->getName() . ' (x2)';
    foreach ($cookery->getExchanges() as $exchange) {
      if (!is_null($exchange['triggers']))    continue;   // only anytime entries
      $fromRes = first key of $exchange['from'];
      $fromQty = $exchange['from'][$fromRes];
      if ($fromQty != 1 || !in_array($fromRes, $validFrom)) continue;
      $to = $exchange['to'];
      $to[FOOD] = 2 * $to[FOOD];                          // double food output
      $exchanges[] = [
        'source' => $source,
        'flag'    => $flag,
        'triggers'=> [HARVEST],
        'max'     => 1,
        'from'    => [$fromRes => 1],
        'to'      => $to,
      ];
    }
  }
  // during harvest, drop entries whose flag is already in Globals::getExchangeFlags()
  if (Globals::isHarvest()) {
    $flags = Globals::getExchangeFlags();
    $exchanges = filter ex.flag === null OR not in $flags;
  }
  return $exchanges;
}
```

**Key semantics:**

1. Derived exchanges are **runtime** (depend on currently-played cookery cards).
2. From-set restricted to `{vegetable, sheep, boar, cattle}` with `fromQty == 1` (drops e.g. grain bake-bread entries and any future hypothetical 2-from cookery exchange).
3. `to.food` doubled; other to-resources untouched (in practice cookery only has food output).
4. Harvest-only window (`triggers: [HARVEST]`).
5. Per-cookery flag — using **any** derived trade from a given cookery card spends a shared "used" flag, the other derived entries from the same cookery disappear for the rest of that harvest.
6. Flags reset between harvests (BGA's `Globals::getExchangeFlags()` is harvest-scoped state).
7. C62's own card has no native anytime exchange (`parent::getExchanges()` is empty for this minor).

The `$this->isCorbariusOrDulcinaria = true` flag in BGA is for an expansion/character we do not implement — explicitly out of scope.

## 2. Current state in our codebase

`shared/cards/C/C62_CookeryExtension.ts`:

```ts
// TODO: dynamic exchange generation based on other played cards at harvest time,
// which is not currently supported by our exchange system.
export const C62_CookeryExtension = new MinorImprovement({
  id: 'C62_CookeryExtension', name: 'Cookery Extension', deck: 'C', number: 62,
  category: 'FOOD_PROVIDER',
  desc: ['Each harvest, you can use each of your cooking improvements once to get double the amount of <FOOD> for 1 animal or <VEGETABLE>.'],
  cost: { clay: 2 },
  implemented: false,
})
```

Stub. No listeners, no effect, no derived exchanges.

Existing infra we will reuse:

- `CardExchange.triggers: ('anytime' | 'harvest' | 'bake-bread' | ...)[]` (Sprint 6b array form).
- `CardExchange.sourceId` propagated through `exchangeToTrade()` (Sprint 6b).
- `CardExchange.sideEffect: TradeSideEffect` already wired through `exchangeToTrade` (Sprint 6d).
- `Trade.sideEffect` dispatcher `applyTradeSideEffect(state, player, eff, times, sourceCard)` invoked from work / anytime / harvest paths (Sprint 5c + 6d).
- `getExchangesInWindow(player, window)` — single source of truth for "what trades are available in this window" (Sprint 6a + 6b).
- `runPhaseListeners` / `card-listeners.collectComputeChoiceCandidates` pattern (Sprint 6d) — copy this structure for the new phase.
- `effect.onStartHarvest` hook (already exists, used by E58 LunchtimeBeer).
- `cardStates[CARD_ID].extraData` for per-card local state (already used everywhere).

## 3. Architecture — 1 generic extension + 1 sideEffect variant + 1 helper

### 3.1 New listener phase `computeExchanges`

Same pattern as `computeChoiceCandidates` (Sprint 6d §15.22). Lets cards inject runtime-derived `CardExchange` entries into the exchange pool without modifying the metadata-driven scan.

**Phase declaration:** `'computeExchanges'` added to the `ListenerPhase` union (`shared/actions/hooks.ts` or wherever phases live).

**Handler signature:**

```ts
type ComputeExchangesContext = {
  state: GameState
  player: PlayerState
  window: ExchangeWindow   // 'anytime' | 'harvest' | 'bake-bread' | ...
}

type ComputeExchangesResult = { extraExchanges: CardExchange[] } | null
```

**Helper:** `collectComputeExchanges(state, player, window) → Trade[]` in `shared/cards/card-listeners.ts`:

- Iterate listeners with `phases.includes('computeExchanges')`.
- Call handler with `{ state, player, window }`.
- Take returned `extraExchanges`, run each through `exchangeToTrade(ex, listenerCardId)` to get a Trade.
- Return concatenated Trade[].

### 3.2 Integration into `getExchangesInWindow`

`shared/actions/effects/exchange.ts`:

```ts
export const getExchangesInWindow = (
  player: PlayerState,
  window: ExchangeWindow,
  state?: GameState,            // NEW optional 4th-ish param
): Trade[] => {
  const out: Trade[] = []
  for (const cardId of playedCardIds(player)) {
    for (const ex of getCardExchanges(cardId)) {
      if ((ex.triggers ?? []).includes(window)) {
        out.push(exchangeToTrade(ex, cardId))
      }
    }
  }
  if (state) {
    out.push(...collectComputeExchanges(state, player, window))
  }
  return out
}
```

`state` is optional for backward compatibility — old call sites that don't pass state (mostly unit tests on bare players) just get the metadata-only pool, exactly today's behavior. Production call sites that already have `state` in scope (`game-core.ts:589` harvest check, harvest feed path, anytime exchange action) get upgraded to pass it.

**Affected production call sites** (audit list, will be filled exhaustively in plan):

- `shared/session/game-core.ts:589-590` — harvest exchange-window probe
- `shared/actions/effects/exchange.ts:347` `buildExchangeOptions` (anytime path) — passes state if exposed by caller; default `undefined` keeps old behavior
- harvest-feed trade prompts inside `game-core.confirmHarvestFeed` / related helpers
- `hasAffordableCookeryTrade` / `hasAffordableTradeForIds` — these gate prompts/affordability and need to see derived trades during harvest, so must accept and forward `state`

We will systematically update production callers; pure unit-test callers without state remain functional.

### 3.3 New `Trade.sideEffect` kind: `pushExtraDataValue`

Generic — lets any future card record "this resource bundle / source was used" without bespoke kinds.

```ts
type TradeSideEffect =
  | { type: 'drainSpace';   spaceId: string;  resource: ResourceKey }      // Sprint 5c
  | { type: 'bonusVp';      amount: number }                                // Sprint 6d
  | { type: 'pushExtraDataValue';                                           // Sprint 6e
      sourceCard: string;
      key: string;
      value: string }
```

Dispatcher case in `applyTradeSideEffect`:

```ts
case 'pushExtraDataValue': {
  const cs = (player.cardStates[eff.sourceCard] ??= {})
  const ed = (cs.extraData ??= {})
  const arr = (ed[eff.key] ??= []) as string[]
  if (!arr.includes(eff.value)) arr.push(eff.value)
  break
}
```

Note: `times` is not used for this kind — pushing the same value N times is idempotent (we dedupe). C62 only ever fires `times === 1` because derived trades carry `max: 1`.

### 3.4 New helper: `getPlayerCookeryCards`

`shared/cards/helpers/cookery.ts`:

```ts
export const getPlayerCookeryCards = (
  player: PlayerState,
): { id: string; exchanges?: CardExchange[] }[] => {
  const out = []
  for (const cardId of [...player.improvements, ...player.minorPlayed]) {
    const major = getMajorCardEffect(cardId)
    if (major?.isCookery) { out.push({ id: cardId, exchanges: major.exchanges }); continue }
    const minor = getRegisteredMinorImprovement(cardId)
    if (minor?.isCookery) out.push({ id: cardId, exchanges: minor.exchanges })
  }
  return out
}
```

This consolidates the inline isCookery scan that `A101_CookeryOutfitter.ts:8-14` already has and `prerequisites.ts:38-39` half-duplicates. We replace those two call sites in this sprint as a small cleanup (in-scope: the helper directly serves C62 and removing the duplicate is the natural use of it).

## 4. C62 implementation

```ts
import { MinorImprovement } from '../types'
import type { CardExchange, MinorImprovementImpl } from '../types'
import { getPlayerCookeryCards } from '../helpers/cookery'

const CARD_ID = 'C62_CookeryExtension'
const VALID_FROM = ['vegetable', 'sheep', 'boar', 'cattle'] as const

export const C62_CookeryExtension = new MinorImprovement({
  id: CARD_ID,
  name: 'Cookery Extension',
  deck: 'C',
  number: 62,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each harvest, you can use each of your cooking improvements once to get double the amount of <FOOD> for 1 animal or <VEGETABLE>.',
  ],
  cost: { clay: 2 },
  implemented: true,
})

export const C62_CookeryExtension_impl: MinorImprovementImpl = {
  listeners: [
    {
      phases: ['computeExchanges'],
      handler: ({ player, window }) => {
        if (window !== 'harvest') return null
        const used = (player.cardStates[CARD_ID]?.extraData?.usedCookeryIds ?? []) as string[]
        const out: CardExchange[] = []
        for (const cookery of getPlayerCookeryCards(player)) {
          if (used.includes(cookery.id)) continue
          for (const ex of cookery.exchanges ?? []) {
            if (!ex.triggers?.includes('anytime')) continue
            const fromKeys = Object.keys(ex.from)
            if (fromKeys.length !== 1) continue
            const fromKey = fromKeys[0]
            if (ex.from[fromKey] !== 1) continue
            if (!(VALID_FROM as readonly string[]).includes(fromKey)) continue
            out.push({
              from: ex.from,
              to: { ...ex.to, food: (ex.to.food ?? 0) * 2 },
              triggers: ['harvest'],
              max: 1,
              sourceId: `${CARD_ID}::${cookery.id}`,
              sideEffect: {
                type: 'pushExtraDataValue',
                sourceCard: CARD_ID,
                key: 'usedCookeryIds',
                value: cookery.id,
              },
            })
          }
        }
        return { extraExchanges: out }
      },
    },
  ],
  effect: {
    id: CARD_ID,
    onStartHarvest: (player) => {
      const cs = (player.cardStates[CARD_ID] ??= {})
      const ed = (cs.extraData ??= {})
      ed.usedCookeryIds = []
      return null
    },
  },
}
```

Card stays close to BGA in line count: ~45 lines including imports, comparable to `bga-agricola/...C62_CookeryExtension.php` (~85 lines including PHP boilerplate, ~50 net logic).

## 5. State lifecycle

```
harvest start  → effect.onStartHarvest resets usedCookeryIds = []
listener fire   → filter cookeries whose id ∈ usedCookeryIds
trade selected  → applyTradeSideEffect dispatches pushExtraDataValue → usedCookeryIds.push(cookeryId)
listener fires again → filtered cookery no longer contributes derived trades
harvest end     → no cleanup needed (next harvest's onStartHarvest re-resets)
end of game     → no special handling, cardStates are part of normal serialization
```

The `pushExtraDataValue` write happens through `applyTradeSideEffect`, which is invoked from all three Trade-application call sites (Sprint 5c + 6d §15.19). Since C62's derived trades are tagged `triggers: ['harvest']`, they only show up in the harvest path — but the kind is generic and works regardless of which path consumes the trade.

## 6. Test plan (session-level)

**File:** `server/__tests__/C62_CookeryExtension-session.test.ts`. ~8-9 cases, ~250 lines.

1. **C62 + Major_Fireplace1, harvest derives doubled vegetable→4food trade.**
   Setup: 2-player, P1 has C62 + Fireplace1 played, 1 vegetable + 1 sheep. Reach harvest. Assert `getExchangesInWindow(P1, 'harvest', state)` contains entry `{ from:{vegetable:1}, to:{food:4}, sourceId:'C62_CookeryExtension::Major_Fireplace1', triggers:['harvest'], max:1 }`.

2. **Same case after using one derived trade — same cookery's other derived entries disappear.**
   P1 uses vegetable→4food. Assert `usedCookeryIds === ['Major_Fireplace1']`. Re-query exchanges, assert no entries with `sourceId` starting `C62_CookeryExtension::Major_Fireplace1`.

3. **C62 + Fireplace1 + CookingHearth1, two cookeries each independently usable once.**
   Use Fireplace1's veg→4food, then assert CookingHearth1's veg→6food still available. Use it. Both flags set.

4. **grain→food bake-bread entry not derived** (even if listed in cookery's exchanges with `triggers:['bake-bread']`).
   Assert no harvest-derived trade with `from:{grain:1}`.

5. **Non-harvest window (anytime / bake-bread) listener does not inject derived trades.**
   `getExchangesInWindow(P1, 'anytime', state)` returns only Fireplace1's native trades, no C62-derived entries.

6. **Cross-harvest reset.**
   Play through to harvest A, use one derived trade. Continue to harvest B. Assert `usedCookeryIds === []` at start of B (re-derived).

7. **Native cookery anytime trade and C62-derived harvest trade coexist** (the Fireplace1 native vegetable→2food anytime stays in anytime window; C62 derived vegetable→4food in harvest window). Independent pools.

8. **C62 with no cookery played → empty derived pool, no errors.**

9. **Harvest-feed integration**: C62 derived trade selected during harvest feed phase actually pays animal and gives doubled food (full Trade.sideEffect dispatch path through `confirmHarvestFeed`, not just metadata read).

## 7. Out of scope

- BGA's `isCorbariusOrDulcinaria` flag and the corresponding character logic — neither character is implemented in this codebase.
- BGA's `MUST_USE_EXCHANGE_WINDOW` ruling enforcement (forced-use during harvest feeding when other animals would starve) — already a generic gameplay concern, not C62-specific.
- Generic "trade mutex group" abstraction beyond what the `pushExtraDataValue` kind provides. If/when another card needs cross-trade exclusion, revisit.
- `parent::getExchanges()` (C62's own native trades) — empty in BGA, we keep it empty.

## 8. Files touched

| File | Change | Approx lines |
| ---- | ------ | ------------ |
| `shared/actions/hooks.ts` (or wherever phase union lives) | Add `'computeExchanges'` to phase union | +1 |
| `shared/cards/card-listeners.ts` | Add `collectComputeExchanges(state, player, window)` helper | +30 |
| `shared/actions/effects/exchange.ts` | `getExchangesInWindow(player, window, state?)` calls collector when state provided | +10 |
| `shared/actions/effects/exchange.ts` | `hasAffordableCookeryTrade(player, state?)` / `hasAffordableTradeForIds(player, tradeIds, state?)` accept and forward state | +5 |
| `shared/session/game-core.ts` | Audit harvest path callers, pass state to `getExchangesInWindow` / `hasAffordableCookeryTrade` | +5 |
| `shared/game/types.ts` | `TradeSideEffect` union add `pushExtraDataValue` variant | +5 |
| `shared/actions/helpers/payment.ts` | `applyTradeSideEffect` switch case `pushExtraDataValue` | +10 |
| `shared/cards/helpers/cookery.ts` (NEW) | `getPlayerCookeryCards(player)` helper | +15 |
| `shared/cards/A/A101_CookeryOutfitter.ts` | Replace inline `isCookeryCard` with helper | -5 / +1 |
| `shared/cards/helpers/prerequisites.ts` | Optionally consolidate isCookery probe via helper | 0-3 |
| `shared/cards/C/C62_CookeryExtension.ts` | Listener + effect + `implemented: true` | +50 / -8 |
| `server/__tests__/C62_CookeryExtension-session.test.ts` (NEW) | ~9 cases | +250 |
| `docs/card_progress.md` | §1 (833 → 834/892 = 93.5%; baseline post-Sprint 6d), §2 changelog, §2.7 strikethrough C62, §7 add 2 entries (computeExchanges phase + pushExtraDataValue kind), §8 timeline | +30 |
| `docs/master-plan.md` | §0 sprint list add 6e row, §0 residual stub 1 → 0, §8 progress row | +5 |
| `docs/ENGINE_ARCHITECTURE.md` | §15.19 union extend `pushExtraDataValue`, new §15.23 `computeExchanges` listener phase | +30 |

Total: ~450 net new lines of which ~250 are tests + ~65 are docs.

## 9. Definition of Done

- C62 has full BGA-aligned listener + effect implementation; `implemented: true`.
- `card_progress.md` §1 totals updated, §2 changelog appended, §2.7 strikethrough C62, §7 lists the two new generic extensions (computeExchanges phase, pushExtraDataValue side-effect kind), §8 timeline appended.
- `master-plan.md` §0 残留 stub 数字降到 0 (for the §2.7 list — Sprint 7 P3 simplifications still separate); §8 progress row added.
- `ENGINE_ARCHITECTURE.md` §15.19 extended, new §15.23 added.
- `pnpm test:fast` green locally before push.
- CI green after push (PR-flow same as 6c / 6d).

## 10. Risk / open questions

- **Listener invocation cost during harvest feed.** Each `getExchangesInWindow` call now optionally runs all `computeExchanges` listeners. The harvest feed path probes affordability frequently. Listeners are O(cookery × cookery.exchanges) — small numbers in practice (max ~4 cookery cards × ~5 exchanges each), should be fine. We will not memoize unless profiling shows it matters.
- **Test-only callers without state.** `exchange-metadata.test.ts` and similar unit tests call `getExchangesInWindow(player, window)` without state. Behavior unchanged for them (no listener injection). Verified by leaving the existing tests untouched — they still pass.
- **`hasAffordableCookeryTrade` semantics.** Today this only inspects `'anytime'` window. C62-derived trades are `'harvest'` window, so they're invisible to anytime-affordability checks — correct, because anytime-cookery prompts shouldn't surface harvest-only entries. The harvest-feed path uses different probes (`getExchangesInWindow(player, 'harvest', state)`) so derived trades are reachable there. We will audit and document.
- **`onStartHarvest` ordering.** If multiple cards reset state in `onStartHarvest`, any ordering issue? C62 only writes to its own `cardStates.C62`, no cross-card interaction. Safe.

## 11. Sequence

(Will be detailed in the writing-plans output. High level:)

1. Add `'computeExchanges'` phase + `collectComputeExchanges` helper.
2. Wire into `getExchangesInWindow` (state-aware variant).
3. Audit and update production callers to pass state.
4. Add `pushExtraDataValue` kind + dispatcher case.
5. Add `getPlayerCookeryCards` helper, refactor A101 inline scan.
6. Write C62 listener + effect.
7. Tests.
8. Docs sync.
9. PR.
