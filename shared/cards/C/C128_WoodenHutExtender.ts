import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { constructUnitPriceTrade, constructedRoomMaterial } from '../helpers/construct-cost'

const CARD_ID = 'C128_WoodenHutExtender'
/**
 * C128 Wooden Hut Extender — Wood rooms cost 1 reed, and additionally:
 *   - Rounds 1–5:  5 wood + 1 reed
 *   - Rounds 6–7:  4 wood + 1 reed
 *   - Round 8+:    3 wood + 1 reed
 *
 * Reference: onPlayerComputeCostsConstruct calls Utils::addCost to set the full cost
 * based on the current round, only for roomWood type.
 */

const constructCostListener: CardListenerRegistration = {
  id: 'C128-wooden-hut-extender-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (constructedRoomMaterial(context) !== 'wood') return
    const round = context.state.round
    if (round >= 8) {
      return { trades: [constructUnitPriceTrade(CARD_ID, { wood: 3, reed: 1 })] }
    }
    if (round >= 6) {
      return { trades: [constructUnitPriceTrade(CARD_ID, { wood: 4, reed: 1 })] }
    }
    return { trades: [constructUnitPriceTrade(CARD_ID, { wood: 5, reed: 1 })] }
  },
}

const cardImpl = {
  listeners: [constructCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C128_WoodenHutExtender = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wooden Hut Extender',
    deck: 'C',
    number: 128,
    category: 'FARM_PLANNER',
    desc: ['Wood rooms now cost you 1 <REED>, and additionally 5 <WOOD> through round 5, 4 <WOOD> in rounds 6 and 7, and 3 <WOOD> in round 8 and later.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const C128_WoodenHutExtender_impl = C128_WoodenHutExtender.impl
