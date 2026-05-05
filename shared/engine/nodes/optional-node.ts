import type { ActionChoiceOption, InteractionRequest } from '../../game/types'
import type { PromptKey } from '../../game/prompt-keys'
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'
import type { InteractionContextSnapshot } from './interaction-node'

export class OptionalNode extends BaseNode {
  public child: EngineNode
  public promptKey?: PromptKey
  public active = false
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest
  /** S4b PR5 — see {@link OrNode.pendingContextSnapshot}. */
  public pendingActionId?: string | null
  public pendingContextSnapshot?: InteractionContextSnapshot

  constructor(id: string, child: EngineNode, promptKey?: PromptKey) {
    super(id, 'optional')
    this.child = child
    this.promptKey = promptKey
  }

  getState() {
    if (this.nodeState === 'resolved') return 'resolved'
    if (this.active && this.child.getState() === 'resolved') {
      return 'resolved'
    }
    return this.nodeState
  }

  getArgs() {
    return { active: this.active }
  }

  resolve() {
    this.nodeState = 'resolved'
  }

  step(_ctx: EngineContext): NodeStepResult {
    if (this.getState() === 'resolved') return { kind: 'done' }
    if (this.active && this.child.getState() === 'resolved') return { kind: 'done' }
    return { kind: 'continue' }
  }

  protected cursorData() {
    return {
      childId: this.child.id,
      active: this.active,
      promptKey: this.promptKey,
      emittedChoices: this.emittedChoices,
      emittedPromptKey: this.emittedPromptKey,
      emittedPromptParams: this.emittedPromptParams,
      emittedRequest: this.emittedRequest,
      pendingActionId: this.pendingActionId,
      pendingContextSnapshot: this.pendingContextSnapshot,
    }
  }
}
