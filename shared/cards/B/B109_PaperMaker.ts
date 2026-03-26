import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payThenGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'B109_PaperMaker'

const beforeOccupationListener: CardListenerRegistration = {
  id: 'B109-paper-maker-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const occupationCount = context.player.occupationPlayed.length
    if (occupationCount <= 0 || context.player.resources.wood < 1) return
    return {
      ...payThenGainFlow({
        cardId: CARD_ID,
        cost: { wood: 1 },
        gain: { food: occupationCount },
        promptKey: 'ui.interactionPaperMakerPrompt',
      }),
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B109-paper-maker-isdoable-occupation',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.doable) return
    if (context.player.resources.wood < 1) return
    if (context.player.occupationPlayed.length <= 0) return
    return { doable: true }
  },
}

registerCardListener(beforeOccupationListener)
registerCardListener(isDoableListener)

export const B109_PaperMaker = new Occupation({
  id: CARD_ID,
  name: "Paper Maker",
  deck: "B",
  number: 109,
  category: "FOOD_PROVIDER",
  desc: ["Immediately before playing each occupation after this one, you can pay 1 <WOOD> total to get 1 <FOOD> for each occupation you have in front of you."],
  cost: {},
  players: "1+",
})
