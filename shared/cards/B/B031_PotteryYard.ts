import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { playerHasCardCapability } from '../helpers/card-type'
import { getFarmyardTilePositions, positionKey } from '../../domain/farmyard-geometry'
import { getUsedFarmyardTileKeys } from '../../domain/farmyard-usage'

const CARD_ID = 'B031_PotteryYard'

const cardImpl = {
  prerequisiteCheck: (player) =>
    playerHasCardCapability(player, 'potteryIdentity', { asType: 'major' }),
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const usedTiles = getUsedFarmyardTileKeys(player)
    const unusedTiles = getFarmyardTilePositions(player)
      .filter(tile => !usedTiles.has(positionKey(tile)))
    return unusedTiles.some(tile => unusedTiles.some(other =>
      Math.abs(tile.row - other.row) + Math.abs(tile.col - other.col) === 1,
    )) ? 2 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B031_PotteryYard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Pottery Yard',
    deck: 'B',
    number: 31,
    category: 'POINTS_PROVIDER',
    desc: [
        'During the scoring, if there are at least 2 orthogonally adjacent unused spaces in your farm, you get 2 bonus <SCORE>. (You still get the negative points for those unused spaces.',
      ],
    cost: {},
    vp: 1,
    prerequisite: 'Pottery (or an Upgrade Thereof)',
    extraVp: true,
  },
  impl: cardImpl,
})

export const B031_PotteryYard_impl = B031_PotteryYard.impl
