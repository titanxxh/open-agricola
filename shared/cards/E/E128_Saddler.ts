import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payThenActionFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'E128_Saddler'

const listener: CardListenerRegistration = {
  id: 'E128-saddler-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const choice = context.choice
    if (!choice || !choice.startsWith('major:')) return
    return {
      ...payThenActionFlow({
        cardId: CARD_ID,
        cost: { food: 1 },
        promptKey: 'ui.interactionSaddlerPlow',
        action: { type: 'leaf', actionId: 'plow' },
      }),
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'plow' },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E128_Saddler = new Occupation({
  id: CARD_ID,
  name: "Saddler",
  deck: "E",
  number: 128,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time after you build a major improvement, you can pay 1 <FOOD> to plow 1 field."],
  cost: {},
  players: "3+",
})
