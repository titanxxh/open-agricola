# Farmers of the Moor uses explicit variant runtime paths

- Status: Accepted
- Date: 2026-06-23

Farmers of the Moor will be implemented as a game variant with explicit runtime paths instead of being folded into existing base-game flows. The variant owns its special action command, heating interaction, horse support, farm terrain state, and major improvement supply selection. Player-side Farmers of the Moor state that naturally participates in existing rules, such as `farmTerrain`, `sickWorkerIds`, `fuel`, and `horse`, lives on `PlayerState` rather than under a nested `player.farmersOfTheMoor` object.

Special actions use a dedicated `takeSpecialAction` command. They are work-phase turn actions, not action spaces and not anytime actions: they require an unplaced healthy worker, do not consume that worker, do not place a worker on an action space, and do not trigger place-farmer or action-space placement hooks.

Heating uses a dedicated `heating` interaction after each player's food feeding is resolved. It does not extend the existing locked `feed` request, because the current feed request freezes food requirements and food used. The heating request owns fuel payment, voluntary underpayment, and wood-to-fuel conversion for that heating step.

Horses are added to the shared animal/resource type system, but are gated by `enableFarmersOfTheMoor`. When the variant is disabled, horse stays at zero, is hidden from UI, and does not participate in animal reorganization, breeding, exchanges, or scoring. When the variant is enabled, generic animal semantics include horse, while cards that explicitly name sheep, wild boar, and cattle keep that narrower wording.

Major improvement supply selection uses a variant registry. The base game, 5/6-player duplicate supply, and Farmers of the Moor supply are separate templates selected by the enabled variant combination. Purchase and return-to-supply logic must operate through the stack-aware supply helper rather than scattering `enableFarmersOfTheMoor` branches through improvement flows.

Farmers of the Moor minor improvements are not implemented in the current slice. Their recurring rule terms still have reserved runtime contracts so future minor cards do not invent incompatible local meanings:

- Visible Forests / Visible Moors are the public `player.farmTerrain` entries whose `kind` is `forest` / `moor`; serialization must preserve them for every viewer.
- Blocked Farmyard Space means a farmyard position that future minor effects make unavailable to room, field, stable, or fence placement through shared farmyard validation inputs, not through frontend-only filtering.
- Farmyard Extensions must extend the shared farmyard geometry and validation helpers before any card can place or use outside-board spaces.
- Moving Up Major Improvement and Upgrade use the stack-aware major supply return/purchase helpers and card identity metadata; they must not push raw ids into `availableMajorImprovements`.
- Usage Counters live under the owning card's `player.cardStates[cardId]` counters or extraData and are consumed by card-local listeners or existing shared helpers.

The rejected alternative was to attach Farmers of the Moor behavior to existing base flows with small conditionals: special actions as pseudo action spaces, heating fields on `feed`, horses as ad hoc resources, and Farmers of the Moor major cards appended to the existing supply. That would look smaller initially, but it would blur rule boundaries, make feed and action-space semantics harder to reason about, and recreate the ordering problems that the stack-aware major supply was introduced to avoid.
