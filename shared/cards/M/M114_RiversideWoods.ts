import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M114_RiversideWoods'

const listener: CardListenerRegistration = {
  id: 'M114-riverside-woods-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const wood = Math.min(3, context.player.farmTerrain?.filter((tile) => tile.kind === 'forest').length ?? 0)
    if (wood <= 0) return
    return { flow: gainLeaf(CARD_ID, { wood }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M114_RiversideWoods = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Riverside Woods",
    deck: "M",
    number: 114,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "With this card, each time you use the __Fishing__ accumulation space, you also get 1 <WOOD> for each of your farmyard spaces containing at least 1 <FOREST>, up to a maximum of 3 <WOOD>."
    ],
    cost: {},
    prerequisite: "3 Major Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M114_RiversideWoods_impl = M114_RiversideWoods.impl
