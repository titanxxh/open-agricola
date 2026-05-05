import type { ActionChoiceOption, InteractionRequest } from '../../game/types'
import type { PromptKey } from '../../game/prompt-keys'
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class XorNode extends BaseNode {
  public children: EngineNode[]
  public promptKey?: PromptKey
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest

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
    }
  }
}
