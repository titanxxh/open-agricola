import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D48_CivicFacade'

// D48 Civic Facade: Before the start of each round, if you have more occupations than
// improvements in your hand, you get 1 food.
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const occs = player.occupationHand.length
    const improvements = player.minorHand.length
    if (occs <= improvements) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
})

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
