import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C173_TopOuter'

const listener: CardListenerRegistration = {
  id: 'C173-top-outer-after-house-building-56',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'house-building-56') return
    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return
    const traveling = context.state.actionSpaces.find((space) => space.id === 'traveling-players-56')
    const food = traveling?.resources.food ?? 0
    if (food <= 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'collect',
        sourceCard: CARD_ID,
        actionContext: { spaceId: 'traveling-players-56', resource: 'food', amount: food },
        targetPlayerId: ownerId,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C173_TopOuter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Top-Outer',
    deck: 'C',
    number: 173,
    category: 'FOOD_PROVIDER',
    desc: ['Each time the "House Building" action space on the game board extension is used, you get all of the food from the "Traveling Players" accumulation space.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C173_TopOuter_impl = C173_TopOuter.impl
