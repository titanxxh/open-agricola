import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D1_ZigzagHarrow'

/**
 * D1 Zigzag Harrow — Minor Improvement
 *
 * BGA `D1_ZigzagHarrow::onBuy` returns `{ action: PLOW, optional: true,
 * args: { location: <zigzag-completing tile list from $this->getExtraDatas('zigzag')> } }`.
 * The `location` arg restricts the plow target to specific tiles that
 * complete an L-shape zigzag pattern.
 *
 * Our `plow` leaf currently doesn't honor an `actionContext.allowedTiles`
 * restriction — plow target selection happens in the farm-edit UI flow,
 * driven by `getPlowableTiles(player)` which only filters by occupancy +
 * field-adjacency, not by an external allowlist.
 *
 * **Deliberate divergence (Sprint 7a deferred):** restricting plow to
 * zigzag-completing positions requires:
 *   1. A board-geometry helper computing the zigzag-completing tile set
 *   2. Threading `actionContext.allowedTiles` through plow → plow-validation
 *      → farm-edit UI
 * Both are main-path changes outside the F1 onBuy SEQ-truncation scope.
 * Tracked in card_progress §刻意不同.
 *
 * Implementation:
 *   - Emit optional plow leaf (current behavior).
 *   - `passing: true` removed (per spec §决策点 1).
 */
export const D1_ZigzagHarrow = new MinorImprovement({
  id: CARD_ID,
  name: 'Zigzag Harrow',
  deck: 'D',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['You can immediately plow 1 field such that it completes a "zigzag" pattern.'],
  cost: { wood: 1 },
  prerequisite: '3 Fields in an "L" Shape',
})

export const D1_ZigzagHarrow_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'plow',
      sourceCard: CARD_ID,
      optional: true,
      // TODO: restrict to zigzag-completing field locations (requires
      //   board-geometry helper + plow-validation actionContext threading;
      //   tracked as Sprint 7a deferred — see comment above).
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
