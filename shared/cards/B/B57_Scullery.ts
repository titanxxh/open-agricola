import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B57_Scullery } from '../../cards-display/B/B57_Scullery'
export { B57_Scullery }

const CARD_ID = B57_Scullery.id

export const B57_Scullery_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'wood') return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
