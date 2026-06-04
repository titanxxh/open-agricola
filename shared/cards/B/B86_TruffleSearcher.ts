import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'B86_TruffleSearcher'

const cardImpl = {
  listeners: [],
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (_player, zones, state) => {
      const cap = state.completedFeedingPhases
      if (cap <= 0) return
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        animalType: 'boar',
        capacity: cap,
        animalCount: 0,
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B86_TruffleSearcher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Truffle Searcher',
    deck: 'B',
    number: 86,
    category: 'FARM_PLANNER',
    desc: ['This card can hold a number of <PIG> equal to the number of completed feeding phases.'],
    cost: {},
    animalHolder: true,
    players: '1+',
  },
  impl: cardImpl,
})

export const B86_TruffleSearcher_impl = B86_TruffleSearcher.impl
