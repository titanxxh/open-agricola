import { getFenceCount } from '../../actions/effects/fencing'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C1_Overhaul } from '../../cards-display/C/C1_Overhaul'

const CARD_ID = C1_Overhaul.id

/**
 * C1 Overhaul — Minor Improvement (passing card)
 *
 * BGA `C1_Overhaul::onBuy`:
 *   1. count `n` = wood-fence (non-palisade) segments on board.
 *   2. If `n === 0`: no-op.
 *   3. Otherwise SEQ:
 *      a. SPECIAL_EFFECT returnFences — return all wood fences to supply.
 *      b. FENCING args { costs: WOOD => 0, min: n, max: n+3,
 *                         noWoodPalisades: true }.
 *
 * OA implementation:
 *   - `consume-fence` SE razes the `n` existing wood fences.
 *   - `fence` leaf carries `actionContext.costOverride.wood = -(n+3)` so
 *     dispatcher cost preview + `computeFreeFenceTotal` see `n+3` free
 *     fence capacity. Player picks m ≤ n+3 new fence edges → all free.
 *   - No listener, no cardStates flag — the discount is effect-level
 *     (matches BGA `costs: WOOD => 0` written in fencing action args).
 *
 * Deliberate simplifications (vs BGA):
 *   - We do NOT enforce `min: n` (SEQ optional lets the player skip rebuild).
 *   - We do NOT enforce `noWoodPalisades` (B30 coexistence is rare;
 *     passing fence args allows wood palisades).
 */

const buildOnBuyFlow = (fenceCount: number): ActionFlow | undefined => {
  if (fenceCount <= 0) return undefined
  return {
    type: 'seq' as const,
    optional: true,
    children: [
      {
        type: 'leaf' as const,
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'consume-fence', count: fenceCount },
      },
      {
        type: 'leaf' as const,
        actionId: 'fence',
        sourceCard: CARD_ID,
        actionContext: { costOverride: { wood: -(fenceCount + 3) } },
      },
    ],
  }
}

export const C1_Overhaul_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => buildOnBuyFlow(getFenceCount(player)),
  },
  listeners: [],
  reaches: [] as readonly string[],
} satisfies CardImpl
