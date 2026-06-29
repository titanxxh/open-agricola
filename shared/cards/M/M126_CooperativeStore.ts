import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../contract/types'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { initUsageCounters, setUsageCounterLeaf, usageCounters } from './moor-batch1-helpers'

const CARD_ID = 'M126_CooperativeStore'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const
const TARGET_RESOURCES = ['wood', 'clay', 'reed'] as const

const buildListener = (
  from: typeof BUILDING_RESOURCES[number],
  to: typeof TARGET_RESOURCES[number],
): CardListenerRegistration => ({
  id: `M126-cooperative-store-${from}-to-${to}`,
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const usage = usageCounters(context.player, CARD_ID)
    if (usage <= 0) return
    if ((context.player.resources[from] ?? 0) < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { [from]: 1 } }),
          setUsageCounterLeaf(CARD_ID, usage - 1),
          gainLeaf(CARD_ID, { [to]: 1 } as Partial<Resource>),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
})

const listeners = BUILDING_RESOURCES.flatMap((from) =>
  TARGET_RESOURCES
    .filter((to) => to !== from)
    .map((to) => buildListener(from, to)),
)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      initUsageCounters(player, CARD_ID, 4)
    },
  },
  listeners,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M126_CooperativeStore = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Cooperative Store",
    deck: "M",
    number: 126,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Place 4 usage counters on this card. At any time, you can return 1 usage counter from this card plus 1 building resource of your choice to get 1 of any other building resource except stone."
    ],
    cost: {
        "wood": 2,
        "clay": 1
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M126_CooperativeStore_impl = M126_CooperativeStore.impl
