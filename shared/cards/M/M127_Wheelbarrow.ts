import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow, Resource } from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { majorImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M127_Wheelbarrow'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const cutPeatFlow: ActionFlow = {
  type: 'xor',
  children: BUILDING_RESOURCES.map((resource) =>
    gainLeaf(CARD_ID, { [resource]: 1 } as Partial<Resource>),
  ),
}

const tookFourMatchingBuildingResources = (context: CardListenerContext) =>
  BUILDING_RESOURCES.some((resource) =>
    sumActionSpaceMovedToTriggerPlayerFromSpace(context, resource) >= 4,
  )

const listener: CardListenerRegistration = {
  id: 'M127-wheelbarrow-after-building-resources',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['cut-peat', 'collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionId === 'cut-peat') return { flow: cutPeatFlow, sourceCard: CARD_ID }
    if (context.actionId === 'collect' && tookFourMatchingBuildingResources(context)) {
      return { flow: gainLeaf(CARD_ID, { fuel: 1 }), sourceCard: CARD_ID }
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => majorImprovementCount(player) >= 1,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M127_Wheelbarrow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wheelbarrow",
    deck: "M",
    number: 127,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take at least 4 of the same building resource from an accumulation space, you also get 1 fuel. Each time you take the \"Cut Peat\" special action, you also get 1 building resource of your choice."
    ],
    cost: {
        "wood": 2
    },
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M127_Wheelbarrow_impl = M127_Wheelbarrow.impl
