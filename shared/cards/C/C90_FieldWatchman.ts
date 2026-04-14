import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C90_FieldWatchman'

const listener: CardListenerRegistration = {
  id: 'C90-field-watchman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
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

registerCardListener(listener)

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
