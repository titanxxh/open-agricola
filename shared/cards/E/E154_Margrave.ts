import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E154_Margrave } from '../../cards-display/E/E154_Margrave'

const CARD_ID = E154_Margrave.id

const renovateListener: CardListenerRegistration = {
  id: 'E154-margrave-opponent-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'stone') return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

export const E154_Margrave_impl = {
  listeners: [renovateListener],
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (player.houseType !== 'stone') return 0
    return state.players.filter((p) => p.id !== player.id && p.houseType !== 'stone').length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
