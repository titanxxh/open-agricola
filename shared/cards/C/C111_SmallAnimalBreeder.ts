import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C111_SmallAnimalBreeder'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    // upcoming round = state.round + 1 (round hasn't been incremented yet at this hook)
    const upcomingRound = state.round + 1
    if ((player.resources.food ?? 0) >= upcomingRound) {
      return gainLeaf(CARD_ID, { food: 1 })
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C111_SmallAnimalBreeder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Small Animal Breeder',
    deck: 'C',
    number: 111,
    category: 'FOOD_PROVIDER',
    desc: ['Before the start of each round, if you have <FOOD> equal to or higher than the upcoming round number (e.g., 8+ <FOOD> before round 8), you get 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C111_SmallAnimalBreeder_impl = C111_SmallAnimalBreeder.impl
