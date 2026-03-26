import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E57_CheeseFondue'

const listener: CardListenerRegistration = {
  id: 'E57-cheese-fondue-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    let bonus = 0
    if (context.player.resources.sheep > 0) bonus += 1
    if (context.player.resources.cattle > 0) bonus += 1
    if (bonus <= 0) return
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { food: bonus }, sourceCard: CARD_ID },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { food: bonus }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E57_CheeseFondue = new MinorImprovement({
  id: CARD_ID,
  name: "Cheese Fondue",
  deck: "E",
  number: 57,
  category: "FOOD_PROVIDER",
  desc: ["Each time you bake at least 1 grain, if you have sheep you get 1 extra <FOOD>, if you have cattle you get 1 extra <FOOD>."],
  cost: { clay: 1 },
  vp: 1,
})
