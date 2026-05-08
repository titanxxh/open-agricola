import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D54_TroutPool } from '../../cards-display/D/D54_TroutPool'
export { D54_TroutPool }

const CARD_ID = D54_TroutPool.id

export const D54_TroutPool_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, _player) => {
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    const fishFood = fishingSpace?.resources?.food ?? 0
    if (fishFood < 3) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
