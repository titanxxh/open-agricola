import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D76_SocialBenefits'

export const D76_SocialBenefits = new MinorImprovement({
  id: CARD_ID,
  name: "Social Benefits",
  deck: "D",
  number: 76,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately after the feeding phase of each harvest, if you have no <FOOD> left, you get 1 <WOOD> and 1 <CLAY>."],
  cost: { reed: 1 },
  prerequisite: "At Most 1 Occupation",
  occupationPrerequisites: { max: 1 },
})

export const D76_SocialBenefits_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFeedingPhase: (_state, player) => {
    if (player.resources.food !== 0) return

    return gainLeaf(CARD_ID, { wood: 1, clay: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
