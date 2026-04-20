import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D17_DrillHarrow'

/**
 * D17 Drill Harrow (Minor Improvement):
 * Each time before you take an unconditional Sow action, you can pay 3 food to plow 1 field.
 *
 * BGA reference:
 * - isListeningTo: before Sow event, only if Sow.isUnconditional
 * - onPlayerBeforeSow: optional seq(pay 3 food, plow)
 * - onPlayerIsDoable: if action == SOW, set isDoable = true
 *   (because even without seeds, you can plow a field which may enable sowing)
 */

const isUnconditionalSow = (context: CardListenerContext): boolean => {
  const actionContext = context.actionContext ?? {}
  if (actionContext.checkedReplaceAction === true) return false
  return actionContext.maxSelections === undefined && actionContext.cropType === undefined
}

// Before unconditional sow: optionally pay 3 food to plow 1 field
const beforeSowListener: CardListenerRegistration = {
  id: 'D17-drill-harrow-before-sow',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 3 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

// isDoable: make sow doable (plowing a field may create a sowable field)
const isDoableListener: CardListenerRegistration = {
  id: 'D17-drill-harrow-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context)) return
    if (context.doable) return
    // Player can plow to create an empty field, making sow possible
    if (context.player.resources.food < 3) return
    return { doable: true }
  },
}

export const D17_DrillHarrow = new MinorImprovement({
  id: CARD_ID,
  name: 'Drill Harrow',
  deck: 'D',
  number: 17,
  category: 'FARM_PLANNER',
  desc: ['Each time before you take an unconditional __Sow__ action, you can pay 3 <FOOD> to plow 1 field.'],
  cost: { wood: 1 },
  evenMoreSet: true,
})

export const D17_DrillHarrow_impl = {
  listeners: [beforeSowListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
