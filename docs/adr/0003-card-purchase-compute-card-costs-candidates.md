# 3. Card and occupation costs use a cost-candidate pipeline

- Status: Accepted (ordering and de-duplication are defined by ADR 0004)
- Date: 2026-06-06

## Context

The reference implementation passes the current card cost candidates to each card, which may append, modify or replace them. OA aggregated `{ costs, bonuses, trades }` from `computeCosts.improvement` listeners and merged them, which cannot express a card that derives new candidates from every current one (D117 Wood Expert), or a cost that depends on a base payment path chosen first (B065 Grain Depot). The reference orders these transforms with a topological sort, which OA does not want card authors to declare.

E060 Working Gloves later needed the same mechanism for occupation fees: it replaces up to two food of the amount owed with one building resource, without producing change ([#1168](https://github.com/titanxxh/open-agricola/issues/1168)).

## Decision

- Major and minor improvement purchases and occupation fees go through a **ComputeCardCosts candidate pipeline**. Its input is a Cost Candidate List normalized from the card's `fee` / `fees`; cards with dynamic base costs produce base candidates through `CardImpl.getBaseCosts()` before the pipeline.
- A card declares only a candidate transform (`deriveCardCostCandidate`) and whether it is mandatory (`cardCostCandidateMandatory`). Appending a candidate keeps the original; a replacement replaces only the candidates it changes. Reductions clamp at 0, and resource keys at 0 are omitted. Ordering and de-duplication follow ADR 0004.
- Candidate metadata holds `sources`, the original `feeIndex` (the base payment path identity, unchanged by later transforms) and optional Cost Attribution. It is not written into the generic `PaymentSolution`; improvement and occupation payment glue merges `sources` into the payment option's `sourceCards` and writes Cost Attribution to Card Resource Stats only after a payment is selected.
- Bonus and `bonusChoiceIndex` semantics stay in the existing solver.
- Preview, admission and committed payment use the same candidate and attribution. A cost substitution changes the amount owed; it never grants inventory goods, and unused coverage does not become food.
- Construct, renovation, fencing, stables and plow costs stay on the action `computeCosts` aggregation path, which declares Cost Attribution explicitly when it needs hover statistics.

## Consequences

- Candidate-deriving, path-dependent and fixed-price cards are expressed with the reference's append / mutate semantics, and the UI shows candidate sources without new components.
- Two cost extension paths coexist: the candidate pipeline and action `computeCosts`. Candidate metadata must stay aligned with the solver's `feeIndex` order.

## Alternatives considered

- A reference-style topological order: forces authors to declare order in several places.
- Patching individual cards: leaves the inability to append candidates in place.
- Extending the pipeline to every action cost: too broad for the parity goal.
- Writing candidate sources into `PaymentSolution`: leaks card-purchase metadata into every payment path.
- Reintroducing `preserveOriginal` or domination exceptions: appending already preserves the original.
- Partial-cover payment trades or inventory-backed providers for occupation fees: changes a broader payment contract to express a substitution candidates already represent.
