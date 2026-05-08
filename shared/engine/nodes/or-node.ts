import type { ActionChoiceOption, InteractionRequest } from '../../contract/types'
import type { PromptKey } from '../../game/prompt-keys'
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'
import type { InteractionContextSnapshot } from './interaction-node'

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
  /**
   * S4b PR5 — composite host node carries the pending-interaction context
   * snapshot when `Engine.proceed` emits a 'choice' for it. Mirrors
   * InteractionNode.contextSnapshot semantics so external consumers can read
   * `peekInteractionHost()?.pendingContextSnapshot` uniformly without
   * dispatching on node type. `pendingActionId` is null for composite-hosted
   * choices (the actual action runs on the chosen child after resolveChoice).
   */
  public pendingActionId?: string | null
  public pendingContextSnapshot?: InteractionContextSnapshot

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
      pendingActionId: this.pendingActionId,
      pendingContextSnapshot: this.pendingContextSnapshot,
    }
  }
}
