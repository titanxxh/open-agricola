import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../helpers/event-provenance'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'M110_FarmCart'
const THRESHOLDS: Partial<Record<keyof Resource, number>> = {
  wood: 5,
  clay: 4,
  reed: 3,
  stone: 2,
}

const listener: CardListenerRegistration = {
  id: 'M110-farm-cart-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    for (const [resource, threshold] of Object.entries(THRESHOLDS) as [keyof Resource, number][]) {
      if (sumActionSpaceMovedToTriggerPlayerFromSpace(context, resource) >= threshold) {
        return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
      }
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => (player.resources.horse ?? 0) >= 2,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M110_FarmCart = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farm Cart",
    deck: "M",
    number: 110,
    category: "CROP_PROVIDER",
    desc: [
        "Each time you take at least 5 <WOOD>, 4 <CLAY>, 3 <REED>, or 2 <STONE> from an accumulation space, you also get 1 <GRAIN>."
    ],
    cost: {
        "wood": 3
    },
    prerequisite: "2 Horses",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M110_FarmCart_impl = M110_FarmCart.impl
