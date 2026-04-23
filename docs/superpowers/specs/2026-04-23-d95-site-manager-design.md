# D95 Site Manager — BGA Alignment

**Status:** design approved, ready for implementation
**Scope:** single-card change
**Owner:** `shared/cards/D/D95_SiteManager.ts`

## 1. Card text

> When you play this card, immediately build a major improvement. When
> paying its cost, you can replace up to 1 building resource of each
> type with 1 <FOOD> each.

Four building resources → `wood`, `clay`, `stone`, `reed`. For each
type, the player chooses independently whether to substitute 1 unit of
that type with 1 food.

## 2. BGA reference

`output/bga-agricola/modules/php/Cards/D/D95_SiteManager.php`:

- `onBuy`: flag card → optional `improvement-any` with `types=[MAJOR]`
  → unflag.
- `onPlayerComputeCardCosts`: if flagged, enumerate `2^4 − 1 = 15`
  subsets of `{wood, clay, stone, reed}`; for each subset, build an
  alternative fee by subtracting 1 of each selected resource and adding
  the same count of food. These are appended to `args['costs']['trades']`
  (which in BGA doubles as the alternative-fee list).
- `orderComputeCardCosts`: declares D95 must run before A143 / C27 /
  B95. **We intentionally do not implement ordering** — see §5.

## 3. Our current (simplified) implementation

`shared/cards/D/D95_SiteManager.ts` today:

- `onBuyListener` — matches BGA, keep as-is.
- `computeCostsListener` — greedy: for each building resource in the
  improvement base cost, if the player lacks it AND has food, substitute
  1 unit. Returns a flat `{ costs: delta }`.

Problems with the greedy path:

- Player is never offered a choice even when multiple food-substitution
  plans are all affordable.
- Dead branch: `actions` includes `'minor-improvement'` but D95 only
  targets majors (see BGA `types=[MAJOR]`). The current `onBuy` flow
  sets `params: { types: ['major'] }` so the minor branch is
  unreachable — pure dead code.

## 4. Target implementation

Replace the greedy `computeCosts` handler with a listener that returns
four **optional** `Bonus` entries, one per building resource:

```ts
return {
  bonuses: [
    { optional: true, discount: { wood: 1, food: -1 },  sources: [CARD_ID] },
    { optional: true, discount: { clay: 1, food: -1 },  sources: [CARD_ID] },
    { optional: true, discount: { stone: 1, food: -1 }, sources: [CARD_ID] },
    { optional: true, discount: { reed: 1, food: -1 },  sources: [CARD_ID] },
  ],
}
```

`discount` sign convention (already used by `A123_FrameBuilder` and
`applyDiscountToFee` / `applyBonus`): **positive = reduce that
resource's cost, negative = add to it**. So `{ wood: 1, food: -1 }`
expresses "save 1 wood, pay 1 additional food" — the BGA substitution.

### Why this works without any core changes

1. `resolveCardCostWithModifiers` (shared/actions/effects/pay-helpers.ts)
   already collects `computeCosts` listener output's `bonuses` into the
   `ComplexCost.bonuses` array.
2. `computeAllBuyableCombinations` hands that to the bonus expander.
   `applyOptionalBonus` unions every fee with both "skip this bonus"
   and "take this bonus". Four independent optional bonuses → 2⁴ = 16
   fee variants. Each taken path carries the `sources` array into the
   resulting `PaymentSolution.bonusUsed`.
3. `keepOnlyOptimals` (Pareto-dominance) prunes variants that pay
   strictly more. Example: if base cost has no stone, the
   "take stone bonus" variant ends up `{ …, food: 1 }` relative to
   skip — strictly worse — pruned.
4. `buildPaymentChoiceResult` — when more than one non-dominated
   variant survives — emits a `prompt.selectPayment` choice with an
   option per variant.
5. Payment option rendering (just added) reads `sourceCards` from
   `solution.bonusUsed` and renders "via Site Manager" under the
   resource icons; `log.actionDetail.detailParts.bonusSources` picks
   it up for the post-action log line.

Net: zero changes to `shared/actions/effects/*` or `shared/session/*`.

### Cleanup in the same file

- Drop `BUILDING_RESOURCES`, the delta computation, `getMajorCardEffect`
  / `getMinorImprovement` / `Resource` imports.
- Drop the "Known limitation" comment block from the file header.
- Drop `'minor-improvement'` from the listener's `actions` array (dead
  branch).
- Expected size: ~50 lines (BGA reference is 92 lines).

## 5. Deliberate deviation — no listener ordering

BGA's `orderComputeCardCosts: [['<', 'A143_Stonecutter'], ['<',
'C27_Blueprint'], ['<', 'B95_MasterBricklayer']]` serialises stacking
order among cost-modifier cards.

We do not implement listener ordering. When multiple cost modifiers
stack, our bonus expander produces the Pareto-optimal union over
**all** possible orderings. That is a strict superset of BGA's
single-order output — more correct, not less. Record in
`docs/card_progress.md` §2.5 as an intentional deviation (or simply
note it in §2.1 since no player-facing divergence results from it on
the cards we currently ship).

## 6. Test plan

### 6.1 Session test — new file

`server/__tests__/D95_SiteManager-session.test.ts` — primary coverage
layer per CLAUDE.md.

Setup (2-player session, `loadState`):

- Player 0: `occupationHand.push('D95_SiteManager')`, workers-at-home
  ≥ 1 (to play occupation), `houseType: 'wood'`, `rooms: 2`.
- Player 0 resources fixture varies per case (see below).
- `state.availableMajorImprovements`: keep defaults so a target major
  is pickable.
- Pick `Major_StoneOven` as the session target for its mixed
  cost `{ stone: 1, food: 2 }` (food already in the base cost makes a
  nice regression for "food substitution on a cost that already
  includes food" — the bonus should NOT swap the `food: 2` portion).

Cases (all drive the session via `takeAction('lessons')` +
`resolveChoice` to play D95 from hand, or — simpler — directly call
`takeAnytimeAction` / `play-occupation` if a helper exists):

- **A. Multi-option prompt.** Player has `{ wood: 3, clay: 0, stone: 2,
  reed: 0, food: 5 }`, target major with cost `{ wood: 2, stone: 1 }`
  (Major_Well or similar — confirm available). Both the "pay 2 wood +
  1 stone" path and at least one food-substitution path are affordable
  and Pareto-incomparable.
  - Assert `resp.pending.type === 'choice'`,
    `resp.pending.promptKey === 'prompt.selectPayment'`.
  - Assert ≥ 2 options; at least one option has
    `labelParams.sourceCards` containing `'D95_SiteManager'`; the
    unsubstituted option does not.
- **B. Single affordable path → auto-pay, no prompt.** Player resources
  chosen so that after required substitutions only one plan remains
  affordable. Example: `{ wood: 0, clay: 0, stone: 1, reed: 0, food: 5 }`
  against a major costing `{ wood: 1, stone: 1 }` — only the
  wood→food variant is affordable.
  - Assert no choice prompt; player state reflects the paid cost;
    `state.log[0].key === 'log.actionDetail'` with
    `detailParts.bonusSources === ['D95_SiteManager']`.
- **C. Not affordable even with substitutions.** Player has no food
  and insufficient wood. Optional `improvement-any` must decline
  (`declineable`); D95 onBuy still completes, card is in
  `occupationPlayed`.
  - Assert `state.players[0].occupationPlayed.includes('D95_SiteManager')`
    and no new improvement added.
- **D. Cost already contains food (regression).** Target cost
  `{ stone: 1, food: 2 }` (Major_StoneOven). D95 must NOT try to
  "substitute food with food" — the bonus discounts only
  wood/clay/stone/reed. Player with enough stone + food should see at
  most a couple of Pareto-relevant options.
  - Assert `detailParts.costs.food >= 2` (base food cost survives) on
    any chosen path.
- **E. Decline the optional improvement-any.** Player affords
  substitutions but declines. D95's onBuy flow finishes cleanly.
  - Assert no `log.actionDetail` for improvement-any; D95 in
    `occupationPlayed`; resources unchanged.

### 6.2 Shared unit test — optional

`shared/cards/__tests__/D95_SiteManager.test.ts`: if the file exists,
update it; else add a brief one that constructs the player + mock
`ComplexCost { fee: { wood: 2, clay: 1 } }`, piggybacking on
`computeAllBuyableCombinations` (as `A123_FrameBuilder.test.ts` does).
Asserts the bonus expander yields the expected set of non-dominated
solutions and each non-skip solution's `bonusUsed` contains
`'D95_SiteManager'`.

### 6.3 Regression

- `pnpm test:fast` + `pnpm test:slow` both green.
- `pnpm run build` (tsc + vite) clean.
- `pnpm run lint` — 0 errors (warnings ok).

## 7. Documentation sync

`docs/card_progress.md`:

- §2.0 — add a 2026-04-23 changelog entry describing the migration and
  its reliance on the now-shipped payment-choice prompt + `sourceCards`
  attribution.
- §2.1 — add D95 row with "D95 SiteManager | onBuy build-major free +
  2⁴ optional food-substitution bonuses (wood/clay/stone/reed → food)
  via `computeCosts` listener returning `bonuses[]` | 复用 Bonus.optional
  + keepOnlyOptimals + prompt.selectPayment".
- §2.2 — remove the D95 row.
- §2.5 (optional) — note we skip BGA's `orderComputeCardCosts` by
  design.

`docs/superpowers/specs/2026-04-23-d95-site-manager-design.md`
(this file) — committed with the implementation.

## 8. Out of scope

- Listener ordering mechanism for `computeCosts`. Different concern,
  separate spec if ever needed (see `docs/superpowers/specs/2026-04-20-cost-modifier-coverage-design.md`
  for the broader cost-modifier roadmap).
- Fixes to unrelated cards that also have greedy/simplified cost
  modifiers.

## 9. Acceptance criteria

1. `shared/cards/D/D95_SiteManager.ts` `computeCosts` listener returns
   only `{ bonuses: Bonus[] }` (no more `{ costs: delta }`).
2. Listener's `actions` list is `['improvement-any']` only.
3. File size ≤ 60 lines.
4. New session tests cover cases A–E.
5. All existing `pnpm test:fast` / `:slow` tests pass.
6. `docs/card_progress.md` updated per §7.
