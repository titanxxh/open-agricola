import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { isMajorCardId } from '../helpers/card-type'

const CARD_ID = 'C043_FarmBuilding'
const listener: CardListenerRegistration = {
  id: 'C43-farm-building-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    const cardId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!isMajorCardId(cardId)) return
    const request = {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 3,
      resources: { food: 1 },
    }
    return {
      flow: futureMeeplesNode(request),
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
