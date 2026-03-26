import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A55_JunkRoom'

const listener: CardListenerRegistration = {
  id: 'A55-junk-room-during-improvement',
  cardIds: [CARD_ID],
  phases: ['during' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { food: 1 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A55_JunkRoom = new MinorImprovement({
  id: CARD_ID,
  name: "Junk Room",
  deck: "A",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: ["Each time after you build an improvement, including this one, you get 1 <FOOD>."],
  cost: {"wood":1,"clay":1},
})
