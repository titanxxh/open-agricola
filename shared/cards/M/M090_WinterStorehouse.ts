import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { initUsageCounters, setUsageCounterLeaf, usageCounters } from './moor-batch1-helpers'

const CARD_ID = 'M090_WinterStorehouse'

const listener: CardListenerRegistration = {
  id: 'M090-winter-storehouse-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const usage = usageCounters(context.player, CARD_ID)
    if (usage <= 0) return
    const fuel = Math.max(0, 2 - (context.player.resources.fuel ?? 0))
    const food = Math.max(0, 2 - (context.player.resources.food ?? 0))
    if (fuel <= 0 && food <= 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          setUsageCounterLeaf(CARD_ID, usage - 1),
          gainLeaf(CARD_ID, { fuel, food }),
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

export const M090_WinterStorehouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Winter Storehouse",
    deck: "M",
    number: 90,
    category: "GOODS_PROVIDER",
    desc: [
        "Place 3 usage counters on this card. At any time, you can return 1 usage counter from this card to get as much <FUEL> and <FOOD> until you have at least 2 <FUEL> and 2 <FOOD>."
    ],
    cost: {
        "wood": 1,
        "clay": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M090_WinterStorehouse_impl = M090_WinterStorehouse.impl
