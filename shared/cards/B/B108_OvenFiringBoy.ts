import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

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
const WOOD_SPACES = ['forest', 'copse', 'grove']

const listener: CardListenerRegistration = {
  id: 'B108-oven-firing-boy-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
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

registerCardListener(listener)

export const B108_OvenFiringBoy = new Occupation({
  id: CARD_ID,
  name: 'Oven Firing Boy',
  deck: 'B',
  number: 108,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use a wood accumulation space, you get an additional __Bake Bread__ action.',
  ],
  cost: {},
  players: '1+',
})
