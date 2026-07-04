import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { hasMoorSpecialActionChoice, MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID } from '../../moor/special-action-flow'
import type { MoorSpecialActionId } from '../../moor/types'
import type { CardImpl } from '../registry'
import { allImprovementCount, setUsageCounterLeaf } from './moor-batch1-helpers'

const CARD_ID = 'M055_ToolShed'
const TRIGGER_ACTIONS = new Set<MoorSpecialActionId>(['cut-peat', 'slash-and-burn'])

const otherAction = (actionId: string): MoorSpecialActionId | undefined => {
  if (actionId === 'cut-peat') return 'slash-and-burn'
  if (actionId === 'slash-and-burn') return 'cut-peat'
  return undefined
}

const usedThisRound = (context: CardListenerContext) =>
  context.player.cardStates?.[CARD_ID]?.counters?.usage === context.state.round

const toolShedFlow = (context: CardListenerContext, actionId: MoorSpecialActionId) => {
  const actionContext = { mode: 'take-action', actionIds: [actionId] }
  if (!hasMoorSpecialActionChoice(context.state, context.player, actionContext)) return
  return {
    type: 'seq' as const,
    optional: true,
    children: [
      setUsageCounterLeaf(CARD_ID, context.state.round),
      {
        type: 'leaf' as const,
        actionId: MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID,
        sourceCard: CARD_ID,
        actionContext,
      },
    ],
  }
}

const listener: CardListenerRegistration = {
  id: 'M055-tool-shed-before-after-special-action',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase, 'after' as ActionHookPhase],
  actions: [...TRIGGER_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (usedThisRound(context)) return
    const actionId = otherAction(context.actionId)
    if (!actionId) return
    const flow = toolShedFlow(context, actionId)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => allImprovementCount(player) >= 2,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M055_ToolShed = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Tool Shed",
    deck: "M",
    number: 55,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Once per round, immediately before or after you take the __Slash and Burn__ or __Cut Peat__ special action, you can also take the respective other special action."
    ],
    cost: {
        "wood": 1,
        "clay": 1
    },
    vp: 1,
    prerequisite: "2 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M055_ToolShed_impl = M055_ToolShed.impl
