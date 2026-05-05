import type { EngineNode } from '../types'
import { BaseNode } from './base'

export class SequenceNode extends BaseNode {
  public children: EngineNode[]

  constructor(id: string, children: EngineNode[]) {
    super(id, 'sequence')
    this.children = children
  }

  getState() {
    if (this.children.every((child) => child.getState() === 'resolved')) {
      return 'resolved'
    }
    return this.nodeState
  }
}
