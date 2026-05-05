import { MinorImprovement } from '../types'
import { fieldIsEmpty } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C6_StoneClearing'

/**
 * C6 Stone Clearing — Minor Improvement
 *
 * BGA `C6_StoneClearing::onBuy` places 1 STONE meeple on each empty field
 * (Meeples::createResourceInLocation), making the field count as "planted"
 * with stone. The next field-phase harvest yields 1 stone per such field
 * by reaping the field's top stack.
 *
 * Our `Field.stacks` model uses `CropStack { kind: 'grain' | 'vegetable' }`
 * — `kind: 'stone'` is not allowed by the type. Implementing C6 fully
 * requires:
 *   1. Extending `CropStack` to accept `'stone'` (touches game/types.ts).
 *   2. Updating `reap()` to handle stone-yielding fields (touches
 *      shared/actions/effects/reap.ts and HarvestReapSummary).
 *   3. Updating sow / plow / field-display to ignore stone fields where
 *      appropriate (touches shared/domain/farmyard.ts and UI).
 * All main-path changes outside the F1 onBuy SEQ-truncation scope. Tracked
 * in card_progress §刻意不同.
 *
 * **Deliberate divergence (Sprint 7a):** we directly grant the stone to the
 * player's supply at buy time rather than placing it on the field for the
 * next harvest. This compresses two turns of timing into one but yields
 * the same final stone count when there's no Field-related Hook-card in
 * play (~all real-game cases).
 *
 * For this sprint:
 *   - `passing: true` removed (per spec §决策点 1).
 *   - Behavior unchanged from previous Sprint 6 baseline.
 */
export const C6_StoneClearing = new MinorImprovement({
  id: CARD_ID,
  name: "Stone Clearing",
  deck: "C",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately place 1 <STONE> on each of your empty fields. Harvest them during the next field phase. These fields are considered planted until then."],
  cost: { food: 1 },
})

export const C6_StoneClearing_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
      if (emptyFields === 0) return
      return {
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { stone: emptyFields },
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
