import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class SequenceNode extends BaseNode {
  public children: EngineNode[]
  public anytimeActionId?: string

  constructor(id: string, children: EngineNode[]) {
    super(id, 'sequence')
    this.children = children
  }

  getState() {
    if (!this.anytimeActionId && this.children.every((child) => child.getState() === 'resolved')) {
      return 'resolved'
    }
    return this.nodeState
  }

  step(_ctx: EngineContext): NodeStepResult {
    if (this.children.every((c) => c.getState() === 'resolved')) {
      return { kind: 'done' }
    }
    return { kind: 'continue' }
  }

  protected cursorData() {
    return {
      childrenIds: this.children.map((c) => c.id),
      ...(this.anytimeActionId ? { anytimeActionId: this.anytimeActionId } : {}),
    }
  }
}
