import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow, gainLeaf } from '../helpers/pay-gain-node'
import type { Field } from '../../contract/types'
import { fieldFindStackOfKind, fieldHasCrop, fieldPopIfDepleted } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C57_Crudite } from '../../cards-display/C/C57_Crudite'
export { C57_Crudite }

const CARD_ID = C57_Crudite.id

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

/**
 * Anytime: discard vegetable from field for 4 food.
 * Requires a vegetable field with >= 2 remaining.
 *
 * The handler is side-effect-free (no field mutation) because it runs during
 * availability checks. The actual field decrement is done by the
 * `special-effect remove-field-crop` leaf inside the returned flow, so the
 * mutation only happens when the player actually picks the anytime entry
 * and the engine executes the SEQ.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C57-crudite-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasQualifyingVegetableField(context.player)) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'remove-field-crop', crop: 'vegetable', minRemaining: 2 },
          },
          gainLeaf(CARD_ID, { food: 4 }),
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C57_Crudite.anytime',
    }
  },
}

export const C57_Crudite_impl = {
  listeners: [anytimeListener],
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
