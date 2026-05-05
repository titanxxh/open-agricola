import type { EngineNode, EngineNodeType, NodeState, NodeCursor, NodeStepResult, EngineContext } from '../types'

export abstract class BaseNode implements EngineNode {
  public id: string
  public type: EngineNodeType
  public choiceLabelKey?: string
  public choiceLabelParams?: Record<string, unknown>
  protected nodeState: NodeState

  protected constructor(id: string, type: EngineNodeType) {
    this.id = id
    this.type = type
    this.nodeState = 'ready'
  }

  getState(): NodeState {
    return this.nodeState
  }

  getArgs(): Record<string, unknown> {
    return {}
  }

  resolve(_result?: unknown): void {
    this.nodeState = 'resolved'
  }

  block(): void {
    this.nodeState = 'blocked'
  }

  setState(state: NodeState): void {
    this.nodeState = state
  }

  isResolved(): boolean {
    return this.nodeState === 'resolved'
  }

  isDoable(): boolean {
    return true
  }

  step(_ctx: EngineContext): NodeStepResult {
    return { kind: 'done' }
  }

  toCursor(): NodeCursor {
    return {
      type: this.type,
      id: this.id,
      state: this.nodeState,
      data: this.cursorData(),
    }
  }

  protected cursorData(): Record<string, unknown> {
    return {}
  }
}
