import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D012_MilkingPlace'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, _player) => {
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D012_MilkingPlace = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Milking Place',
    deck: 'D',
    number: 12,
    category: 'FARM_PLANNER',
    desc: ['In the feeding phase of each harvest, you get 1 <FOOD>. You can no longer hold animals in your house (not even via another card).'],
    cost: { grain: 1 },
    vp: 1,
    blocksHouseAnimalZones: true,
  },
  impl: cardImpl,
})

export const D012_MilkingPlace_impl = D012_MilkingPlace.impl
