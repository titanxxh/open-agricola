import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'C34_ElephantgrassPlant'

registerCardEffect({
  id: CARD_ID,
  onAfterHarvest: (_state, player) => {
    if (player.resources.reed < 1) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay-resources', params: { reed: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    } satisfies ActionFlow
  },
})

export const C34_ElephantgrassPlant = new MinorImprovement({
  id: CARD_ID,
  name: "Elephantgrass Plant",
  deck: "C",
  number: 34,
  category: "POINTS_PROVIDER",
  desc: ["Immediately after each harvest, you can use this card to exchange exactly 1 <REED> for 1 bonus <SCORE>."],
  cost: { clay: 2, stone: 1 },
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
})
