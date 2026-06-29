import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { getFarmyardTilePositions, positionKey } from '../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../domain/farmyard-usage'

const CARD_ID = 'M039_SpecialPasture'

const isAdjacent = (tile: FarmTilePosition, other: FarmTilePosition) =>
  Math.abs(tile.row - other.row) + Math.abs(tile.col - other.col) === 1

const nonAdjacentUnusedTiles = (player: PlayerState): FarmTilePosition[] => {
  const used = getUsedFarmyardTileKeys(player)
  const pastureTiles = player.pastures.flatMap((pasture) => pasture.tiles ?? [])
  return getFarmyardTilePositions(player).filter((tile) => {
    if (used.has(positionKey(tile))) return false
    return !pastureTiles.some((pastureTile) => isAdjacent(tile, pastureTile))
  })
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => ({
      type: 'leaf' as const,
      actionId: 'fence',
      sourceCard: CARD_ID,
      actionContext: {
        fencePolicy: {
          connectionPolicy: 'allowDisconnected',
          allowedNewRegionTiles: nonAdjacentUnusedTiles(player),
          newPastureBounds: {
            count: { min: 1, max: 1 },
            totalSize: { min: 1, max: 1 },
          },
          costPolicy: { fence: { wood: 0 } },
        },
      },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M039_SpecialPasture = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Special Pasture",
    deck: "M",
    number: 39,
    category: "FARM_PLANNER",
    desc: [
        "Immediately fence a farmyard space that is not adjacent to an existing pasture, without paying wood for the fences. You can connect your pastures later. All future pastures must be adjacent to at least one existing pasture."
    ],
    cost: {
        "wood": 2
    },
    prerequisite: "1 Pasture",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M039_SpecialPasture_impl = M039_SpecialPasture.impl
