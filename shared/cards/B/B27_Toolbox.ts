import { MinorImprovement } from '../types'
import type { CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B27_Toolbox'

const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']

const makeToolboxFlow = (): ActionHookResult => ({
  flow: {
    type: 'leaf',
    actionId: 'improvement-any',
    optional: true,
    promptKey: 'ui.interactionToolboxImprovement',
    sourceCard: CARD_ID,
    actionContext: { allowedPurchases: ALLOWED_MAJORS },
  },
  logKey: 'log.cardGrantedAction',
  logParams: { cardId: CARD_ID, actionId: 'improvement-any' },
  sourceCard: CARD_ID,
})

const handler = (context: CardListenerContext): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  return makeToolboxFlow()
}

export const B27_Toolbox = new MinorImprovement({
  id: CARD_ID,
  name: 'Toolbox',
  deck: 'B',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: [
    "In the work phase, after each turn in which you build at least 1 room, stable, or fence, you can build the __Joinery__, __Pottery__, or __Basketmaker's Workshop__ major improvement.",
  ],
  cost: { wood: 1 },
})

export const B27_Toolbox_impl = {
  listeners: [{
  id: 'B27-toolbox-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler,
}, {
  id: 'B27-toolbox-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['build-stables'],
  handler,
}, {
  id: 'B27-toolbox-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fencing'],
  handler,
}],
  reaches: [] as readonly string[],
} satisfies CardImpl
