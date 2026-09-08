import type { PromptKey } from '../../contract/prompt-keys'
import type {
  EngineNode,
  EngineNodeType,
  NodeState,
  NodeCursor,
  NodeStepResult,
  EngineContext,
  PendingEnvelope,
} from '../types'

export abstract class BaseNode implements EngineNode {
  public id: string
  public type: EngineNodeType
  public choiceLabelKey?: string
  public choiceLabelParams?: Record<string, unknown>
  public ownerPlayerId?: string
  public optional?: boolean
  public optionalActive?: boolean
  public optionalPromptKey?: PromptKey
  public mandatory?: boolean
  public beforeAnytimeAvailable?: boolean
  public pending?: PendingEnvelope | null
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

  setPending(envelope: PendingEnvelope): void {
    this.pending = envelope
  }

  clearPending(): void {
    this.pending = null
  }

  getPending(): PendingEnvelope | null {
    return this.pending ?? null
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
      data: {
        ...this.cursorData(),
        ...this.sharedCursorData(),
      },
    }
  }

  private sharedCursorData(): Record<string, unknown> {
    const data: Record<string, unknown> = {}
    if (this.ownerPlayerId !== undefined) data.ownerPlayerId = this.ownerPlayerId
    if (this.choiceLabelKey !== undefined) data.choiceLabelKey = this.choiceLabelKey
    if (this.choiceLabelParams !== undefined) data.choiceLabelParams = this.choiceLabelParams
    if (this.optional !== undefined) data.optional = this.optional
    if (this.optionalActive !== undefined) data.optionalActive = this.optionalActive
    if (this.optionalPromptKey !== undefined) data.optionalPromptKey = this.optionalPromptKey
    if (this.beforeAnytimeAvailable !== undefined) data.beforeAnytimeAvailable = this.beforeAnytimeAvailable
    if (this.mandatory !== undefined) data.mandatory = this.mandatory
    if (this.pending !== undefined && this.pending !== null) data.pending = this.pending
    return data
  }

  protected cursorData(): Record<string, unknown> {
    return {}
  }
}
