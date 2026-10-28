import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getFarmyardTilePositions, positionKey } from '../../domain/farmyard-geometry'
import { getUsedFarmyardTileKeys } from '../../domain/farmyard-usage'

const CARD_ID = 'D033_SummerHouse'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (player.houseType !== 'stone') return 0
    const usedTiles = getUsedFarmyardTileKeys(player)
    return getFarmyardTilePositions(player).filter(tile =>
      !usedTiles.has(positionKey(tile)) && player.roomTiles.some(room =>
        Math.abs(tile.row - room.row) + Math.abs(tile.col - room.col) === 1,
      ),
    ).length * 2
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D033_SummerHouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Summer House",
    deck: "D",
    number: 33,
    category: "POINTS_PROVIDER",
    desc: [
        'During scoring, if you live in a stone house, you get 2 bonus <SCORE> for each unused farmyard space orthogonally adjacent to your house. (You still lose the points for these unused spaces.)',
      ],
    cost: { wood: 3, stone: 1 },
    prerequisite: "Still in Wooden House",
    extraVp: true,
  },
  impl: cardImpl,
})

export const D033_SummerHouse_impl = D033_SummerHouse.impl
