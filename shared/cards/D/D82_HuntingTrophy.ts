import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Bonus } from '../../contract/types'
import { canStartFencing } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { D82_HuntingTrophy } from '../../cards-display/D/D82_HuntingTrophy'

const CARD_ID = D82_HuntingTrophy.id

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
    return { costs: { wood: -3 } }
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
  actions: ['improvement-any', 'minor-improvement'],
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

export const D82_HuntingTrophy_impl = {
  listeners: [
    farmRedevFenceCostListener,
    farmRedevFenceIsDoableListener,
    improvementCostListener,
  ],
  reaches: [] as readonly string[],
} satisfies CardImpl
