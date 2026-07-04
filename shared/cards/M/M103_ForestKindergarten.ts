import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { countTerrain } from './moor-batch1-helpers'

const CARD_ID = 'M103_ForestKindergarten'

const listener: CardListenerRegistration = {
  id: 'M103-forest-kindergarten-after-family-growth',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const food = countTerrain(context.player, 'forest')
    if (food <= 0) return
    return { flow: gainLeaf(CARD_ID, { food }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => countTerrain(player, 'forest') <= 3,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M103_ForestKindergarten = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Forest Kindergarten",
    deck: "M",
    number: 103,
    category: "FOOD_PROVIDER",
    desc: [
        "Immediately after each time you take a \"Family Growth\" action with or without room, you get 1 <FOOD> for each of your farmyard spaces containing at least 1 <FOREST>."
    ],
    cost: {
        "wood": 1,
        "stone": 2
    },
    vp: 1,
    prerequisite: "At Most 3 Forests",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M103_ForestKindergarten_impl = M103_ForestKindergarten.impl
