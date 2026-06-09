import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { constructUnitDiscountTrade } from '../helpers/construct-cost'

const CARD_ID = 'B126_Carpenter'
/**
 * B126 Carpenter — Every new room only costs 3 of the appropriate building resource
 * and 2 reed (instead of the standard 5+2).
 *
 * BGA reference: onPlayerComputeCostsConstruct calls Utils::addCost with [res => 3, REED => 2].
 */

const constructCostListener: CardListenerRegistration = {
  id: 'B126-carpenter-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const houseType = context.player.houseType
    if (houseType === 'clay') return { trades: [constructUnitDiscountTrade(CARD_ID, { clay: 2 })] }
    if (houseType === 'stone') return { trades: [constructUnitDiscountTrade(CARD_ID, { stone: 2 })] }
    return { trades: [constructUnitDiscountTrade(CARD_ID, { wood: 2 })] }
  },
}

const cardImpl = {
  listeners: [constructCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B126_Carpenter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Carpenter',
    deck: 'B',
    number: 126,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Every new room only costs you 3 of the appropriate building resource and 2 <REED> (e.g. if you live in a wooden house, 3 <WOOD> and 2 <REED>).'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B126_Carpenter_impl = B126_Carpenter.impl
