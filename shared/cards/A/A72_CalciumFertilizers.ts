import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldTopStack, fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A72_CalciumFertilizers'
/**
 * A72 Calcium Fertilizers:
 * Prerequisite: No Field Tiles (player must have 0 fields to buy this card).
 * Each time you use a Quarry accumulation space (Eastern Quarry or Western Quarry),
 * add 1 additional crop to each of your planted fields growing a single type of crop.
 *
 * In our model each field has exactly one crop type (grain or vegetable), so every
 * planted field (crop !== null && remaining > 0) qualifies. The effect is fully automatic
 * — no player choice needed.
 *
 * BGA reference: A_72_CalciumFertilizers.php — groups adjacent fields and checks for
 * single-type groups. Our simpler per-field model means each planted field independently
 * qualifies.
 */
const listener: CardListenerRegistration = {
  id: 'A72-calcium-fertilizers-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (context.space.id !== 'eastern-quarry' && context.space.id !== 'western-quarry') return

    // Find planted fields with crops remaining
    const plantedFields = context.player.fields.filter((f) => !fieldIsEmpty(f))
    if (plantedFields.length === 0) return

    // Fully automatic: add 1 crop to top stack of each planted field.
    // Skip stone-kind stacks (C6 StoneClearing) — BGA "additional crop"
    // only applies to GRAIN/VEGETABLE.
    for (const field of plantedFields) {
      const top = fieldTopStack(field)
      if (top && (top.kind === 'grain' || top.kind === 'vegetable')) {
        top.remaining += 1
      }
    }

    return {
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A72_CalciumFertilizers = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Calcium Fertilizers",
    deck: "A",
    number: 72,
    category: "CROP_PROVIDER",
    desc: ["Each time you use a __Quarry__ accumulation space, add 1 additional good of the respective type to each of your planted fields growing a single type of crop."],
    cost: {},
    prerequisite: "No Field Tiles",
  },
  impl: cardImpl,
})

export const A72_CalciumFertilizers_impl = A72_CalciumFertilizers.impl
