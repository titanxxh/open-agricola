import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { sumResourceMovedFromActionSpace } from '../helpers/event-provenance'

const CARD_ID = 'A095_Angler'

const listener: CardListenerRegistration = {
  id: 'A95-angler-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const foodGained = sumResourceMovedFromActionSpace(
      context.actionEvents ?? context.transactionEvents,
      'food',
      (event) =>
        event.from.kind === 'actionSpace' &&
        event.from.spaceId === 'fishing' &&
        event.to.kind === 'player' &&
        event.to.playerId === context.player.id,
    )
    if (foodGained > 2) return
    if (foodGained <= 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A095_Angler = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Angler',
    deck: 'A',
    number: 95,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time after you use the __Fishing__ Accumulation space while there are at most 2 <FOOD> on that space, you get a __Major or Minor Improvement__ action.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A095_Angler_impl = A095_Angler.impl
