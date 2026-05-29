import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import {
  canStartFencing,
  getTotalPastureCells,
  maxPastureCells,
} from '../../actions/effects/fencing'
import { getOwnOrdinaryFenceCount } from '../../domain/fence-segments'
import { getOwnOrdinaryFenceBuildLimit } from '../../domain/supply-tokens'
import { getOrdinaryStableCount } from '../../domain/stables'
import type { CardImpl } from '../registry'
import { C88_CarpentersApprentice } from '../../cards-display/C/C88_CarpentersApprentice'

const CARD_ID = C88_CarpentersApprentice.id

const constructCostListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'wood') return
    return { costs: { wood: -2 } }
  },
}

const stablesCostListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-costs-stables',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // BGA `countCarpenterDiscounts`: only the 3rd and 4th stable get -1 wood.
    // Players never build a 5th (max stable count is 4) but cap defensively.
    const stablesBuilt = getOrdinaryStableCount(context.player)
    if (stablesBuilt < 2 || stablesBuilt >= 4) return
    return { costs: { wood: -1 } }
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

export const C88_CarpentersApprentice_impl = {
  listeners: [constructCostListener, stablesCostListener, fenceIsDoableListener, fenceCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
