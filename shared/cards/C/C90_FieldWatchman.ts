import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C90_FieldWatchman'

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

export const C90_FieldWatchman = new Occupation({
  id: CARD_ID,
  name: 'Field Watchman',
  deck: 'C',
  number: 90,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Grain Seeds__ action space, you can also plow 1 field.'],
  cost: {},
  players: '1+',
})

export const C90_FieldWatchman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
