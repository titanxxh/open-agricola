import { MinorImprovement } from '../types'
import type { TradeModifier } from '../../contract/types'

const CARD_ID = 'D15_ClaySupports'

/**
 * BGA reference (D15_ClaySupports.php): `onPlayerComputeCostsConstruct` pushes
 * an alternative trade `{clay:2, wood:1, reed:1}` when `args.type === 'roomClay'`.
 * Our equivalent: a static TradeModifier on the `construct` cost type with a
 * `houseTypeClay` condition — the construct path builds `ComplexCost`
 * via `buildConstructCost` and routes through `computeAllBuyableCombinations`
 * with `costType:'construct'`. `applyCostModifiers` reads
 * `player.activeModifiers` (populated from this field via
 * `syncModifiersFromCatalog`) and merges trades into the cost; the enumerator
 * then enumerates all decompositions.
 * Note: `computeCosts` listeners are NOT invoked on the construct path,
 * so this modifier replaces the previous (dead) D15 listener implementation.
 */
export const D15_ClaySupports = new MinorImprovement({
  id: CARD_ID,
  name: 'Clay Supports',
  deck: 'D',
  number: 15,
  category: 'FARM_PLANNER',
  desc: ['Each time you build a clay room, you can pay 2 <CLAY>, 1 <WOOD>, and 1 <REED> instead of 5 <CLAY> and 2 <REED>.'],
  cost: { wood: 2 },
  modifier: {
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['construct'],
    // scope:'unit' bounds Σ-times ≤ nb (rooms being built) so D15 can apply
    // at most once per clay room — matches BGA's per-room `addCost`.
    scope: 'unit',
    from: { wood: 1 },
    to: { clay: 3, reed: 1 },
    conditions: { houseTypeClay: 1 },
  } as TradeModifier,
})
