import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E32_Nave'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const cols = new Set(player.roomTiles.map((t) => t.col))
    return cols.size
  },
})

export const E32_Nave = new MinorImprovement({
  id: CARD_ID,
  name: "Nave",
  deck: "E",
  number: 32,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, you get 1 bonus <SCORE> for each of the 5 columns of your farmyard board containing at least one room.'],
  cost: { clay: 2, reed: 1 },
  vp: 0,
})
