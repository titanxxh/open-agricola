import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B091_AssistantTiller'
const listener: CardListenerRegistration = {
  id: 'B91-assistant-tiller-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'plow',
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

export const B091_AssistantTiller = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Assistant Tiller',
    deck: 'B',
    number: 91,
    category: 'FARM_PLANNER',
    desc: ['Each time you use the __Day Laborer__ action space, you can also plow 1 field.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B091_AssistantTiller_impl = B091_AssistantTiller.impl
