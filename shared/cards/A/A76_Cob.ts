import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A76_Cob } from '../../cards-display/A/A76_Cob'

const CARD_ID = A76_Cob.id

export const A76_Cob_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if ((player.resources.clay ?? 0) < 1) return
    if ((player.resources.grain ?? 0) < 1) return
    return payGainFlow({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { clay: 2, food: 1 },
      promptKey: 'ui.interactionCob',
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
