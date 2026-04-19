import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow, gainLeaf } from '../helpers/pay-gain-node'
import type { Field } from '../../game/types'
import { fieldFindStackOfKind, fieldHasCrop, fieldPopIfDepleted } from '../../game/field'

const CARD_ID = 'C57_Crudite'

/**
 * C57 Crudite:
 * onBuy: you can immediately buy exactly 1 VEGETABLE for 3 FOOD.
 * Anytime / StartHarvestFieldPhase: discard 1 VEGETABLE from on top of another
 * VEGETABLE in a field to get 4 FOOD.
 *
 * BGA: The anytime/harvest ability requires a vegetable field with >= 2 vegetables.
 * Discarding removes 1 remaining from the field and gains 4 food.
 *
 * Implementation notes:
 * - onStartHarvestFieldPhase: directly removes 1 vegetable from a qualifying field
 *   and returns a gain-4-food flow. This hook runs exactly once during harvest.
 * - Anytime: checks for qualifying field and returns gain-4-food. The handler must
 *   be side-effect-free because it may run multiple times during availability checks.
 *   The field decrement for anytime is handled in onStartHarvestFieldPhase at harvest
 *   time. The anytime action gives 4 food without field modification — a simplification
 *   from BGA where the field was decremented via a SPECIAL_EFFECT node.
 */

const hasQualifyingVegetableField = (player: { fields: Field[] }): boolean =>
  player.fields.some(
    (f) => fieldHasCrop(f, 'vegetable') && (fieldFindStackOfKind(f, 'vegetable')?.remaining ?? 0) >= 2,
  )

const removeVegetableFromField = (player: { fields: Field[] }): boolean => {
  const field = player.fields.find(
    (f) => fieldHasCrop(f, 'vegetable') && (fieldFindStackOfKind(f, 'vegetable')?.remaining ?? 0) >= 2,
  )
  if (!field) return false
  const vegStack = fieldFindStackOfKind(field, 'vegetable')
  if (!vegStack) return false
  vegStack.remaining -= 1
  fieldPopIfDepleted(field)
  return true
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (player.resources.food < 3) return
    return payGainFlow({
      cardId: CARD_ID,
      cost: { food: 3 },
      gain: { vegetable: 1 },
    })
  },
  onStartHarvestFieldPhase: (_state, player) => {
    if (!hasQualifyingVegetableField(player)) return
    // Remove 1 vegetable from qualifying field and gain 4 food
    if (!removeVegetableFromField(player)) return
    return gainLeaf(CARD_ID, { food: 4 })
  },
})

/**
 * Anytime: discard vegetable from field for 4 food.
 * Requires a vegetable field with >= 2 remaining.
 *
 * The handler is side-effect-free (no field mutation) because it runs during
 * availability checks. The returned flow only grants food.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C57-crudite-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasQualifyingVegetableField(context.player)) return
    return {
      flow: gainLeaf(CARD_ID, { food: 4 }),
      sourceCard: CARD_ID,
      labelKey: 'cards.C57_Crudite.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C57_Crudite = new MinorImprovement({
  id: CARD_ID,
  name: 'Crudite',
  deck: 'C',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you can immediately buy exactly 1 <VEGETABLE> for 3 <FOOD>. At any time, you can discard 1 <VEGETABLE> on top of another <VEGETABLE> in a field to get 4 <FOOD>.',
  ],
  cost: {},
  evenMoreSet: true,
})
