import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C151_SowingDirector'

/**
 * C151 Sowing Director:
 * Each time another player uses the Grain Utilization action space,
 * the card owner gets a free sow action.
 *
 * BGA: isListeningTo → PlaceFarmer on GrainUtilization.
 *      onOpponentAfterPlaceFarmer → optional sow action.
 */
const listener: CardListenerRegistration = {
  id: 'C151-sowing-director-opponent-grain-utilization',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization') return

    return {
      flow: {
        type: 'leaf',
        actionId: 'sow',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'sow' },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C151_SowingDirector = new Occupation({
  id: CARD_ID,
  name: 'Sowing Director',
  deck: 'C',
  number: 151,
  category: 'ACTION_SPACE_EXTENDER',
  desc: [
    'Each time another player uses the __Grain Utilization__ action space, you get a free __Sow__ action.',
  ],
  cost: {},
  players: '3+',
})
