import type { PlayerState } from '../../game/types'
import { getAllTilePositions, positionKey } from '../../game/farm'

/**
 * Try to add one room tile at any free farmyard position.
 * Increments player.rooms and pushes to player.roomTiles on success.
 * Used by future-meeples roomType resolution (B14 Hawktower at round 12).
 */
export const tryAddRoomTile = (
  player: PlayerState,
  _type: 'wood' | 'clay' | 'stone',
): boolean => {
  const used = new Set<string>()
  for (const tile of player.roomTiles ?? []) used.add(positionKey(tile))
  for (const tile of player.stableTiles ?? []) used.add(positionKey(tile))
  for (const field of player.fields ?? []) used.add(positionKey(field))
  for (const pasture of player.pastures ?? []) {
    for (const tile of pasture.tiles ?? []) used.add(positionKey(tile))
  }
  for (const pos of getAllTilePositions()) {
    if (used.has(positionKey(pos))) continue
    player.roomTiles = [...(player.roomTiles ?? []), pos]
    player.rooms = (player.rooms ?? 0) + 1
    return true
  }
  return false
}
