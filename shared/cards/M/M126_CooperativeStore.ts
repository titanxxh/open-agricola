import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { initUsageCounters, setUsageCounterLeaf, usageCounters } from './moor-batch1-helpers'

const CARD_ID = 'M126_CooperativeStore'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const
const TARGET_RESOURCES = ['wood', 'clay', 'reed'] as const

const anytimeListener: CardListenerRegistration = {
  id: 'M126-cooperative-store-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const usage = usageCounters(context.player, CARD_ID)
    if (usage <= 0) return
    const children: ActionFlow[] = BUILDING_RESOURCES
      .filter((from) => context.player.resources[from] >= 1)
      .flatMap((from) => TARGET_RESOURCES.filter((to) => to !== from).map((to) => ({
        type: 'seq',
        children: [
          payLeaf({
            cardId: CARD_ID,
            cost: { [from]: 1 },
          }),
          setUsageCounterLeaf(CARD_ID, usage - 1),
          gainLeaf(CARD_ID, { [to]: 1 }),
        ],
      })))
    if (children.length === 0) return
    return {
      flow: children.length === 1 ? children[0]! : { type: 'xor', children },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      initUsageCounters(player, CARD_ID, 4)
    },
  },
  listeners: [anytimeListener],
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
        "Place 4 usage counters on this card. At any time, you can return 1 usage counter from this card plus 1 building resource of your choice to get 1 of any other building resource except <STONE>."
    ],
    cost: {
        "wood": 2,
        "clay": 1
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  presentation: { counters: ['usage'] },
  impl: cardImpl,
})

export const M126_CooperativeStore_impl = M126_CooperativeStore.impl
