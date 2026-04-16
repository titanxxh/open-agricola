import type { FarmTilePosition, PlayerState } from '../../game/types'
import { positionKey } from '../../game/farm'

/**
 * Return a stable tile from a player's farm to their supply.
 *
 * Removes the stable tile from `player.stableTiles` and also decrements
 * `pasture.stables` on any pasture that covered the stable tile. Returns
 * true if a stable was found and removed.
 *
 * Core files (`shared/actions/effects/stables.ts`) only ever ADD stable
 * tiles; there is no removal primitive. We keep this narrow-purpose
 * helper here (outside of core paths) so cards like D102 (Sample Stable
 * Maker) and E76 (Lumber Pile) can express stable returns without
 * modifying core.
 */
export const removeStableAtTile = (
  player: PlayerState,
  tile: FarmTilePosition,
): boolean => {
  const targetKey = positionKey(tile)
  const index = player.stableTiles.findIndex(
    (existing) => positionKey(existing) === targetKey,
  )
  if (index === -1) return false
  player.stableTiles.splice(index, 1)

  for (const pasture of player.pastures ?? []) {
    if ((pasture.stables ?? 0) <= 0) continue
    if (pasture.tiles?.some((t) => positionKey(t) === targetKey)) {
      pasture.stables = Math.max(0, pasture.stables - 1)
      break
    }
  }

  return true
}

export const countRemovableStables = (player: PlayerState): number =>
  player.stableTiles.length
