import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E167_DairyCrier'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const children: ActionFlow[] = []

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

    children.push(gainLeaf(CARD_ID, { cattle: 1 }))
    return { type: 'seq', children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E167_DairyCrier = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Dairy Crier',
    deck: 'E',
    number: 167,
    desc: [
        'When you play this card, each player (including you) can choose to get 2 <SHEEP> or 2 <FOOD>; you also get 1 <CATTLE>.',
      ],
    cost: {},
    players: '4+',
    category: 'ANIMALS_-_ALL',
  },
  impl: cardImpl,
})

export const E167_DairyCrier_impl = E167_DairyCrier.impl
