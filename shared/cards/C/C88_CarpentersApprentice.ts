import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canStartFencing, getFenceCount } from '../../actions/effects/fencing'
import { clearPendingFenceBonus } from '../helpers/pending-fence-bonus'

const CARD_ID = 'C88_CarpentersApprentice'

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
    const stablesBuilt = context.player.stableTiles.length
    if (stablesBuilt >= 2) {
      return { costs: { wood: -1 } }
    }
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
    if (!canStartFencing(previewPlayer)) return
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

registerCardListener(constructCostListener)
registerCardListener(stablesCostListener)
registerCardListener(fenceIsDoableListener)
registerCardListener(fenceBeforeListener)
registerCardListener(fenceAfterListener)

export const C88_CarpentersApprentice = new Occupation({
  id: CARD_ID,
  name: "Carpenter's Apprentice",
  deck: "C",
  number: 88,
  category: "FARM_PLANNER",
  desc: ["Wood rooms cost you 2 <WOOD> less. Your 3rd and 4th stable each cost you 1 <WOOD> less. Your 13th to 15th fence each cost you nothing."],
  cost: {},
  players: "1+",
})
