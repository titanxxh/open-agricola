import type { ActionExecutionContext, ActionExecutionResult } from '../contract/types'
import type { GameEvent } from '../contract/events'
import { getMatchingListeners } from '../cards/card-listeners'
import { createTriggerSnapshot } from '../cards/helpers/trigger-snapshot'
import { findActionSpaceById } from '../domain/space'
import type { EngineInternals } from './engine-internals'
import type { EngineNode } from './types'
import { ActionNode, SequenceNode } from './nodes'
import { buildPhaseTrailingNodes, combineTrailingReactions } from './engine-utils'

export function captureSpaceUseEvents(int: EngineInternals, host: EngineNode, result: ActionExecutionResult, events: readonly GameEvent[] | undefined): void {
  if (!host.primaryBodyId || result.type !== 'ok') return
  const scope = int.tree.findNodeById(host.primaryBodyId)
  if (!(scope instanceof SequenceNode) || scope.completion?.kind !== 'space-use') return
  scope.completion.succeeded = true
  if (host instanceof ActionNode && typeof host.actionContext?.optionId === 'string') {
    scope.completion.actionContext = { ...scope.completion.actionContext, optionId: host.actionContext.optionId }
  }
  for (const event of events ?? []) {
    if (!scope.completion.actionEvents.some(saved => saved.id === event.id)) scope.completion.actionEvents.push(event)
  }
}

export function executeSpaceUsePhase(int: EngineInternals, gate: SequenceNode, context: ActionExecutionContext): void {
  const phase = gate.completionPhase
  const scope = phase && int.tree.findNodeById(phase.scopeId)
  if (!phase || !(scope instanceof SequenceNode) || scope.completion?.kind !== 'space-use') throw new Error('missing action space use scope')
  const use = scope.completion
  const space = findActionSpaceById(context.state, use.spaceId)
  const player = context.state.players.find(candidate => candidate.id === use.playerId) ?? context.player
  const frozenRuleReactions = gate.children.splice(0)
  let nodes = frozenRuleReactions
  if (space && use.succeeded) {
    const listenerContext = {
      actionHooks: int.hooks.actionHooks, state: context.state, player, space,
      actionId: space.id, actionSpaceUse: use.use, phase: phase.phase,
      sourceCard: use.sourceCard,
      actionContext: { ...(use.use.personUse ? { placedWorkerId: use.use.personUse.workerId } : {}), ...use.actionContext, targetSpaceId: space.id },
      actionEvents: use.actionEvents, transactionEvents: use.actionEvents,
      result: { type: 'ok' as const, personUse: use.use.personUse },
    }
    const spaceNodes = buildPhaseTrailingNodes(int, getMatchingListeners(listenerContext), phase.phase, space.id, context.state,
      { actionSpaceUse: use.use, sourceCard: use.sourceCard, actionContext: listenerContext.actionContext, result: listenerContext.result }, player.id,
      use.actionEvents, use.actionEvents, undefined, createTriggerSnapshot(context.state))
    const placementNodes: EngineNode[] = []
    if (phase.phase === 'after' && use.completePlacement) {
      const placementContext = { ...listenerContext, actionId: 'place-farmer', actionSpaceUse: undefined }
      const matched = getMatchingListeners(placementContext)
        .filter(entry => entry.registration.actions?.includes('place-farmer'))
      placementNodes.push(...buildPhaseTrailingNodes(int, matched, 'after', 'place-farmer', context.state,
        { sourceCard: use.sourceCard, actionContext: placementContext.actionContext, result: placementContext.result }, player.id,
        use.actionEvents, use.actionEvents, undefined, createTriggerSnapshot(context.state)))
    }
    nodes = combineTrailingReactions(int, [...frozenRuleReactions, ...spaceNodes, ...placementNodes], context.state, player.id)
  }
  gate.resolve()
  if (nodes.length) int.tree.insertAfter(gate.id, nodes)
}
