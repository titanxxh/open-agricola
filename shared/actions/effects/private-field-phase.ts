import type { ActionDefinition, ActionFlow } from '../../contract/types'
import { reap, type ReapTrigger } from './reap'
import { hasAnyCardFieldCrops, reapAllCardFields } from '../../cards/helpers/card-field'
import { fieldIsEmpty } from '../../domain/field'

const appendFlowChildren = (children: ActionFlow[], flow: ActionFlow | undefined) => {
  if (!flow) return
  if (flow.type === 'parallel') {
    children.push(...flow.children)
    return
  }
  children.push(flow)
}

export const privateFieldPhaseAction: ActionDefinition = {
  id: 'private-field-phase',
  nameKey: 'actions.private-field-phase.name',
  descriptionKey: 'actions.private-field-phase.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) =>
    player.fields.some((field) => !fieldIsEmpty(field)) || hasAnyCardFieldCrops(player),
  execute: ({ state, player, sourceCard, eventSink }) => {
    if (!privateFieldPhaseAction.canBeExecutedByPlayer(state, player)) {
      return { type: 'fail', errorKey: 'log.action' }
    }
    const trigger: ReapTrigger = {
      phase: 'private-field-phase',
      ...(sourceCard ? { cardId: sourceCard } : {}),
    }
    const result = reap(state, player, eventSink, { trigger, sourceCard })
    const reactionChildren: ActionFlow[] = []
    appendFlowChildren(reactionChildren, result.reactionFlow)
    appendFlowChildren(
      reactionChildren,
      reapAllCardFields(state, player, {
        trigger,
        sourceCard,
        eventSink,
        updateHarvestSummary: false,
      }),
    )
    if (reactionChildren.length > 0) {
      return { type: 'flow', flow: { type: 'parallel', children: reactionChildren } }
    }
    return {
      type: 'ok',
      resourcesGained: result.reapSummary.resources,
      extraData: { reapSummary: result.reapSummary },
    }
  },
}
