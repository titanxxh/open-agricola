import type { PlayerState } from '../contract/types'
import { getFarmyardTileCount, getFarmyardTilePositions, positionKey } from './farmyard-geometry'
import { getBlockedFarmyardSpaceKeys, getPlacementBlockedFarmyardSpaceKeys } from './farmyard-space-states'
import { computeFencedRegions } from './farmyard-regions'

export const getPastureTileKeys = (player: PlayerState) => {
  const keys = new Set<string>()
  player.pastures.forEach((pasture) => {
    pasture.tiles?.forEach((tile) => keys.add(positionKey(tile)))
  })
  const needsDerivedPastureTiles = player.pastures.some(
    (pasture) => !pasture.tiles || pasture.tiles.length === 0,
  )
  if (needsDerivedPastureTiles && player.fenceSegments.length > 0) {
    const edgeSet = new Set(player.fenceSegments.map((s) => s.edge))
    computeFencedRegions(edgeSet, player)
      .filter((region) => region.fenced)
      .forEach((region) => {
        region.tiles.forEach((tile) => keys.add(positionKey(tile)))
      })
  }
  return keys
}

export const getUsedFarmyardTileKeys = (player: PlayerState) => {
  const used = new Set<string>()
  player.roomTiles.forEach((tile) => used.add(positionKey(tile)))
  player.farmTerrain?.forEach((tile) => used.add(positionKey(tile)))
  player.fields.forEach((field) =>
    used.add(positionKey({ row: field.row, col: field.col })),
  )
  player.stableTiles.forEach((tile) => used.add(positionKey(tile)))
  getPastureTileKeys(player).forEach((key) => used.add(key))
  getBlockedFarmyardSpaceKeys(player).forEach((key) => used.add(key))
  return used
}

export const countUnusedFarmyardSpaces = (player: PlayerState) =>
  getFarmyardTileCount(player) - getUsedFarmyardTileKeys(player).size

export const getUnusedFarmyardTilePositions = (player: PlayerState) => {
  const used = getUsedFarmyardTileKeys(player)
  const blocked = getPlacementBlockedFarmyardSpaceKeys(player)
  return getFarmyardTilePositions(player).filter(tile => {
    const key = positionKey(tile)
    return !used.has(key) && !blocked.has(key)
  })
}

export const hasNoUnusedFarmyardSpaces = (player: PlayerState) =>
  countUnusedFarmyardSpaces(player) === 0

export const getNewlyUsedFarmyardTiles = (player: PlayerState, previousUsed: ReadonlySet<string>) => {
  const used = getUsedFarmyardTileKeys(player)
  return getFarmyardTilePositions(player)
    .filter(tile => used.has(positionKey(tile)) && !previousUsed.has(positionKey(tile)))
    .map(tile => ({ playerId: player.id, row: tile.row, col: tile.col }))
}
