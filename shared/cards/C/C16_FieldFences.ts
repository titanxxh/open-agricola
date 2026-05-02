import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C16_FieldFences'

/**
 * C16 Field Fences — Minor Improvement
 *
 * BGA `C16_FieldFences::onBuy` returns SEQ optional:
 *   FENCING args { fieldFences: true, costs: WOOD => 1 }
 * The `fieldFences: true` flag tells the fencing logic that fence segments
 * **adjacent to a field** cost 0 wood instead of the normal 1 wood.
 *
 * Our `fencing` leaf currently does not honor:
 *   - `actionContext.fieldFences` (per-edge wood cost override based on
 *     field-adjacency)
 *
 * **Deliberate divergence (Sprint 7a deferred):** the field-adjacent free
 * wood requires:
 *   1. fence-validation extension to compute per-edge cost (currently
 *      `payableWoodCost = newFenceCount + 2 * newPalisadeCount`).
 *   2. board-geometry helper to determine which edges are field-adjacent.
 *   3. Thread actionContext through farm-choice → fence pending state.
 * All main-path changes outside the F1 onBuy SEQ-truncation scope. Tracked
 * in card_progress §刻意不同.
 *
 * For this sprint, the optional fencing leaf is retained (player can build
 * fences but pays normal wood for every segment).
 */
export const C16_FieldFences = new MinorImprovement({
  id: CARD_ID,
  name: "Field Fences",
  deck: "C",
  number: 16,
  category: "FARM_PLANNER",
  desc: ["You can immediately take a __Build Fences__ action, during which you do not have to pay <WOOD> for fences that you build next to field tiles."],
  cost: { food: 2 },
})

export const C16_FieldFences_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, _player) => {
      return {
        type: 'seq' as const,
        optional: true,
        children: [
          {
            type: 'leaf' as const,
            actionId: 'fencing',
            sourceCard: CARD_ID,
          },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
