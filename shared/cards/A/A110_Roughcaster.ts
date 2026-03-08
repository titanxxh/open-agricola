import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A110_Roughcaster'

const constructListener: CardListenerRegistration = {
  id: 'A110-roughcaster-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'clay') return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { food: 3 } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { food: 3 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const renovateListener: CardListenerRegistration = {
  id: 'A110-roughcaster-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'stone') return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { food: 3 } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { food: 3 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(constructListener)
registerCardListener(renovateListener)

export const A110_Roughcaster = new Occupation({
  id: CARD_ID,
  name: "Roughcaster",
  deck: "A",
  number: 110,
  category: "FOOD_PROVIDER",
  desc: ["Each time you build at least 1 clay room or renovate your house from clay to stone, you also get 3 <FOOD>."],
  cost: {},
  players: "1+",
})
