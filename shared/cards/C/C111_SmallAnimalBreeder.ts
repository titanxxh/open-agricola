import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C111_SmallAnimalBreeder'

// C111 Small Animal Breeder: Before the start of each round, if you have food equal to
// or higher than the upcoming round number (e.g., 8+ food before round 8), you get 1 food.
// BGA: BeforeStartOfTurn, turn counter not yet updated → check food >= turn+1
// In our engine, onBeforeStartOfTurn fires before the round increments, state.round is current.
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    // upcoming round = state.round + 1 (round hasn't been incremented yet at this hook)
    const upcomingRound = state.round + 1
    if ((player.resources.food ?? 0) >= upcomingRound) {
      return gainLeaf(CARD_ID, { food: 1 })
    }
  },
})

export const C111_SmallAnimalBreeder = new Occupation({
  id: CARD_ID,
  name: 'Small Animal Breeder',
  deck: 'C',
  number: 111,
  category: 'FOOD_PROVIDER',
  desc: ['Before the start of each round, if you have <FOOD> equal to or higher than the upcoming round number (e.g., 8+ <FOOD> before round 8), you get 1 <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
