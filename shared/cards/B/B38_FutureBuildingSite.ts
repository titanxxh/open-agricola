import type { FarmTilePosition } from '../../contract/types'
import { getAllTilePositions, getUsedFarmyardTileKeys, positionKey } from '../../domain/farm'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { B38_FutureBuildingSite } from '../../cards-display/B/B38_FutureBuildingSite'

const CARD_ID = B38_FutureBuildingSite.id

registerPrerequisite('Play in Round 4 or Before', (_player, state) => {
  if (!state) return true
  return state.round <= 4
})

const DELTAS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
]

export const B38_FutureBuildingSite_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const usedKeys = getUsedFarmyardTileKeys(player)
    const roomKeys = new Set(player.roomTiles.map(positionKey))
    const lockedTiles: FarmTilePosition[] = []
    for (const tile of getAllTilePositions()) {
      const key = positionKey(tile)
      if (usedKeys.has(key)) continue
      const adjacentToRoom = DELTAS.some((d) =>
        roomKeys.has(positionKey({ row: tile.row + d.dr, col: tile.col + d.dc })),
      )
      if (adjacentToRoom) lockedTiles.push(tile)
    }
    writeCardExtraData(player, CARD_ID, 'locked', lockedTiles)
  },
  computeLockedFarmTiles: (player) => {
    const locked = readCardExtraData<FarmTilePosition[]>(player, CARD_ID, 'locked')
    if (!locked || locked.length === 0) return []
    const usedKeys = getUsedFarmyardTileKeys(player)
    const lockedKeys = new Set(locked.map(positionKey))
    const hasNonLockedFree = getAllTilePositions().some((tile) => {
      const key = positionKey(tile)
      return !usedKeys.has(key) && !lockedKeys.has(key)
    })
    return hasNonLockedFree ? locked : []
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
