import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D111_InteriorDecorator'
const listener: CardListenerRegistration = {
  id: 'D111-interior-decorator-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 6,
      resources: { food: 1 },
    })
    return {
      flow: futureMeeplesNode(),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D111_InteriorDecorator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Interior Decorator',
    deck: 'D',
    number: 111,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time you renovate, place 1 <FOOD> on each of the next 6 round spaces. At the start of these rounds, you get the <FOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D111_InteriorDecorator_impl = D111_InteriorDecorator.impl
