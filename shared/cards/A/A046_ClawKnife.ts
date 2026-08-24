import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'A046_ClawKnife'
const listener: CardListenerRegistration = {
  id: 'A46-claw-knife-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'sheep-market') return
    const request = {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 2,
      resources: { food: 1 },
    }
    return { flow: futureMeeplesNode(request), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  prerequisiteCheck: (player) => player.pastures.length === 1,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A046_ClawKnife = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Claw Knife',
    deck: 'A',
    number: 46,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you use the __Sheep Market__ accumulation space, place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: { wood: 1 },
    vp: 1,
    prerequisite: 'Exactly 1 Pasture',
  },
  impl: cardImpl,
})

export const A046_ClawKnife_impl = A046_ClawKnife.impl
