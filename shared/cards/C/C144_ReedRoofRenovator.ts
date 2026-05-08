import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C144_ReedRoofRenovator } from '../../cards-display/C/C144_ReedRoofRenovator'
export { C144_ReedRoofRenovator }

const CARD_ID = C144_ReedRoofRenovator.id

const listener: CardListenerRegistration = {
  id: 'C144-reed-roof-renovator-after-renovate',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['renovate-house'],
  scope: 'opponent',
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
  },
}

export const C144_ReedRoofRenovator_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    if (state.players.length === 3) {
      return { type: 'seq', children: [gainLeaf(CARD_ID, { reed: 1 })] }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
