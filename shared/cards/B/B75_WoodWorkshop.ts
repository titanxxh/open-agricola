import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'B75_WoodWorkshop'

const beforeListener: CardListenerRegistration = {
  id: 'B75-wood-workshop-before-improvement',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { wood: 1 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B75-wood-workshop-isdoable-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    return { doable: true }
  },
}

registerCardListener(beforeListener)
registerCardListener(isDoableListener)

export const B75_WoodWorkshop = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Workshop",
  deck: "B",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you play or build an improvement, you get 1 <WOOD>."],
  cost: {"clay":1},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min":1},
})
