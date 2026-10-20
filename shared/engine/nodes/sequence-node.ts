import type { AnytimeActivation } from '../../contract/anytime-activation'
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'
import type { SpaceUseState, SpaceUsePhase } from '../space-use-types'

export class SequenceNode extends BaseNode {
  public children: EngineNode[]
  public anytimeActionId?: string
  public anytimeActivation?: AnytimeActivation
  public spaceUse?: SpaceUseState
  public spaceUsePhase?: SpaceUsePhase

  constructor(id: string, children: EngineNode[]) {
    super(id, 'sequence')
    this.children = children
  }

  getState() {
    if (!this.anytimeActionId && !this.spaceUsePhase && this.children.every((child) => child.getState() === 'resolved')) {
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
      ...(this.anytimeActivation ? { anytimeActivation: this.anytimeActivation } : {}),
      ...(this.spaceUse ? { spaceUse: this.spaceUse } : {}),
      ...(this.spaceUsePhase ? { spaceUsePhase: this.spaceUsePhase } : {}),
    }
  }
}
