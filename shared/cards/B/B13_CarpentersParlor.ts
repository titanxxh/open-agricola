import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { constructUnitDiscountTrade } from '../helpers/construct-cost'

const CARD_ID = 'B13_CarpentersParlor'
/**
 * B13 Carpenter's Parlor — Wooden rooms only cost you 2 wood and 2 reed each
 * (instead of the standard 5 wood + 2 reed).
 *
 * BGA reference: onPlayerComputeCostsConstruct sets cost to [WOOD => 2, REED => 2]
 * for roomWood type.
 */

const constructCostListener: CardListenerRegistration = {
  id: 'B13-carpenters-parlor-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'wood') return
    return { trades: [constructUnitDiscountTrade(CARD_ID, { wood: 3 })] }
  },
}

const cardImpl = {
  listeners: [constructCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B13_CarpentersParlor = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Carpenter's Parlor",
    deck: 'B',
    number: 13,
    category: 'FARM_PLANNER',
    desc: ['Wooden rooms only cost you 2 <WOOD> and 2 <REED> each.'],
    cost: { wood: 1, stone: 1 },
  },
  impl: cardImpl,
})

export const B13_CarpentersParlor_impl = B13_CarpentersParlor.impl
