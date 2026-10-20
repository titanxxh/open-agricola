import { ActionNode, OrNode, ParallelNode, SequenceNode, XorNode } from './nodes'
import type { EngineNode } from './types'
import type { CompletionDomain } from './completion-types'

export const primaryBodyChildren = (node: EngineNode): EngineNode[] =>
  node instanceof SequenceNode || node instanceof ParallelNode || node instanceof OrNode || node instanceof XorNode
    ? node.children : []

export function markPrimaryBody(node: EngineNode, scopeId: string): void {
  node.primaryBodyId = scopeId
  if (node instanceof SequenceNode && node.completion) return
  for (const child of primaryBodyChildren(node)) markPrimaryBody(child, scopeId)
}

export function inheritPrimaryBody(host: EngineNode, ...nodes: EngineNode[]): void {
  if (!host.primaryBodyId) return
  for (const node of nodes) markPrimaryBody(node, host.primaryBodyId)
}

export function wrapPrimaryBody(
  id: string, body: EngineNode,
  frame: CompletionDomain,
  playerId?: string,
): SequenceNode {
  const bodyRoot = new SequenceNode(`${id}-body`, [body])
  const immediate = new SequenceNode(`${id}-immediatelyAfter`, [])
  const after = new SequenceNode(`${id}-after`, [])
  immediate.completionPhase = { scopeId: id, phase: 'immediatelyAfter' }
  after.completionPhase = { scopeId: id, phase: 'after' }
  const scope = new SequenceNode(id, [bodyRoot, immediate, after])
  scope.ownerPlayerId = playerId
  scope.completion = { ...frame, bodyId: bodyRoot.id, immediateId: immediate.id, afterId: after.id, bodyCompleted: false }
  markPrimaryBody(bodyRoot, id)
  return scope
}

export function primaryBodyCompleted(node: EngineNode, scopeId: string): boolean {
  if (node.primaryBodyId === scopeId) {
    if (node instanceof SequenceNode && node.completion) return node.getState() === 'resolved'
    if (node instanceof OrNode) return node.getState() === 'resolved'
    if (node instanceof XorNode) {
      if (node.getState() === 'resolved') return true
      const selected = node.children.find(child => child.id === node.selectedChildId)
      return selected !== undefined && primaryBodyCompleted(selected, scopeId)
    }
    if (node instanceof ActionNode) return node.getState() === 'resolved'
    if (node.getPending() || node.optional && !node.optionalActive && node.getState() !== 'resolved') return false
  }
  return primaryBodyChildren(node).every(child => primaryBodyCompleted(child, scopeId))
}
