import type {
  ActionChoiceOption,
  ActionExecutionContext,
  InteractionRequest,
} from '../../game/types'
import type { PromptKey } from '../../game/prompt-keys'
import type { EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

/**
 * Pending-interaction context snapshot — mirrors the legacy engine-private
 * `pendingInteractionContext` shape so call sites can shallow-merge / persist
 * the same record on the InteractionNode itself. Owned by the node post-PR3
 * (S4b Task 11); the engine keeps a redundant top-level mirror field for
 * back-compat with `snapshot()` consumers and external test hooks.
 */
export type InteractionContextSnapshot = Pick<
  ActionExecutionContext,
  'params' | 'costs' | 'sourceCard' | 'actionContext'
>

export class InteractionNode extends BaseNode {
  public choices: ActionChoiceOption[]
  public promptKey?: PromptKey
  /**
   * Optional i18n params passed alongside `promptKey`. Lifted out of the
   * legacy `this.pending` field (Task 10) so the InteractionNode is now the
   * canonical owner of all prompt-related metadata. Cursor round-trip does
   * NOT persist this field today (snapshot.choiceData omits it); restored
   * sessions surface `undefined` until the next ChoiceNode emits a fresh value.
   */
  public promptParams?: Record<string, unknown>
  public request?: InteractionRequest

  /**
   * S4b Task 11 — pending-interaction state fields absorbed from engine.ts.
   * These mirror the legacy engine-private `pendingInteractionActionId /
   * pendingInteractionOwnerNodeId / pendingInteractionContext` fields. The
   * node is now the authoritative owner; engine keeps redundant top-level
   * fields only to preserve the public `snapshot()` shape and the
   * `getPendingInteractionContext()` / external mutation hook used by
   * stats-gained-pseudo-session.test.ts.
   */
  public pendingActionId?: string
  public ownerNodeId?: string
  public contextSnapshot?: InteractionContextSnapshot
  /**
   * S4b Task 11 — replaces the engine-level `lastEmittedChoice` cache that
   * pre-Task-8 held composite emit metadata. Kept on InteractionNode for
   * leaf-paired interactions (composite Or/Xor/Optional already moved to
   * `emittedChoices` per S2 Task 8).
   */
  public lastEmittedChoices?: ActionChoiceOption[]

  constructor(id: string, choices: ActionChoiceOption[], request?: InteractionRequest) {
    super(id, 'interaction')
    this.choices = choices
    this.request = request
  }

  setChoice(
    promptKey: PromptKey | undefined,
    choices: ActionChoiceOption[],
    promptParams?: Record<string, unknown>,
  ) {
    this.promptKey = promptKey
    this.choices = choices
    this.promptParams = promptParams
    this.lastEmittedChoices = choices
    this.nodeState = 'ready'
  }

  resolve(choice: string) {
    if (!this.choices.some((item) => item.value === choice)) {
      this.block()
      return
    }
    this.nodeState = 'resolved'
  }

  /**
   * S4b Task 14 — InteractionNode owns its lifecycle. `done` when already
   * resolved, `blocked` when validateSelection rejects (handled by
   * resolve()), otherwise emit a `choice` step result for the engine main
   * loop to surface.
   */
  step(_ctx: EngineContext): NodeStepResult {
    if (this.getState() === 'resolved') return { kind: 'done' }
    if (this.choices.length === 0) return { kind: 'blocked', reason: 'no choices' }
    return { kind: 'choice', nodeId: this.id }
  }

  /**
   * S4b Task 14 — validate a player-submitted choice value against the
   * node's currently-emitted choices. Mirrors the existing `resolve()` guard
   * but exposes the predicate without mutating state.
   */
  validateSelection(value: string): boolean {
    return this.choices.some((c) => c.value === value)
  }

  protected cursorData() {
    return {
      choices: this.choices,
      promptKey: this.promptKey,
      promptParams: this.promptParams,
      request: this.request,
      pendingActionId: this.pendingActionId,
      ownerNodeId: this.ownerNodeId,
      contextSnapshot: this.contextSnapshot,
      lastEmittedChoices: this.lastEmittedChoices,
    }
  }
}
