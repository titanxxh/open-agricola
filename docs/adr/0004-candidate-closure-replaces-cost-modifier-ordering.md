# 4. Candidate closure replaces cost modifier ordering

- Status: Accepted
- Date: 2026-06-10

## Context

The reference implementation orders cost modifiers with hand-written partial orders and a topological sort, because each card transforms the current candidate set and a later card sees earlier products (for example, D15 replacing clay lets B145 then trade wood for reed). OA had grown numeric `order` fields instead: `CardListenerRegistration.order` for card-purchase transforms (fixed-price cards at `order: 100`) and `TradeModifier.order` for unit trades. Numeric order is the same hand-written partial order in another form, and results depended on the card pool.

The reference order only prevents missing candidates; it never forbids a combination. Every fixed-order product is a subset of the union over all orders, which makes an order-free model possible.

## Decision

- **Candidate Closure**: the cost candidate set is closed under the card cost transforms. Each transform below its `maxUses` (default 1) is applied to every candidate repeatedly, new candidates are de-duplicated and merged, until a fixed point. The result is the union over all orders and is independent of registration order.
- **Mandatory Saturation**: each transform is `mandatory` ("costs N less") or optional ("can pay X instead"). The output keeps only saturated candidates, those to which no mandatory transform still applies; unsaturated ones are intermediate. Mandatory chains converge to the reference's final set in any order; extra options come only from optional branches.
- Fixed-price cards are input-independent optional transforms; closure produces one fixed row per candidate and de-duplicates it. No priority field is needed.
- All order fields are deleted: `CardListenerRegistration.order`, `TradeModifier.order` and the trailing-listener order fallback.
- The closure core is shared by `resolveCardCostWithModifiersDetailed` (card purchase and occupation) and `buildUnitCostOptions` (unit trades). The two cost paths of ADR 0003 remain separate.
- Traversal tie-breaks by sorted source ID for reproducibility and stable attribution only; it is not card semantics.
- **Representative rows**: closure visits with a key that includes sources, but the output keeps one representative row per resources + `originalFeeIndex` group, choosing the fewest sources and then the canonical key order. Cards on an unselected chain do not appear in that option's attribution.
- **Dominance pruning** runs in the solver after resource-feasibility filtering, never at the candidate layer: a solution that pays at least as much of every resource and strictly more of one is removed. Exempt from pruning: different payment-path identities (`ComplexCost.feeIdentities` → `PaymentSolution.feeIdentity`), bonus choices marked `choiceAffectsState`, and card payment.
- **Card-provided payment resources** replace payment-side trade side effects. A card declares a provider (availability, covered resources, consumption source); `resourcesPaid` keeps the virtual resource's own key, so dominance compares by payment-resource key and inventory food never dominates a different food source. Virtual resources never enter `PlayerState.resources` or cost rows. `Trade.sideEffect` remains only for exchange actions.
- Parity criterion: the reference's combinations ⊆ OA candidates; with only mandatory transforms the sets are equal; shuffling modifier registration leaves the output unchanged.

## Consequences

- Card authors declare only local semantics (what is replaced or discounted, mandatory or not, how many uses) and never a relation to other cards; adding a card cannot silently change existing combinations.
- Optional branches can offer a legal superset of the reference's single-order options; this is an accepted difference.
- Worst-case closure is exponential; candidates are bounded by base candidates × ∏(maxUses + 1) and a defensive limit warns.
- Each card's mandatory / optional mapping must follow its printed wording.

## Alternatives considered

- A reference-style topological sort, or numeric order with lint rules: the same maintenance burden and pseudo-determinism.
- Inferring dependency edges and sorting: still an order model, with cycle errors, and no more expressive than closure.
- A separate mandatory pre-pass plus optional closure: two engines, and mandatory and optional transforms still interleave.
- Keeping intermediate rows plus candidate-layer pruning: resource-blind pruning removes the only row a poor player can afford.
- Showing the union of sources for equivalent rows: misattributes alternative cards as acting together.
