import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D48_CivicFacade'

export const D48_CivicFacade = new MinorImprovement({
  id: CARD_ID,
  name: 'Civic Facade',
  deck: 'D',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: ['Before the start of each round, if you have more occupations than improvements in your hand, you get 1 <FOOD>.'],
  cost: { clay: 1 },
  prerequisite: '3 Rooms',
  newSet: true,
})

export const D48_CivicFacade_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    const occs = player.occupationHand.length
    const improvements = player.minorHand.length
    if (occs <= improvements) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
