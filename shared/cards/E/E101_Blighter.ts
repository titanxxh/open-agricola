import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'E101_Blighter'

const listener: CardListenerRegistration = {
  id: 'E101-blighter-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      logKey: 'log.cardEffectBlock',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E101_Blighter = new Occupation({
  id: CARD_ID,
  name: "Blighter",
  deck: "E",
  number: 101,
  category: "POINTS_PROVIDER",
  desc: ["When you play this card, you get a number of bonus points equal to the number of full stages still left to play. You may no longer play occupations."],
  cost: {},
  players: "1+",
})
