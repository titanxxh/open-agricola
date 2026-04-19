import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C45_Stew'

const listener: CardListenerRegistration = {
  id: 'C45-stew-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 4,
      resources: { food: 1 },
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const C45_Stew = new MinorImprovement({
  id: CARD_ID,
  name: 'Stew',
  deck: 'C',
  number: 45,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, also place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { clay: 1 },
  newSet: true,
})
