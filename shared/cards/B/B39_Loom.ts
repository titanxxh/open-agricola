import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B39_Loom'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return Math.floor(player.resources.sheep / 3)
  },
})

export const B39_Loom = new MinorImprovement({
  id: CARD_ID,
  name: "Loom",
  deck: "B",
  number: 39,
  category: "POINTS_PROVIDER",
  desc: ['In the field phase of each harvest, if you have at least 1/4/7 <SHEEP>, you get 1/2/3 <FOOD>. During scoring, you get 1 bonus <SCORE> for every 3 <SHEEP>.'],
  cost: { wood: 1, reed: 1 },
})
