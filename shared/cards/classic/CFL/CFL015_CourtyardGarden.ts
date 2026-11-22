import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getUnusedFarmyardTilePositions } from '../../../domain/farmyard-usage-core'

const CARD_ID = 'CFL015_CourtyardGarden'

const cardImpl = {
  prerequisiteCheck: (player) => player.houseType === 'wood',
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) =>
      player.houseType !== 'stone'
        ? 0
        : 2 *
          getUnusedFarmyardTilePositions(player).filter((tile) =>
            player.roomTiles.some(
              (room) => Math.abs(tile.row - room.row) + Math.abs(tile.col - room.col) === 1,
            ),
          ).length,
  },
} satisfies CardImpl

export const CFL015_CourtyardGarden = defineMinorCard({
  meta: {
    id: 'CFL015_CourtyardGarden',
    name: 'Courtyard Garden',
    deck: 'CFL',
    number: 15,
    cost: {
      wood: 3,
      stone: 1,
    },
    extraVp: true,
    desc: [
      'During scoring, if you live in a stone house, you get 2 bonus <SCORE> for each unused farmyard space orthogonally adjacent to your house. You still lose points for unused spaces.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL015.png',
    prerequisite: 'Wood house',
  },
  impl: cardImpl,
})
