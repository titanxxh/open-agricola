import type { ActionChoiceOption, InteractionRequest } from '../../game/types'
import type { PromptKey } from '../../game/prompt-keys'
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

/**
 * S2 Task 8: composite emit nodes (Or/Xor/Optional) carry their own
 * pending-choice metadata (`emittedChoices`, `emittedPromptKey`,
 * `emittedRequest`) when `Engine.proceed` has emitted a `'choice'` step
 * for them. This replaces the engine-level `lastEmittedChoice` cache and
 * makes `Engine.peekInteractionHost` able to surface the same shape
 * regardless of whether the pending node is a leaf-paired
 * `InteractionNode` or one of the composite nodes below.
 */
export class OrNode extends BaseNode {
  public children: EngineNode[]
  public promptKey?: PromptKey
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest

  constructor(id: string, children: EngineNode[], promptKey?: PromptKey) {
    super(id, 'or')
    this.children = children
    this.promptKey = promptKey
  }

  step(_ctx: EngineContext): NodeStepResult {
    if (this.children.some((c) => c.getState() === 'resolved')) {
      return { kind: 'done' }
    }
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
