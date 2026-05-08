import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C61_BeerStein } from '../../cards-display/C/C61_BeerStein'

const CARD_ID = C61_BeerStein.id

const listener: CardListenerRegistration = {
  id: 'C61-beer-stein-after-bake-bread',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

export const C61_BeerStein_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
