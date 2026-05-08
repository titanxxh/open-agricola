import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B166_CattleFeeder } from '../../cards-display/B/B166_CattleFeeder'

const CARD_ID = B166_CattleFeeder.id

const listener: CardListenerRegistration = {
  id: 'B166-cattle-feeder-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    return payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { cattle: 1 } })
  },
}

export const B166_CattleFeeder_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
