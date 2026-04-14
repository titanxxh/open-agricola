import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B50_ButterChurn'

registerCardEffect({
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return

    const sheep = player.resources.sheep ?? 0
    const cattle = player.resources.cattle ?? 0
    const gain = Math.floor(sheep / 3) + Math.floor(cattle / 2)
    if (gain <= 0) return

    return gainLeaf(CARD_ID, { food: gain })
  },
})

export const B50_ButterChurn = new MinorImprovement({
  id: CARD_ID,
  name: "Butter Churn",
  deck: "B",
  number: 50,
  category: "FOOD_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <FOOD> for every 3 <SHEEP> and 1 <FOOD> for every 2 <CATTLE> you have."],
  vp: 1,
  cost: { wood: 1 },
  prerequisite: "At Most 3 Occupations",
  occupationPrerequisites: { max: 3 },
})
