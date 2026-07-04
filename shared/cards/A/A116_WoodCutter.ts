import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'

const CARD_ID = 'A116_WoodCutter'
/**
 * A116 Wood Cutter — Each time you use a wood accumulation space
 * (forest, copse, grove), you get 1 additional wood.
 *
 * BGA reference: A_116_WoodCutter.php
 */
const listener: CardListenerRegistration = {
  id: 'A116-wood-cutter-after-wood',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpaceId(context.space?.id)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A116_WoodCutter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Wood Cutter",
    deck: "A",
    number: 116,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you use a <WOOD> accumulation space, you get 1 additional <WOOD>.",
      ],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A116_WoodCutter_impl = A116_WoodCutter.impl
