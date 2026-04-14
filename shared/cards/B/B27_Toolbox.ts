import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B27_Toolbox'

/**
 * B27 Toolbox (MinorImprovement, B, 27)
 * After building (rooms/stables), you can optionally take a minor improvement action.
 */
const afterConstructListener: CardListenerRegistration = {
  id: 'B27-toolbox-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'minor-improvement',
        optional: true,
        promptKey: 'ui.interactionToolboxImprovement',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'minor-improvement' },
      sourceCard: CARD_ID,
    }
  },
}

const afterStablesListener: CardListenerRegistration = {
  id: 'B27-toolbox-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['build-stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'minor-improvement',
        optional: true,
        promptKey: 'ui.interactionToolboxImprovement',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'minor-improvement' },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterConstructListener)
registerCardListener(afterStablesListener)

export const B27_Toolbox = new MinorImprovement({
  id: CARD_ID,
  name: 'Toolbox',
  deck: 'B',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you build rooms or stables, you can also take a __Minor Improvement__ action.'],
  cost: { wood: 1 },
})
