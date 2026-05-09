import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Bonus, CostModifier } from '../../contract/types'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
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
 *   - Effect 1: `before:place-farmer` (space=house-redev) flags D82 via
 *     setCardFlag; `computeCosts` listener for `improvement-any` checks the
 *     flag and emits a BonusModifier with 4 chooseOne entries (one per building
 *     resource); `after:place-farmer` clears the flag.
 *   - Effect 2: `before:place-farmer` (space=farm-redev) pushes a fencing
 *     BonusModifier into player.activeModifiers; `after:place-farmer` pops it.
 */

const isFarmRedev = (context: CardListenerContext): boolean =>
  context.space?.id === FARM_REDEV

const isHouseRedev = (context: CardListenerContext): boolean =>
  context.space?.id === HOUSE_REDEV

const beforeFarmRedev: CardListenerRegistration = {
  id: 'D82-hunting-trophy-before-farm-redevelopment',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isFarmRedev(context)) return
    const mod: CostModifier = {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['fencing'],
      discount: { wood: 3 },
      optional: false,
    }
    if (!context.player.activeModifiers) {
      ;(context.player as unknown as { activeModifiers: CostModifier[] }).activeModifiers = []
    }
    const existing = context.player.activeModifiers!.some(
      (m) => m.cardId === CARD_ID,
    )
    if (!existing) context.player.activeModifiers!.push(mod)
  },
}

const afterFarmRedev: CardListenerRegistration = {
  id: 'D82-hunting-trophy-after-farm-redevelopment',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isFarmRedev(context)) return
    if (!context.player.activeModifiers) return
    context.player.activeModifiers = context.player.activeModifiers.filter(
      (m) => m.cardId !== CARD_ID,
    )
  },
}

const beforeHouseRedev: CardListenerRegistration = {
  id: 'D82-hunting-trophy-before-house-redevelopment',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isHouseRedev(context)) return
    setCardFlag(context.player, CARD_ID, true)
  },
}

const afterHouseRedev: CardListenerRegistration = {
  id: 'D82-hunting-trophy-after-house-redevelopment',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isHouseRedev(context)) return
    setCardFlag(context.player, CARD_ID, false)
  },
}

const improvementCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-improvement-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return
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
    beforeFarmRedev,
    afterFarmRedev,
    beforeHouseRedev,
    afterHouseRedev,
    improvementCostListener,
  ],
  reaches: [] as readonly string[],
} satisfies CardImpl
