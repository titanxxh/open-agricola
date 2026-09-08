import type { ActionChoiceOption, InteractionRequest } from '../../contract/types'
import type { PromptKey } from '../../contract/prompt-keys'
import type { EngineNode, EngineContext, NodeStepResult, InteractionContextSnapshot } from '../types'
import { BaseNode } from './base'

/**
 * S2 Task 8: composite emit nodes (Or/Xor/Optional) carry their own
 * pending-choice metadata when `Engine.proceed` has emitted a `'choice'`
 * step for them. The production pending surface is `BaseNode.pending`.
 */
export class OrNode extends BaseNode {
  public children: EngineNode[]
  public selectedChildId: string | null = null
  public promptKey?: PromptKey
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest
  /**
   * S4b PR5 — composite host node carries the pending-interaction context
   * snapshot when `Engine.proceed` emits a 'choice' for it. Mirrors
   * Composite host node carries the pending context snapshot when
   * `Engine.proceed` emits a choice. `pendingActionId` is null for
   * composite-hosted choices (the actual action runs on the chosen child
   * after resolveChoice).
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
      selectedChildId: this.selectedChildId,
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
