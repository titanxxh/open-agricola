import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D4_CrossCutWood'

export const D4_CrossCutWood = new MinorImprovement({
  id: CARD_ID,
  name: 'Cross-Cut Wood',
  deck: 'D',
  number: 4,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get a number of <WOOD> equal to the number of <STONE> in your supply.'],
  cost: { food: 1 },
  passing: true,
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})

export const D4_CrossCutWood_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const stone = player.resources.stone ?? 0
    if (stone === 0) return
    return gainLeaf(CARD_ID, { wood: stone })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
