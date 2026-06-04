import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

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
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C151_SowingDirector = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sowing Director',
    deck: 'C',
    number: 151,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Each time after another player uses the __Grain Utilization__ action space, you get a __Sow__ action.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const C151_SowingDirector_impl = C151_SowingDirector.impl
