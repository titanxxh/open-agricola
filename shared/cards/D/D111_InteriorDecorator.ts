import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'D111_InteriorDecorator'

// D111 Interior Decorator: Each time you renovate, place 1 FOOD on each of the next 6 round
// spaces. At the start of these rounds, you get the FOOD.
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

registerCardListener(listener)

export const D111_InteriorDecorator = new Occupation({
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
})
