import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B91_AssistantTiller'

const listener: CardListenerRegistration = {
  id: 'B91-assistant-tiller-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
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

registerCardListener(listener)

export const B91_AssistantTiller = new Occupation({
  id: CARD_ID,
  name: 'Assistant Tiller',
  deck: 'B',
  number: 91,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Day Laborer__ action space, you can also plow 1 field.'],
  cost: {},
  players: '1+',
})
