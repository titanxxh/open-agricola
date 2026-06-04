import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C128_WoodenHutExtender'
/**
 * C128 Wooden Hut Extender — Wood rooms cost 1 reed, and additionally:
 *   - Rounds 1–5:  5 wood + 1 reed  (base 5+2, so -1 reed)
 *   - Rounds 6–7:  4 wood + 1 reed  (base 5+2, so -1 wood -1 reed)
 *   - Round 8+:    3 wood + 1 reed  (base 5+2, so -2 wood -1 reed)
 *
 * BGA reference: onPlayerComputeCostsConstruct calls Utils::addCost to set the full cost
 * based on the current round, only for roomWood type.
 */

const constructCostListener: CardListenerRegistration = {
  id: 'C128-wooden-hut-extender-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'wood') return
    const round = context.state.round
    // Always reduce reed from 2 to 1 (-1 reed)
    // Additionally reduce wood based on round
    if (round >= 8) {
      return { costs: { wood: -2, reed: -1 } }
    }
    if (round >= 6) {
      return { costs: { wood: -1, reed: -1 } }
    }
    // Rounds 1-5: 5 wood + 1 reed (only reed discount)
    return { costs: { reed: -1 } }
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
