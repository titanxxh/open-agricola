import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'A141_TurnipFarmer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, _player) => {
    const dayLaborer = state.actionSpaces.find((s) => s.id === 'day-laborer')
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!dayLaborer || !grainSeeds) return
    if (!isSpaceOccupied(dayLaborer) || !isSpaceOccupied(grainSeeds)) return
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
