import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C116_FurnitureMaker'

/**
 * C116 Furniture Maker:
 * onBuy: gain 1 wood.
 * Each time you play an occupation after this one, you get 1 WOOD for each FOOD
 * paid as occupation cost.
 *
 * BGA: Listens to Pay event with sourceAction == 'Occupation'.
 * We listen to 'play-occupation' after phase and compute the food cost from
 * the lessons cost formula.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
})

const afterOccupationListener: CardListenerRegistration = {
  id: 'C116-furniture-maker-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Don't trigger on playing this card itself
    if (context.choice === CARD_ID) return
    // Calculate the food cost that was paid. The lessons cost depends on the
    // number of occupations already played and the space (lessons vs lessons-4).
    // At this point the occupation was already added to occupationPlayed,
    // so we need to reconstruct the cost at the time of payment.
    // The space ID tells us which lessons action space was used.
    const spaceId = context.space?.id ?? 'lessons'
    // Reconstruct the player state as it was before the occupation was played:
    // - occupationPlayed length was 1 less (the just-played card is now in the list)
    const occCountBefore = context.player.occupationPlayed.length - 1
    // Lessons cost: 0 food if first occupation, 1 food otherwise
    // Lessons-4 cost: 1 food if <= 1 occupation, 2 food otherwise
    let food: number
    if (spaceId === 'lessons-4') {
      food = occCountBefore <= 1 ? 1 : 2
    } else {
      food = occCountBefore === 0 ? 0 : 1
    }
    // Apply modifier discounts (B109_PaperMaker etc.)
    for (const mod of context.player.activeModifiers ?? []) {
      if (mod.type === 'bonus' && mod.appliesTo.includes('occupation')) {
        if (mod.discount.food && food > 0) {
          food = Math.max(0, food - mod.discount.food)
        }
      }
    }
    if (food <= 0) return
    return { flow: gainLeaf(CARD_ID, { wood: food }), sourceCard: CARD_ID }
  },
}

registerCardListener(afterOccupationListener)

export const C116_FurnitureMaker = new Occupation({
  id: CARD_ID,
  name: 'Furniture Maker',
  deck: 'C',
  number: 116,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD>. Each time you play an occupation after this one, you get 1 <WOOD> for each <FOOD> paid as occupation cost.',
  ],
  cost: {},
  players: '1+',
})
