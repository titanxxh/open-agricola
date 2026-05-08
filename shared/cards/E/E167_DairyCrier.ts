import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E167_DairyCrier'

export const E167_DairyCrier = new Occupation({
  id: CARD_ID,
  name: 'Dairy Crier',
  deck: 'E',
  number: 167,
  desc: [
    'When you play this card, each player (including you) can choose to get 2 <SHEEP> or 2 <FOOD>; you also get 1 <CATTLE>.',
  ],
  cost: {},
  players: '4+',
})

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
