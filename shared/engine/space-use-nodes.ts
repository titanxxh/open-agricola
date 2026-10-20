import type { ActionContext, ActionSpaceUseContext, ActionExecutionContext } from '../contract/types'
import { ActionNode, OrNode, ParallelNode, SequenceNode, XorNode } from './nodes'
import type { EngineNode } from './types'

export const spaceUseChildren = (node: EngineNode): EngineNode[] =>
  node instanceof SequenceNode || node instanceof ParallelNode || node instanceof OrNode || node instanceof XorNode
    ? node.children : []

export function markSpaceUseBody(node: EngineNode, scopeId: string): void {
  node.spaceUseBodyId = scopeId
  if (node instanceof SequenceNode && node.spaceUse) return
  for (const child of spaceUseChildren(node)) markSpaceUseBody(child, scopeId)
}

export function inheritSpaceUseBody(host: EngineNode, ...nodes: EngineNode[]): void {
  if (!host.spaceUseBodyId) return
  for (const node of nodes) markSpaceUseBody(node, host.spaceUseBodyId)
}

export function wrapSpaceUse(
  id: string,
  body: EngineNode,
  spaceId: string,
  use: ActionSpaceUseContext,
  playerId?: string,
  actionContext?: ActionContext,
  completePlacement = false,
): SequenceNode {
  const bodyRoot = new SequenceNode(`${id}-body`, [body])
  const immediate = new SequenceNode(`${id}-immediatelyAfter`, [])
  const after = new SequenceNode(`${id}-after`, [])
  immediate.spaceUsePhase = { scopeId: id, phase: 'immediatelyAfter' }
  after.spaceUsePhase = { scopeId: id, phase: 'after' }
  const scope = new SequenceNode(id, [bodyRoot, immediate, after])
  scope.ownerPlayerId = playerId
  scope.spaceUse = {
    spaceId, playerId, use, actionContext, completePlacement, sourceCard: body instanceof ActionNode ? body.sourceCard : undefined,
    bodyId: bodyRoot.id,
    immediateId: immediate.id, afterId: after.id,
    bodyCompleted: false, succeeded: false, actionEvents: [],
  }
  markSpaceUseBody(bodyRoot, id)
  if (body instanceof ActionNode) body.actionSpaceUse = use
  return scope
}

export function spaceUseBodyCompleted(node: EngineNode, scopeId: string): boolean {
  if (node.spaceUseBodyId === scopeId) {
    if (node instanceof SequenceNode && node.spaceUse) return node.getState() === 'resolved'
    if (node instanceof OrNode) return node.getState() === 'resolved'
    if (node instanceof XorNode) {
      if (node.getState() === 'resolved') return true
      const selected = node.children.find(child => child.id === node.selectedChildId)
      return selected !== undefined && spaceUseBodyCompleted(selected, scopeId)
    }
    if (node instanceof ActionNode) return node.getState() === 'resolved'
    if (node.getPending() || node.optional && !node.optionalActive && node.getState() !== 'resolved') return false
  }
  return spaceUseChildren(node).every(child => spaceUseBodyCompleted(child, scopeId))
}

export function actionSpaceQueryContext(node: EngineNode, actionId?: string): Pick<ActionExecutionContext, 'actionSpaceUse'> {
  const effectiveId = actionId ?? (node instanceof ActionNode ? node.resolvedReplacement?.actionId ?? node.actionId : undefined)
  return { actionSpaceUse: node instanceof ActionNode && effectiveId === node.actionId ? node.actionSpaceUse : undefined }
}
