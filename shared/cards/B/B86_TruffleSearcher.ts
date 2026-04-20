import { Occupation } from '../types'
import { initCardState } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'

const CARD_ID = 'B86_TruffleSearcher'

export const B86_TruffleSearcher = new Occupation({
  id: CARD_ID,
  name: 'Truffle Searcher',
  deck: 'B',
  number: 86,
  category: 'FARM_PLANNER',
  desc: ['This card can hold a number of <PIG> equal to the number of completed feeding phases.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const B86_TruffleSearcher_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    const counters = initCardState(player, CARD_ID)
    counters.completedHarvests = (counters.completedHarvests ?? 0) + 1
  },
  onComputeAnimalZones: (player, zones) => {
    const capacity = player.cardStates?.[CARD_ID]?.counters?.completedHarvests ?? 0
    if (capacity <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity,
      animalType: 'boar',
      animalCount: 0,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
