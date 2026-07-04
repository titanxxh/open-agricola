import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C090_FieldWatchman'
const listener: CardListenerRegistration = {
  id: 'C90-field-watchman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
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

export const C090_FieldWatchman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Field Watchman',
    deck: 'C',
    number: 90,
    category: 'FARM_PLANNER',
    desc: ['Each time you use the __Grain Seeds__ action space, you can also plow 1 <FIELD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C090_FieldWatchman_impl = C090_FieldWatchman.impl
