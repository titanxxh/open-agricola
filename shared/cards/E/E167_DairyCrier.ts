import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E167_DairyCrier } from '../../cards-display/E/E167_DairyCrier'

const CARD_ID = E167_DairyCrier.id

export const E167_DairyCrier_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const children: ActionFlow[] = [gainLeaf(CARD_ID, { cattle: 1 })]

    // Each player chooses 2 sheep or 2 food
    for (const p of state.players) {
      children.push({
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionDairyCrierChoice',
        targetPlayerId: p.id,
        children: [
          {
            type: 'leaf',
            actionId: 'gain',
            params: { sheep: 2 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'gain',
            params: { food: 2 },
            sourceCard: CARD_ID,
          },
        ],
      })
    }

    return { type: 'seq', children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
