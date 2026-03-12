import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A94_LazySowman'

const computeReplaceListener: CardListenerRegistration = {
  id: 'A94-lazy-sowman-replace-sow',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.workersAvailable <= 0) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      decline: true,
      alternativeFlow: { type: 'leaf', actionId: 'place-farmer', optional: true, promptKey: 'ui.interactionLazySowmanPlace' },
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'A94-lazy-sowman-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.workersAvailable <= 0) return
    return { doable: true }
  },
}

registerCardListener(computeReplaceListener)
registerCardListener(isDoableListener)

export const A94_LazySowman = new Occupation({
  id: CARD_ID,
  name: "Lazy Sowman",
  deck: "A",
  number: 94,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time you decline an unconditional __Sow__ action on your turn, you can immediately place another person on an action space of your choice (even if it is occupied)."],
  cost: {},
  players: "1+",
})
