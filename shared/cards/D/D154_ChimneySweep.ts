import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { D154_ChimneySweep } from '../../cards-display/D/D154_ChimneySweep'

const CARD_ID = D154_ChimneySweep.id

const renovateCostListener: CardListenerRegistration = {
  id: 'D154-chimney-sweep-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { stone: -2 } }
  },
}

export const D154_ChimneySweep_impl = {
  listeners: [renovateCostListener],
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    return state.players.filter((p) => p.id !== player.id && p.houseType === 'stone').length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
