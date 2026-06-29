import { defineMinorCard } from '../card-source'
import type { TradeModifier } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D015_ClaySupports'

/**
 * BGA reference (D015_ClaySupports.php): `onPlayerComputeCostsConstruct` pushes
 * an alternative trade `{clay:2, wood:1, reed:1}` when `args.type === 'roomClay'`.
 * Our equivalent: a static TradeModifier on the `construct` cost type with a
 * `houseTypeClay` condition — the construct path builds `ComplexCost`
 * via `buildConstructCost` and routes through `computeAllBuyableCombinations`
 * with `costType:'construct'`. `applyCostModifiers` reads
 * `player.activeModifiers` (populated from this field via
 * `syncModifiersFromCatalog`) and merges trades into the cost; the enumerator
 * then enumerates all decompositions.
 * Static modifiers keep this always-on room alternative in the player's
 * active construct cost modifiers.
 */

export const D015_ClaySupports = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Clay Supports',
    deck: 'D',
    number: 15,
    category: 'FARM_PLANNER',
    desc: ['Each time you build a clay room, you can pay 2 <CLAY>, 1 <WOOD>, and 1 <REED> instead of 5 <CLAY> and 2 <REED>.'],
    cost: { wood: 2 },
  },
  impl: {
  modifiers: [{
        type: 'trade',
        cardId: CARD_ID,
        appliesTo: ['construct'],
        // scope:'unit' applies this replacement to each clay-room cost row,
        // matching BGA's per-room `addCost`.
        scope: 'unit',
        from: { wood: 1 },
        to: { clay: 3, reed: 1 },
        conditions: { houseTypeClay: 1 },
      } as TradeModifier],
} satisfies CardImpl,
})

export const D015_ClaySupports_impl = D015_ClaySupports.impl
