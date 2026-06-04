import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A148_Woolgrower'

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
        animalType: 'sheep',
        capacity: cap,
        animalCount: 0,
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A148_Woolgrower = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Woolgrower',
    deck: 'A',
    number: 148,
    category: 'FARM_PLANNER',
    desc: ['This card can hold a number of <SHEEP> equal to the number of completed feeding phases.'],
    cost: {},
    animalHolder: true,
    players: '4+',
  },
  impl: cardImpl,
})

export const A148_Woolgrower_impl = A148_Woolgrower.impl
