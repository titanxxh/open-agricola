import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'A46_ClawKnife'

// A46 Claw Knife: Each time you use the Sheep Market accumulation space, place 1 FOOD on each
// of the next 2 round spaces. At the start of these rounds, you get the FOOD.
const listener: CardListenerRegistration = {
  id: 'A46-claw-knife-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'sheep-market') return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 2,
      resources: { food: 1 },
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

export const A46_ClawKnife = new MinorImprovement({
  id: CARD_ID,
  name: 'Claw Knife',
  deck: 'A',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Sheep Market__ accumulation space, place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: 'Exactly 1 Pasture',
  newSet: true,
})

export const A46_ClawKnife_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
