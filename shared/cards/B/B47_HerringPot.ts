import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B47_HerringPot'

const listener: CardListenerRegistration = {
  id: 'B47-herring-pot-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 3,
      resources: { food: 1 },
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

export const B47_HerringPot = new MinorImprovement({
  id: CARD_ID,
  name: 'Herring Pot',
  deck: 'B',
  number: 47,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Fishing__ accumulation space, place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { clay: 1 },
})

export const B47_HerringPot_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
