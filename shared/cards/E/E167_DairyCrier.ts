import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E167_DairyCrier } from '../../cards-display/E/E167_DairyCrier'
export { E167_DairyCrier }

const CARD_ID = E167_DairyCrier.id

export const E167_DairyCrier_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const children: ActionFlow[] = [gainLeaf(CARD_ID, { cattle: 1 })]

    // Each player chooses 2 sheep or 2 food
    for (const p of state.players) {
      if (p.id !== player.id) {
        children.push({ type: 'playerSwitch', targetPlayerId: p.id })
      }
      children.push({
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionDairyCrierChoice',
        children: [
          {
            type: 'leaf',
            actionId: 'gain',
            params: { sheep: 2 },
            sourceCard: CARD_ID,
            choiceLabelKey: 'ui.interactionResourceExchange',
            choiceLabelParams: { resourcesPaid: {}, resourcesGained: { sheep: 2 } },
          },
          {
            type: 'leaf',
            actionId: 'gain',
            params: { food: 2 },
            sourceCard: CARD_ID,
            choiceLabelKey: 'ui.interactionResourceExchange',
            choiceLabelParams: { resourcesPaid: {}, resourcesGained: { food: 2 } },
          },
        ],
      })
      if (p.id !== player.id) {
        children.push({ type: 'playerSwitch', targetPlayerId: player.id })
      }
    }

    return { type: 'seq', children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
