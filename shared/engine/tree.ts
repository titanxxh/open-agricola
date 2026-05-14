import type { EngineNode } from './types'
import { OrNode, ParallelNode, SequenceNode, XorNode } from './nodes'
import { ParallelTriggerNode } from './nodes/parallel-trigger-node'
import { isActivateCardActionNode } from './activation-action'

const isCompositeNode = (node: EngineNode) =>
  node instanceof SequenceNode ||
  node instanceof ParallelNode ||
  node instanceof OrNode ||
  node instanceof XorNode

const hasStartedDescendant = (node: EngineNode): boolean => {
  if (node instanceof SequenceNode || node instanceof ParallelNode || node instanceof OrNode || node instanceof XorNode) {
    return node.children.some((child) =>
      child.getState() === 'resolved' || hasStartedDescendant(child),
    )
  }
  return node.getState() === 'resolved'
}

export class EngineTree {
  public root: EngineNode

  constructor(root: EngineNode) {
    this.root = root
  }

  findNodeById(id: string) {
    const visit = (node: EngineNode): EngineNode | null => {
      if (node.id === id) return node
      if (node instanceof ParallelTriggerNode) {
        for (const child of node.children) {
          const found = visit(child)
          if (found) return found
        }
        return null
      }
      if (isCompositeNode(node)) {
        const composite = node as SequenceNode | ParallelNode | OrNode | XorNode
        for (const child of composite.children) {
          const found = visit(child)
          if (found) return found
        }
      }
      return null
    }
    return visit(this.root)
  }

  findParent(id: string) {
    const found = this.findNodeWithParent(id, this.root)
    return found?.parent ?? null
  }

  allNodes() {
    const nodes: EngineNode[] = []
    const visit = (node: EngineNode) => {
      nodes.push(node)
      if (node instanceof ParallelTriggerNode) {
        node.children.forEach((child) => visit(child))
        return
      }
      if (isCompositeNode(node)) {
        const composite = node as SequenceNode | ParallelNode | OrNode | XorNode
        composite.children.forEach((child) => visit(child))
      }
    }
    visit(this.root)
    return nodes
  }

  insertBefore(nodeId: string, nodes: EngineNode[]): boolean {
    if (nodes.length === 0) return false
    if (this.root.id === nodeId) {
      this.root = new SequenceNode(`pre-${nodeId}`, [...nodes, this.root])
      return true
    }
    const found = this.findNodeWithParent(nodeId, this.root)
    if (!found) return false
    const { parent, index } = found
    if (parent instanceof SequenceNode || parent instanceof ParallelNode) {
      parent.children.splice(index, 0, ...nodes)
      return true
    }
    if (parent instanceof ParallelTriggerNode) {
      return this.insertBefore(parent.id, nodes)
    }
    const replacement = new SequenceNode(`pre-${nodeId}`, [...nodes, found.node])
    if (parent instanceof OrNode || parent instanceof XorNode) {
      parent.children[index] = replacement
      return true
    }
    return false
  }

  insertAfter(nodeId: string, nodes: EngineNode[]): boolean {
    if (nodes.length === 0) return false
    if (this.root.id === nodeId) {
      this.root = new SequenceNode(`chain-${nodeId}`, [this.root, ...nodes])
      return true
    }
    const found = this.findNodeWithParent(nodeId, this.root)
    if (!found) return false
    const { parent, index, node } = found
    if (parent instanceof SequenceNode || parent instanceof ParallelNode) {
      parent.children.splice(index + 1, 0, ...nodes)
      return true
    }
    if (parent instanceof ParallelTriggerNode) {
      // Insert flow follow-ups INSIDE the ParallelTriggerNode right after the
      // activated listener leaf. nextUnresolved walks selectedChild + its
      // follow-ups before returning to PARALLEL for the next card prompt.
      parent.children.splice(index + 1, 0, ...nodes)
      return true
    }
    const replacement = new SequenceNode(`chain-${node.id}`, [node, ...nodes])
    if (parent instanceof OrNode || parent instanceof XorNode) {
      parent.children[index] = replacement
      return true
    }
    return false
  }

  private findNodeWithParent(
    targetId: string,
    node: EngineNode,
  ): { node: EngineNode; parent: EngineNode; index: number } | null {
    if (node instanceof ParallelTriggerNode) {
      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index]
        if (child.id === targetId) {
          return { node: child, parent: node, index }
        }
        const found = this.findNodeWithParent(targetId, child)
        if (found) return found
      }
      return null
    }
    if (isCompositeNode(node)) {
      const composite = node as SequenceNode | ParallelNode | OrNode | XorNode
      for (let index = 0; index < composite.children.length; index += 1) {
        const child = composite.children[index]
        if (child.id === targetId) {
          return { node: child, parent: node, index }
        }
        const found = this.findNodeWithParent(targetId, child)
        if (found) return found
      }
    }
    return null
  }

  nextUnresolved() {
    const visit = (node: EngineNode): EngineNode | null => {
      if (node.getState() === 'blocked') {
        return null
      }
      if (node.getPending() !== null) {
        return node
      }
      if (node.optional === true && node.optionalActive === false) {
        return node.getState() === 'resolved' ? null : node
      }
      if (node instanceof ParallelTriggerNode) {
        if (node.getState() === 'resolved') return null
        if (node.selectedChildId) {
          const idx = node.children.findIndex((c) => c.id === node.selectedChildId)
          if (idx >= 0) {
            // Visit the selected card AND any follow-up flow nodes inserted
            // after it, until the next activation leaf (next card option) or
            // end of children. This makes the selected trigger's flow finish
            // BEFORE the engine returns to PARALLEL to prompt the next card.
            for (let i = idx; i < node.children.length; i += 1) {
              const child = node.children[i]
              if (i > idx && isActivateCardActionNode(child)) break
              if (child.getState() !== 'resolved') {
                const next = visit(child)
                if (next) return next
              }
            }
          }
        }
        const hasUnresolvedCard = node.children.some(
          (c) => isActivateCardActionNode(c) && c.getState() !== 'resolved',
        )
        if (hasUnresolvedCard) return node
        // All cards picked; drain any trailing follow-up nodes.
        for (const child of node.children) {
          if (child.getState() !== 'resolved') {
            const next = visit(child)
            if (next) return next
          }
        }
        if (node.getState() !== 'resolved') node.resolve()
        return null
      }
      if (node instanceof OrNode || node instanceof XorNode) {
        for (const child of node.children) {
          if (child.getState() === 'resolved' || !hasStartedDescendant(child)) {
            continue
          }
          const next = visit(child)
          if (next) return next
        }
        if (node.getState() === 'ready') {
          return node
        }
        return null
      }
      if (isCompositeNode(node)) {
        const composite = node as SequenceNode | ParallelNode
        for (const child of composite.children) {
          const next = visit(child)
          if (next) return next
        }
        if (composite.getState() === 'resolved') {
          composite.resolve()
        }
        return null
      }
      if (node.getState() === 'ready') {
        return node
      }
      return null
    }
    return visit(this.root)
  }
}
