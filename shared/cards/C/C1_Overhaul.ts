import { MinorImprovement } from '../types'
import { readCardExtraData } from '../helpers/card-state'
import { getFenceCount } from '../../actions/effects/fencing'
import type { ActionFlow, PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C1_Overhaul'
const FLAG_KEY = 'c1Active'
const MAX_REBUILD_KEY = 'c1MaxRebuild'

/**
 * C1 Overhaul — Minor Improvement
 *
 * BGA `C1_Overhaul::onBuy`:
 *   1. count `n` = wood-fence (non-palisade) segments on board.
 *   2. If `n === 0`: no-op.
 *   3. Otherwise SEQ:
 *      a. SPECIAL_EFFECT returnFences — return all wood fences to supply.
 *      b. FENCING args { costs: WOOD => 0, min: n, max: n+3,
 *                         noWoodPalisades: true }.
 *
 * Implementation strategy (no main-path edits):
 *   - We use the existing `consume-fence` SE to raze (count=n) wood fences.
 *   - We set a `c1Active=true` flag and store `c1MaxRebuild = n+3` on the
 *     card state, then run a `fence` leaf, then clear the flag.
 *   - `computeFenceDiscount` while the flag is set returns
 *     `min(newFenceEdges, c1MaxRebuild)` — every selected new fence is free
 *     (matches BGA `costs: WOOD => 0`) up to the rebuild cap.
 *   - `computeFenceFreeAvailable` returns `c1MaxRebuild` so the entry
 *     guard sees fencing as doable even with 0 wood.
 *
 * Deliberate simplification (recorded in card_progress §刻意不同):
 *   - We do NOT enforce BGA's `min: n` (player can decline / build less);
 *     SEQ optional lets the player skip rebuild entirely.
 *   - We do NOT enforce BGA's `noWoodPalisades` flag; B30 + C1 coexistence
 *     is a corner case (B30 is a separate played card and palisades are
 *     never razed by C1 anyway). If the player happens to have B30, they
 *     can still place wood-palisades during C1's fencing — accepted gap.
 */
const isC1Active = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, FLAG_KEY) === true

const getC1MaxRebuild = (player: PlayerState): number =>
  readCardExtraData<number>(player, CARD_ID, MAX_REBUILD_KEY) ?? 0

export const C1_Overhaul = new MinorImprovement({
  id: CARD_ID,
  name: 'Overhaul',
  deck: 'C',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['Immediately raze all of your fences, add up to 3 fences from your supply, and rebuild them. (You do not lose any animals during this.)'],
  cost: { wood: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})

const setExtraDataFlow = (key: string, value: unknown): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key, value },
})

export const C1_Overhaul_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const fenceCount = getFenceCount(player)
      if (fenceCount <= 0) return undefined
      const maxRebuild = fenceCount + 3
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
          setExtraDataFlow(FLAG_KEY, true),
          setExtraDataFlow(MAX_REBUILD_KEY, maxRebuild),
          { type: 'leaf' as const, actionId: 'fence', sourceCard: CARD_ID },
          setExtraDataFlow(FLAG_KEY, false),
        ],
      }
    },
    computeFenceDiscount: (_state, player, ctx) => {
      if (!isC1Active(player)) return 0
      const cap = getC1MaxRebuild(player)
      return Math.min(ctx.newFenceEdges.length, cap)
    },
    computeFenceFreeAvailable: (_state, player) => {
      if (!isC1Active(player)) return 0
      return getC1MaxRebuild(player)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
