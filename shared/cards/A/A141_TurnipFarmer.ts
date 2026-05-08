import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { A141_TurnipFarmer } from '../../cards-display/A/A141_TurnipFarmer'
export { A141_TurnipFarmer }

const CARD_ID = A141_TurnipFarmer.id

export const A141_TurnipFarmer_impl = {
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
