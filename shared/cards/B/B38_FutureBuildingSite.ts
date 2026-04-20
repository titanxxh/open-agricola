import { MinorImprovement } from '../types'
import type { FarmTilePosition } from '../../game/types'
import { getAllTilePositions, getUsedFarmyardTileKeys, positionKey } from '../../game/farm'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'B38_FutureBuildingSite'

const DELTAS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
]

export const B38_FutureBuildingSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Future Building Site',
  deck: 'B',
  number: 38,
  category: 'POINTS_PROVIDER',
  desc: [
    'Up until all other farmyard spaces are used, you cannot use the unused spaces that are orthogonally adjacent to your house (not even to build rooms).',
  ],
  cost: {},
  vp: 3,
  maxRound: 4,
  prerequisite: 'Play in Round 4 or Before',
  implemented: true,
})

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
