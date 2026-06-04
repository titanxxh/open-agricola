import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D4_CrossCutWood'

const cardImpl = {
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

export const D4_CrossCutWood = defineMinorCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const D4_CrossCutWood_impl = D4_CrossCutWood.impl
