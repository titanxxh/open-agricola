import type { ActionExecutionContext, ActionExecutionResult } from '../contract/types'
import type { GameEvent } from '../contract/events'
import { getMatchingListeners } from '../cards/card-listeners'
import { createTriggerSnapshot } from '../cards/helpers/trigger-snapshot'
import { findActionSpaceById } from '../domain/space'
import type { EngineInternals } from './engine-internals'
import type { EngineNode } from './types'
import { ActionNode, SequenceNode } from './nodes'
import { buildPhaseTrailingNodes, combineTrailingReactions } from './engine-utils'
import { spaceUseBodyCompleted, spaceUseChildren } from './space-use-nodes'

export function captureSpaceUseEvents(int: EngineInternals, host: EngineNode, result: ActionExecutionResult, events: readonly GameEvent[] | undefined): void {
  if (!host.spaceUseBodyId || result.type !== 'ok') return
  const scope = int.tree.findNodeById(host.spaceUseBodyId)
  if (!(scope instanceof SequenceNode) || !scope.spaceUse) return
  scope.spaceUse.succeeded = true
  if (host instanceof ActionNode && typeof host.actionContext?.optionId === 'string') {
    scope.spaceUse.actionContext = { ...scope.spaceUse.actionContext, optionId: host.actionContext.optionId }
  }
  for (const event of events ?? []) {
    if (!scope.spaceUse.actionEvents.some(saved => saved.id === event.id)) scope.spaceUse.actionEvents.push(event)
  }
}

export function prepareSpaceUseCompletions(int: EngineInternals): void {
  for (const scope of int.tree.allNodes()) {
    if (!(scope instanceof SequenceNode) || !scope.spaceUse || scope.spaceUse.bodyCompleted) continue
    const use = scope.spaceUse
    const body = int.tree.findNodeById(use.bodyId)
    if (!body || !spaceUseBodyCompleted(body, scope.id)) continue
    use.bodyCompleted = true
    const collect = (parent: EngineNode): void => {
      const children = spaceUseChildren(parent)
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index]!
        if (child instanceof SequenceNode && child.spaceUse) continue
        if (child.reactionPhase && child.getState() === 'ready' && !child.getPending()) {
          const gate = int.tree.findNodeById(child.reactionPhase === 'after' ? use.afterId : use.immediateId)
          if (gate instanceof SequenceNode) {
            gate.children.unshift(child)
            children.splice(index, 1)
          }
        } else collect(child)
      }
    }
    collect(body)
  }
}

export function executeSpaceUsePhase(int: EngineInternals, gate: SequenceNode, context: ActionExecutionContext): void {
  const phase = gate.spaceUsePhase
  const scope = phase && int.tree.findNodeById(phase.scopeId)
  if (!phase || !(scope instanceof SequenceNode) || !scope.spaceUse) throw new Error('missing action space use scope')
  const use = scope.spaceUse
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
