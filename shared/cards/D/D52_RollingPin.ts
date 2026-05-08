import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D52_RollingPin } from '../../cards-display/D/D52_RollingPin'
export { D52_RollingPin }

const CARD_ID = D52_RollingPin.id

export const D52_RollingPin_impl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (_state, player) => {
    const clay = player.resources.clay ?? 0
    const wood = player.resources.wood ?? 0
    if (clay <= wood) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
