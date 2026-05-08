import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A166_Haydryer } from '../../cards-display/A/A166_Haydryer'
export { A166_Haydryer }

const CARD_ID = A166_Haydryer.id

export const A166_Haydryer_impl = {
  effect: {
  id: CARD_ID,
  onBeforeHarvest: (_state, player) => {
    const pastureCount = player.pastures.length
    const cost = Math.max(0, 4 - pastureCount)
    return payGainFlow({
      cardId: CARD_ID,
      cost: { food: cost },
      gain: { cattle: 1 },
      promptKey: 'ui.interactionHaydryer',
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
