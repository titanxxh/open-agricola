import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { hasOrdinaryFenceBuiltEvent } from '../helpers/fence-events'
import type { CardImpl } from '../registry'

const CARD_ID = 'D089_Stablehand'

const listener: CardListenerRegistration = {
  id: 'D89-stablehand-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasOrdinaryFenceBuiltEvent(context)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, exactCost: { max: 1 }, trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D089_Stablehand = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stablehand',
    deck: 'D',
    number: 89,
    category: 'FARM_PLANNER',
    desc: ['Each time you build at least 1 <FENCE>, you can also build a <STABLE> without paying <WOOD> for the <STABLE>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D089_Stablehand_impl = D089_Stablehand.impl
