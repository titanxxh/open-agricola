import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import {
  canStartFencing,
  getTotalPastureCells,
  maxPastureCells,
} from '../../actions/effects/fencing'
import { getOwnOrdinaryFenceCount } from '../../domain/fence-segments'
import { getOwnOrdinaryFenceBuildLimit } from '../../domain/supply-tokens'
import { getStableCountForCards } from '../../domain/stables'
import type { CardImpl } from '../registry'
import { constructUnitDiscountTrade } from '../helpers/construct-cost'

const CARD_ID = 'C088_CarpentersApprentice'
const constructCostListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'wood') return
    return { trades: [constructUnitDiscountTrade(CARD_ID, { wood: 2 })] }
  },
}

const stablesCostListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-costs-stables',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // BGA `countCarpenterDiscounts`: stable #3 and #4 each cost 1 wood less,
    // counted by card-facing stable count (ordinary + B85 FarmHand). The total
    // discount depends on how many of the 3rd/4th seats this build crosses, so
    // it is a single aggregate amount rather than a per-unit delta. Callers
    // therefore must pass `params.stableCount` = the stables this build/probe
    // covers (ordinary + FarmHand); the dispatcher's per-unit computeCosts pass
    // omits it (it cannot scale a partial discount) and yields no discount.
    const totalBuilt = typeof context.params?.stableCount === 'number'
      ? context.params.stableCount
      : 0
    if (totalBuilt <= 0) return
    const before = getStableCountForCards(context.player)
    const after = before + totalBuilt
    let discounted = 0
    if (before < 3 && after >= 3) discounted += 1
    if (before < 4 && after >= 4) discounted += 1
    if (discounted <= 0) return
    return { costs: { wood: -discounted } }
  },
}

const fenceIsDoableListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-isdoable-fence',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    const player = context.player
    const before = getOwnOrdinaryFenceCount(player)
    const buildLimit = getOwnOrdinaryFenceBuildLimit(player)
    if (before >= buildLimit) return
    if (buildLimit < 13) return
    if (getTotalPastureCells(player) >= maxPastureCells) return
    const wood = player.resources.wood ?? 0
    // BGA Fencing.php:195-201: the free band unlocks only once the player
    // can self-pay up to the 12th fence.
    const neededToReach12 = Math.max(0, 12 - before)
    if (wood < neededToReach12) return
    if (before >= 12) {
      const remainingFreeFences = buildLimit - before
      if (!canStartFencing(context.state, player, undefined, {
        fencePolicy: {
          allowedSegmentTypes: ['fence'],
          segmentBounds: {
            fence: { min: 1, max: remainingFreeFences },
            total: { min: 1, max: remainingFreeFences },
          },
          costPolicy: { fence: { wood: 0 } },
        },
      })) return
      return { doable: true }
    }
    const freeFences = Math.max(0, buildLimit - 12)
    const previewPlayer = {
      ...player,
      resources: { ...player.resources, wood: wood + freeFences },
    }
    if (!canStartFencing(context.state, previewPlayer)) return
    return { doable: true }
  },
}

const fenceCostListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-costs-fence',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const newFenceEdges = context.params?.newFenceEdges as string[] | undefined
    const buildingNow = newFenceEdges?.length ?? 0
    if (buildingNow <= 0) return
    // BGA Fencing.php:595-601: the 13th-15th fence each cost 1 wood less.
    const before = getOwnOrdinaryFenceCount(context.player)
    const buildLimit = getOwnOrdinaryFenceBuildLimit(context.player)
    const start = before + 1
    const end = before + buildingNow
    const free = Math.max(0, Math.min(end, buildLimit) - Math.max(start, 13) + 1)
    if (free <= 0) return
    return { costs: { wood: -free } }
  },
}

const cardImpl = {
  listeners: [constructCostListener, stablesCostListener, fenceIsDoableListener, fenceCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C088_CarpentersApprentice = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Carpenter's Apprentice",
    deck: "C",
    number: 88,
    category: "FARM_PLANNER",
    desc: ["Wood rooms cost you 2 <WOOD> less. Your 3rd and 4th stable each cost you 1 <WOOD> less. Your 13th to 15th fence each cost you nothing."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const C088_CarpentersApprentice_impl = C088_CarpentersApprentice.impl
