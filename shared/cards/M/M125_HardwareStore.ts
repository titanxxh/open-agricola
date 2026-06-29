import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { initUsageCounters, setUsageCounterLeaf, usageCounters } from './moor-batch1-helpers'

const CARD_ID = 'M125_HardwareStore'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const listener: CardListenerRegistration = {
  id: 'M125-hardware-store-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const usage = usageCounters(context.player, CARD_ID)
    if (usage <= 0) return
    const gain: Partial<Resource> = {}
    for (const resource of BUILDING_RESOURCES) {
      if ((context.player.resources[resource] ?? 0) === 0) gain[resource] = 1
    }
    if (Object.keys(gain).length === 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          setUsageCounterLeaf(CARD_ID, usage - 1),
          gainLeaf(CARD_ID, gain),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      initUsageCounters(player, CARD_ID, 3)
    },
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M125_HardwareStore = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hardware Store",
    deck: "M",
    number: 125,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Place 3 usage counters on this card. At any time, you can return 1 usage counter from this card to take 1 of each building resource that you have none of in your supply."
    ],
    cost: {
        "clay": 2,
        "reed": 1
    },
    prerequisite: "2 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M125_HardwareStore_impl = M125_HardwareStore.impl
