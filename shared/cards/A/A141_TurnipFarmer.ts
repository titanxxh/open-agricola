import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getReturnHomePlacements } from '../helpers/round-placement'
import type { CardImpl } from '../registry'

const CARD_ID = 'A141_TurnipFarmer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, _player) => {
    const returning = getReturnHomePlacements(state)
    if (!returning.some((entry) => entry.spaceId === 'day-laborer') ||
      !returning.some((entry) => entry.spaceId === 'grain-seeds')) return
    return gainLeaf(CARD_ID, { vegetable: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A141_TurnipFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Turnip Farmer',
    deck: 'A',
    number: 141,
    category: 'CROP_PROVIDER',
    desc: ['At the start of the returning home phase of each round, if both the __Day Laborer__ and __Grain Seeds__ action spaces are occupied, you get 1 <VEGETABLE>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A141_TurnipFarmer_impl = A141_TurnipFarmer.impl
