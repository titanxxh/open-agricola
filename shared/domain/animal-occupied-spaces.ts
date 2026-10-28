import type { AnimalKey } from '../contract/animals'
import type { GameState, PlayerState } from '../contract/types'
import { computeAnimalZones, readAnimalCountsForZoneAssignment } from './animal-zones'
import { getFarmyardTileKeySet, positionKey } from './farmyard-geometry'

/** Pastures retain aggregate occupancy; coordinate holders count their real farm space once. */
export const countAnimalOccupiedFarmyardSpaces = (player: PlayerState, state: GameState, animal: AnimalKey): number => {
  const pastureTiles = new Set(player.pastures.flatMap(pasture => pasture.tiles.map(positionKey)))
  const pastureCount = player.pastures.reduce((sum, pasture) => sum + (
    pasture.animalType === animal ? Math.min(pasture.tiles.length, pasture.animalCount) : 0
  ), 0)
  const farmTiles = getFarmyardTileKeySet(player)
  const stablePositions = new Map(player.stableTiles.map(tile => [`stable:${positionKey(tile)}`, tile]))
  const occupied = new Set<string>()
  for (const zone of computeAnimalZones(player, state)) {
    if (zone.zoneType === 'pasture' || (readAnimalCountsForZoneAssignment(zone)[animal] ?? 0) <= 0) continue
    if (zone.ownerPlayerId && zone.ownerPlayerId !== player.id) continue
    const position = zone.farmPosition ?? (zone.zoneType === 'stable' ? stablePositions.get(zone.id) : undefined)
    if (!position) continue
    const key = positionKey(position)
    if (farmTiles.has(key) && !pastureTiles.has(key)) occupied.add(key)
  }
  return pastureCount + occupied.size
}
