import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Bonus, Trade } from '../../contract/types'
import { canStartFencing } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'D82_HuntingTrophy'
const FARM_REDEV = 'farm-redevelopment'

const HOUSE_REDEV = 'house-redevelopment'

/**
 * D82 Hunting Trophy (MinorImprovement)
 *
 * BGA behavior:
 *   1. Improvements built on HouseRedevelopment cost 1 building resource of
 *      player's choice less. Gated by `actionCardId == 'ActionHouseRedevelopment'`.
 *   2. Fences built on FarmRedevelopment cost a total of 3 wood less.
 *
 * Implementation:
 *   - Effect 1: `computeCosts` on house-redevelopment's improvement leaf emits
 *     a Bonus with 4 chooseOne entries (one per building resource).
 *   - Effect 2: `computeCosts` on farm-redevelopment's fence leaf discounts
 *     3 wood; `isDoable` mirrors that discount for the fence entry guard.
 */

const isFarmRedev = (context: CardListenerContext): boolean =>
  context.space?.id === FARM_REDEV

const isHouseRedev = (context: CardListenerContext): boolean =>
  context.space?.id === HOUSE_REDEV

const farmRedevFenceCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-farm-redevelopment-fence-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isFarmRedev(context)) return
    const trade: Trade = {
      from: {},
      to: { wood: 1 },
      max: 3,
      scope: 'action',
      sourceId: CARD_ID,
    }
    return { trades: [trade] }
  },
}

const farmRedevFenceIsDoableListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-farm-redevelopment-fence-isdoable',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (!isFarmRedev(context)) return
    if (!canStartFencing(context.state, context.player, { wood: -3 })) return
    return { doable: true }
  },
}

const improvementCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-improvement-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isHouseRedev(context)) return
    const bonus: Bonus = {
      choices: [
        { discount: { wood: 1 }, sources: [CARD_ID] },
        { discount: { clay: 1 }, sources: [CARD_ID] },
        { discount: { stone: 1 }, sources: [CARD_ID] },
        { discount: { reed: 1 }, sources: [CARD_ID] },
      ],
      optional: false,
      sources: [CARD_ID],
    }
    return { bonuses: [bonus] }
  },
}

const cardImpl = {
  listeners: [
    farmRedevFenceCostListener,
    farmRedevFenceIsDoableListener,
    improvementCostListener,
  ],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D82_HuntingTrophy = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Hunting Trophy',
    deck: 'D',
    number: 82,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Improvements built on __House Redevelopment__ cost you 1 building resource of your choice less. Fences built on __Farm Redevelopment__ cost you a total of 3 <WOOD> less.',
      ],
    vp: 1,
  },
  impl: cardImpl,
})

export const D82_HuntingTrophy_impl = D82_HuntingTrophy.impl
