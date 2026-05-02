import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C1_Overhaul'

/**
 * C1 Overhaul — Minor Improvement
 *
 * BGA `C1_Overhaul::onBuy` returns SEQ:
 *   1. SPECIAL_EFFECT returnFences (raze all wood-fence segments to supply)
 *   2. FENCING args { costs: WOOD => 0, min: n, max: n+3, noWoodPalisades: true }
 *      where n is the count of razed fences.
 *
 * Our `fencing` leaf currently does not honor:
 *   - `actionContext.costs` (free wood for fences)
 *   - `actionContext.min` / `max` (fence count bounds)
 *   - SE 'returnFences' (no such kind in special-effect.ts)
 *
 * **Deliberate divergence (Sprint 7a deferred):** implementing C1 fully
 * requires:
 *   1. New SE kind `raze-fences` (mutate fenceSegments → []).
 *   2. fence-validation extension for `costs.wood = 0` + min/max bounds
 *      (currently fences cost a fixed 1 wood per segment with no override).
 *   3. Thread actionContext through farm-choice → fence pending state.
 * All main-path changes outside the F1 onBuy SEQ-truncation scope.
 * Tracked in card_progress §刻意不同.
 *
 * For this sprint:
 *   - Optional fencing leaf retained (player can build fences but pays
 *     normal wood + cannot raze existing fences).
 *   - `passing: true` removed (per spec §决策点 1).
 */
export const C1_Overhaul = new MinorImprovement({
  id: CARD_ID,
  name: "Overhaul",
  deck: "C",
  number: 1,
  category: "FARM_PLANNER",
  desc: ["Immediately raze all of your fences, add up to 3 fences from your supply, and rebuild them. (You do not lose any animals during this.)"],
  cost: { wood: 1 },
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
  newSet: true,
})

export const C1_Overhaul_impl = {
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
