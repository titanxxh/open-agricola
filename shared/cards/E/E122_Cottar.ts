import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E122_Cottar'

// E122 Cottar: Each time you play or build an improvement, you get your choice of
// 1 WOOD or 1 CLAY immediately after paying its cost.
const listener: CardListenerRegistration = {
  id: 'E122-cottar-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { wood: 1 }),
          gainLeaf(CARD_ID, { clay: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E122_Cottar = new Occupation({
  id: CARD_ID,
  name: 'Cottar',
  deck: 'E',
  number: 122,
  category: 'BUILDING_RESOURCES_-_CLAY',
  desc: [
    'Each time you play or build an improvement, you get your choice of 1 <WOOD> or 1 <CLAY> immediately after paying its cost.',
  ],
  cost: {},
  players: '1+',
})

export const E122_Cottar_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
