import type { ActionChoiceOption, InteractionRequest } from '../../contract/types'
import type { PromptKey } from '../../contract/prompt-keys'
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'
import type { InteractionContextSnapshot } from './interaction-node'

export class XorNode extends BaseNode {
  public children: EngineNode[]
  public promptKey?: PromptKey
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest
  /** S4b PR5 — see {@link OrNode.pendingContextSnapshot}. */
  public pendingActionId?: string | null
  public pendingContextSnapshot?: InteractionContextSnapshot

  constructor(id: string, children: EngineNode[], promptKey?: PromptKey) {
    super(id, 'xor')
    this.children = children
    this.promptKey = promptKey
  }

  step(_ctx: EngineContext): NodeStepResult {
    const resolved = this.children.filter((c) => c.getState() === 'resolved').length
    if (resolved >= 1) return { kind: 'done' }
    return { kind: 'continue' }
  }

  protected cursorData() {
    return {
      childrenIds: this.children.map((c) => c.id),
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
