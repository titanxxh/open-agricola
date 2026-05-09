import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B139_ForestScientist } from '../../cards-display/B/B139_ForestScientist'

const CARD_ID = B139_ForestScientist.id

export const B139_ForestScientist_impl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (state, _player) => {
    // Check if any action space has wood on it
    const totalWood = state.actionSpaces.reduce(
      (sum, s) => sum + ((s.resources?.wood ?? 0)),
      0,
    )
    if (totalWood > 0) return
    const amount = state.round >= 5 ? 2 : 1
    return gainLeaf(CARD_ID, { food: amount })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
