import type { EngineNode } from './types'
import { OptionalNode, OrNode, ParallelNode, SequenceNode, XorNode } from './nodes'

const isCompositeNode = (node: EngineNode) =>
  node instanceof SequenceNode ||
  node instanceof ParallelNode ||
  node instanceof OrNode ||
  node instanceof XorNode ||
  node instanceof OptionalNode

export class EngineTree {
  public root: EngineNode

  constructor(root: EngineNode) {
    this.root = root
  }

  findNodeById(id: string) {
    const visit = (node: EngineNode): EngineNode | null => {
      if (node.id === id) return node
      if (isCompositeNode(node)) {
        if (node instanceof OptionalNode) {
          const found = visit(node.child)
          if (found) return found
        } else {
          const composite = node as SequenceNode | ParallelNode | OrNode | XorNode
          for (const child of composite.children) {
            const found = visit(child)
            if (found) return found
          }
        }
      }
      return null
    }
    return visit(this.root)
  }

  allNodes() {
    const nodes: EngineNode[] = []
    const visit = (node: EngineNode) => {
      nodes.push(node)
      if (isCompositeNode(node)) {
        if (node instanceof OptionalNode) {
          visit(node.child)
        } else {
          const composite = node as SequenceNode | ParallelNode | OrNode | XorNode
          composite.children.forEach((child) => visit(child))
        }
      }
    }
    visit(this.root)
    return nodes
  }

  insertAfter(nodeId: string, nodes: EngineNode[]) {
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
    const replacement = new SequenceNode(`chain-${node.id}`, [node, ...nodes])
    this.root = replacement
    return true
  }

  private findNodeWithParent(
    targetId: string,
    node: EngineNode,
  ): { node: EngineNode; parent: EngineNode; index: number } | null {
    if (isCompositeNode(node)) {
      if (node instanceof OptionalNode) {
        const child = node.child
        if (child.id === targetId) {
          return { node: child, parent: node, index: 0 }
        }
        const found = this.findNodeWithParent(targetId, child)
        if (found) return found
      } else {
        const composite = node as SequenceNode | ParallelNode
        for (let index = 0; index < composite.children.length; index += 1) {
          const child = composite.children[index]
          if (child.id === targetId) {
            return { node: child, parent: node, index }
          }
          const found = this.findNodeWithParent(targetId, child)
          if (found) return found
        }
      }
    }
    return null
  }

  nextUnresolved() {
    const visit = (node: EngineNode): EngineNode | null => {
      if (node.getState() === 'blocked') {
        return null
      }
      if (node instanceof OrNode || node instanceof XorNode) {
        if (node.getState() === 'ready') {
          return node
        }
        return null
      }
      if (node instanceof OptionalNode) {
        if (node.getState() === 'resolved') {
          return null
        }
        if (!node.active) {
          return node
        }
        const next = visit(node.child)
        if (next) return next
        if (node.getState() === 'resolved') {
          node.resolve()
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
