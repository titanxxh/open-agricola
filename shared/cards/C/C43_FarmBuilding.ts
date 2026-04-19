import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C43_FarmBuilding'

// C43 Farm Building: Each time you build a major improvement, place 1 FOOD on each of the
// next 3 round spaces. At the start of these rounds, you get the FOOD.
const listener: CardListenerRegistration = {
  id: 'C43-farm-building-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    if (!choice.startsWith('major:')) return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 3,
      resources: { food: 1 },
    })
    return {
      flow: futureMeeplesNode(),
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C43_FarmBuilding = new MinorImprovement({
  id: CARD_ID,
  name: 'Farm Building',
  deck: 'C',
  number: 43,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you build a major improvement, place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: { clay: 1, reed: 1 },
  vp: 1,
  newSet: true,
})
