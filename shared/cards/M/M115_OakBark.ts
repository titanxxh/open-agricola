import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'

const CARD_ID = 'M115_OakBark'

const afterExchangeListener: CardListenerRegistration = {
  id: 'M115-oak-bark-after-exchange',
  cardIds: [CARD_ID],
  actions: ['exchange'],
  phases: ['after' as ActionHookPhase],
  handler: (context) => {
    const count = context.eventQuery.filter('resource.exchanged', (event) =>
      (event.gained.food ?? 0) > 0,
    ).reduce(
      (sum, event) =>
        sum + (event.paid.boar ?? 0) + (event.paid.cattle ?? 0) + (event.paid.horse ?? 0),
      0,
    )
    if (count <= 0) return
    return {
      flow: gainLeaf(CARD_ID, { wood: count }),
      sourceCard: CARD_ID,
    }
  },
}

const feedingListener: CardListenerRegistration = {
  id: 'M115-oak-bark-feeding',
  cardIds: [CARD_ID],
  actions: ['harvest-feed-conversion'],
  phases: ['immediatelyAfter'],
  handler: (context) => {
    const count = context.eventQuery.filter('harvest.feedConverted', (event) =>
      event.playerId === context.player.id && (event.food.food ?? 0) > 0,
    ).reduce((sum, event) => sum + (event.cost.boar ?? 0) + (event.cost.cattle ?? 0) + (event.cost.horse ?? 0), 0)
    if (count > 0) return { flow: gainLeaf(CARD_ID, { wood: count }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterExchangeListener, feedingListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M115_OakBark = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Oak Bark",
    deck: "M",
    number: 115,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "When you play this card, you immediately get 2 <WOOD>. Each time you turn <<PIG>>, <CATTLE>, or <HORSE> into <FOOD>, you get 1 additional <WOOD> for each of these animals that you turn."
    ],
    cost: {
        "vegetable": 1
    },
    prerequisite: "2 Major Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M115_OakBark_impl = M115_OakBark.impl
