import { defineMinorCard } from '../card-source'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'

const CARD_ID = 'M037_BuildingPlan'

const listener: CardListenerRegistration = {
  id: 'M037-building-plan-after-construct',
  cardIds: [CARD_ID],
  actions: ['construct'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getRoomsBuiltThisAction(context.player) < 2) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 2, exactCost: { wood: 0, max: 2 }, trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M037_BuildingPlan = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Building Plan",
    deck: "M",
    number: 37,
    category: "FARM_PLANNER",
    desc: [
        "Each time after you build at least 2 rooms at once, you can build up to 2 stables without paying wood."
    ],
    cost: {
        "food": 1
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M037_BuildingPlan_impl = M037_BuildingPlan.impl
