import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canStartFencing, getFenceCount } from '../../actions/effects/fencing'
import { clearPendingFenceBonus } from '../helpers/pending-fence-bonus'
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
    const stablesBuilt = context.player.stableTiles.length
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
    const freeFences = Math.max(0, 15 - getFenceCount(context.player))
    if (freeFences <= 0) return
    const previewPlayer = {
      ...context.player,
      resources: {
        ...context.player.resources,
        wood: (context.player.resources.wood ?? 0) + freeFences,
      },
    }
    if (!canStartFencing(context.state, previewPlayer)) return
    return { doable: true }
  },
}

const fenceBeforeListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-before-fence',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const freeFences = Math.max(0, 15 - getFenceCount(context.player))
    if (freeFences <= 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'reserve-fence-bonus',
        sourceCard: CARD_ID,
        params: {
          freeFences,
          counterKey: 'fencesDiscounted',
        },
      },
    }
  },
}

const fenceAfterListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-after-fence',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    clearPendingFenceBonus(context.player)
  },
}

export const C88_CarpentersApprentice_impl = {
  listeners: [constructCostListener, stablesCostListener, fenceIsDoableListener, fenceBeforeListener, fenceAfterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
