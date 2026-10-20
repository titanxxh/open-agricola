import type { ActionExecutionContext } from '../contract/types'
import { getListenerById, type MatchedCardListener } from '../cards/card-listeners'
import type { EngineInternals } from './engine-internals'
import type { EngineNode } from './types'
import { SequenceNode } from './nodes'
import { buildPhaseTrailingNodes, combineTrailingReactions } from './engine-utils'
import { primaryBodyCompleted, primaryBodyChildren } from './primary-body-nodes'
import { hasStartedDescendant } from './tree'
import { executeSpaceUsePhase } from './space-use-runtime'

export function preparePrimaryCompletions(int: EngineInternals): void {
  for (const scope of int.tree.allNodes()) {
    if (!(scope instanceof SequenceNode) || !scope.completion || scope.completion.bodyCompleted) continue
    const completion = scope.completion
    const body = int.tree.findNodeById(completion.bodyId)
    if (!body || !primaryBodyCompleted(body, scope.id)) continue
    completion.bodyCompleted = true
    const collect = (parent: EngineNode): void => {
      const children = primaryBodyChildren(parent)
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index]!
        if (child instanceof SequenceNode && child.completion) continue
        if (child.reactionPhase && child.getState() === 'ready' && !hasStartedDescendant(child)) {
          const gate = int.tree.findNodeById(child.reactionPhase === 'after' ? completion.afterId : completion.immediateId)
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

export function executeCompletionPhase(int: EngineInternals, gate: SequenceNode, context: ActionExecutionContext): void {
  const phase = gate.completionPhase
  const scope = phase && int.tree.findNodeById(phase.scopeId)
  if (!phase || !(scope instanceof SequenceNode) || !scope.completion) throw new Error('missing primary body completion scope')
  if (scope.completion.kind === 'space-use') {
    executeSpaceUsePhase(int, gate, context)
    return
  }
  const frame = scope.completion.frame
  const frozenRuleReactions = gate.children.splice(0)
  const matched: MatchedCardListener[] = []
  if (phase.phase === 'after') for (const source of frame.sources) {
    const registration = getListenerById(source.listenerId)
    if (!registration) continue
    if (source.ownerCardZone) matched.push({ registration, cardId: source.cardId,
      ownerPlayerId: source.ownerPlayerId, ownerCardZone: source.ownerCardZone })
    else matched.push({ registration, cardId: '', ownerPlayerId: '' })
  }
  const actionEvents = frame.terrainEvent ? [frame.terrainEvent] : []
  const moorReactions = buildPhaseTrailingNodes(int, matched, phase.phase, frame.actionId, context.state, {
    result: frame.result, actionEvents, transactionEvents: actionEvents,
    extraData: { payload: frame.payload, ...(frame.terrainCleared === false ? { terrainCleared: false } : {}) },
  }, frame.playerId, undefined, undefined, undefined, frame.triggerSnapshot)
  const nodes = combineTrailingReactions(int, [...frozenRuleReactions, ...moorReactions], context.state, frame.playerId)
  gate.resolve()
  if (nodes.length) int.tree.insertAfter(gate.id, nodes)
}
