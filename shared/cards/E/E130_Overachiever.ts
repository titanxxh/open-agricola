import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'E130_Overachiever'

const listener: CardListenerRegistration = {
  id: 'E130-overachiever-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'improvement-any', optional: true, promptKey: 'ui.interactionOverachieverImprovement' },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'improvement-any' },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E130_Overachiever = new MinorImprovement({
  id: CARD_ID,
  name: "Overachiever",
  deck: "E",
  number: 130,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time you use a Wish for Children action space, you can also take a Major or Minor Improvement action (with a 1 resource discount)."],
  cost: {},
})
