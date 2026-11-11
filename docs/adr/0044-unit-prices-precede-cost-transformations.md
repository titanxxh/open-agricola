# 44. Complete unit prices are alternatives before cost transformations

- Status: Accepted
- Date: 2026-11-10

Under [#1636](https://github.com/titanxxh/open-agricola/issues/1636), a complete unit price replaces the ordinary base for that unit. Encoding its difference from the ordinary price as another discount incorrectly combines multiple base prices. The payment solver therefore seeds the ordinary price and each applicable `Trade.unitPrice` as independent unit candidates, then runs Candidate Closure only over genuine discounts and resource substitutions. Each unit chooses one base; multiple units can choose different bases. Actual saved and paid attribution belongs only to the selected path. Global use limits and component obligations remain enforced.

The partner-specific policy in the following paragraph is historical on main after [#1661](https://github.com/titanxxh/open-agricola/issues/1661); it remains part of the prerelease reconstruction basis in ADR 0043. Complete unit-price alternatives and ordinary card consumers, including D015 Clay Supports and M036 Peat Moss, remain on main.

For ordinary partner room construction, the cooperation price increase applies to both the ordinary base and each alternative base before discounts, substitutions and resource removal. It is not a protected fee. This amends ADR 0043's earlier interpretation that a card price removed that increase. Source-granted exact or free construction keeps its existing pricing policy. A substitution of all remaining wood is a transformation of the current cost, not another unit-price seed; this preserves bounded alternatives that apply after a real discount.

Pending construction quotes are recomputed from the current rules and saved invocation. Native pending projection may refresh both the request and its prompt without executing the action. Obsolete unpaid choices are rejected and replaced with current legal choices, or return to geometry selection when the selected quantity is no longer affordable. Restoring or handing off an already settled action never reprices it. Predecessor snapshots must execute their next real command successfully under this contract.
