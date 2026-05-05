import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class ParallelNode extends BaseNode {
  public children: EngineNode[]

  constructor(id: string, children: EngineNode[]) {
    super(id, 'parallel')
    this.children = children
  }

  resolve(policy: 'all' | 'any' = 'all') {
    if (policy === 'any') {
      this.nodeState = 'resolved'
      return
    }
    if (this.children.every((child) => child.getState() === 'resolved')) {
      this.nodeState = 'resolved'
    }
  }

  step(_ctx: EngineContext): NodeStepResult {
    if (this.children.every((c) => c.getState() === 'resolved')) {
      return { kind: 'done' }
    }
    return { kind: 'continue' }
  }

  protected cursorData() {
    return { childrenIds: this.children.map((c) => c.id) }
  }
}
