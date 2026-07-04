import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'

const CARD_ID = 'B108_OvenFiringBoy'
/**
 * B108 Oven Firing Boy
 * Each time you use a wood accumulation space, you get an additional
 * Bake Bread action.
 *
 * BGA: isBeforeCollectEvent for WOOD → bakeBreadNode()
 * In open-agricola: listen for place-farmer on forest/copse/grove,
 * return optional bake-bread leaf.
 */
const listener: CardListenerRegistration = {
  id: 'B108-oven-firing-boy-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpaceId(context.space?.id)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'bake-bread',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B108_OvenFiringBoy = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Oven Firing Boy',
    deck: 'B',
    number: 108,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time you use a <WOOD> accumulation space, you get an additional __Bake Bread__ action.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B108_OvenFiringBoy_impl = B108_OvenFiringBoy.impl
