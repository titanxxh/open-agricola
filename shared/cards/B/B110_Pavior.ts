import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B110_Pavior } from '../../cards-display/B/B110_Pavior'
export { B110_Pavior }

const CARD_ID = B110_Pavior.id

export const B110_Pavior_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (player.resources.stone < 1) return
    const resource = state.round === 14 ? 'vegetable' : 'food'
    return gainLeaf(CARD_ID, { [resource]: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
