# 7. Farmers of the Moor uses explicit variant runtime paths

- Status: Accepted
- Date: 2026-06-23

## Context

Farmers of the Moor adds special actions, heating, horses, farm terrain and its own major supply. Folding these into base flows with small conditionals would blur action-space, feeding and supply semantics.

## Decision

- Farmers of the Moor is a Game Variant with explicit runtime paths. Player state that takes part in existing rules (`farmTerrain`, `sickWorkerIds`, `fuel`, `horse`) lives on `PlayerState`, not under a nested variant object.
- Special actions use the dedicated `takeSpecialAction` command. They are work-phase turn actions, neither action spaces nor anytime actions: they need an unplaced healthy worker, do not consume or place it, and trigger no place-farmer or action-space hooks.
- Heating is a dedicated `heating` interaction after each player's feeding; it owns fuel payment and voluntary underpayment without extending the frozen `feed` request. Feeding and heating share the Exchange Center and batch executor; wood-to-fuel conversion is a variant-gated recipe in the ordinary anytime exchange catalog, never a separate action.
- Horses join the shared animal and resource types but are gated by `enableFarmersOfTheMoor`; when the variant is disabled a horse stays at zero, is hidden and takes no part in reorganization, breeding, exchanges or scoring. When it is enabled, generic animal semantics include horses, while cards naming sheep, boar and cattle keep that wording.
- Major supply selection uses the variant registry and stack-aware helpers (ADR 0006).
- Reserved rule terms keep one meaning for every Moor card:
  - Visible Forests / Visible Moors are the public top-layer `farmTerrain` entries; at most one Covered Farm Terrain sits under each, is serialized for every viewer, and revealing it is not a cleared-space event.
  - Blocked Farmyard Spaces, Farmyard Space and Field Goods Tokens, and Non-field Crop Spaces live in `player.farmyardSpaceStates` and are enforced through shared farmyard validation, never frontend filtering. A goods token makes its space used only with `blocksPlacement`; a Non-field Crop Space stays non-Field and unused for scoring and capacity but blocks placement while it holds a crop.
  - Farmyard Extensions live in `player.farmyardExtensions` and extend the shared geometry that every farm reader uses.
  - Moving Up a Major Improvement and Upgrade use the stack-aware supply helpers and identity metadata, never raw pushes into `availableMajorImprovements`.
  - Usage counters live in the owning card's `cardStates`.

## Consequences

- Feeding and action-space semantics stay unchanged for the base game.
- New Moor cards reuse the reserved terms instead of inventing local meanings.

## Alternatives considered

- Special actions as pseudo action spaces, heating fields on `feed`, ad hoc horse resources and appended Moor majors: smaller at first, but blurs rule boundaries and recreates the supply ordering problems.
