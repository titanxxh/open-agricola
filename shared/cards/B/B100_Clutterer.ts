import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'B100_Clutterer'

const listener: CardListenerRegistration = {
  id: 'B100-clutterer-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B100_Clutterer = new Occupation({
  id: CARD_ID,
  name: "Clutterer",
  deck: "B",
  number: 100,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each card played after this one that has \"accumulation space(s)\" in its text."],
  cost: {},
  players: "1+",
})
