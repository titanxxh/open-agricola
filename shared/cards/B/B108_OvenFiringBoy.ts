import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B108_OvenFiringBoy } from '../../cards-display/B/B108_OvenFiringBoy'
export { B108_OvenFiringBoy }

const CARD_ID = B108_OvenFiringBoy.id

/**
 * B108 Oven Firing Boy
 * Each time you use a wood accumulation space, you get an additional
 * Bake Bread action.
 *
 * BGA: isBeforeCollectEvent for WOOD → bakeBreadNode()
 * In open-agricola: listen for place-farmer on forest/copse/grove,
 * return optional bake-bread leaf.
 */
const WOOD_SPACES = ['forest', 'copse', 'grove']

const listener: CardListenerRegistration = {
  id: 'B108-oven-firing-boy-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !WOOD_SPACES.includes(context.space.id)) return
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

export const B108_OvenFiringBoy_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
