import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { fieldTopStack, fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A72_CalciumFertilizers } from '../../cards-display/A/A72_CalciumFertilizers'

const CARD_ID = A72_CalciumFertilizers.id

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

    // Fully automatic: add 1 crop to top stack of each planted field
    for (const field of plantedFields) {
      const top = fieldTopStack(field)
      if (top) top.remaining += 1
    }

    return {
      logKey: 'log.cardEffectGain',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

export const A72_CalciumFertilizers_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
