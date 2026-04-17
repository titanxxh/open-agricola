import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B39_Loom'

const sheepFoodIncome = (sheep: number): number => {
  if (sheep >= 7) return 3
  if (sheep >= 4) return 2
  if (sheep >= 1) return 1
  return 0
}

registerCardEffect({
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const gain = sheepFoodIncome(player.resources.sheep ?? 0)
    if (gain <= 0) return
    return gainLeaf(CARD_ID, { food: gain })
  },
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
  vp: 1,
})
