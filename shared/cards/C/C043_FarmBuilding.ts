import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C043_FarmBuilding'
const listener: CardListenerRegistration = {
  id: 'C43-farm-building-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C043_FarmBuilding = defineMinorCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const C043_FarmBuilding_impl = C043_FarmBuilding.impl
