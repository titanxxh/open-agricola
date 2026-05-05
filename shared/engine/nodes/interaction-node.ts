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

/**
 * Inspect a list of `ActionChoiceOption` and derive a single sourceCard
 * iff every option declares the same non-empty value. Used as the fallback
 * for emit/resolveChoiceSourceCard when no explicit sourceCard was passed.
 * Pure function — no `this` access.
 */
export function getOptionsSourceCard(options: ActionChoiceOption[]): string | undefined {
  if (options.length === 0) return undefined
  const normalized = options.map((option) =>
    typeof option.sourceCard === 'string' && option.sourceCard.length > 0
      ? option.sourceCard
      : null,
  )
  if (normalized.some((sourceCard) => sourceCard === null)) return undefined
  const sourceCards = [...new Set(normalized)] as string[]
  return sourceCards.length === 1 ? sourceCards[0] : undefined
}

/**
 * Resolve the effective sourceCard for a freshly-emitted choice: explicit
 * argument wins; otherwise fall back to the single uniform option-derived
 * sourceCard (if any). Pure function — no `this` access. Shared between
 * `InteractionNode.emit()` and the fallback (no-targetNode) wiring path
 * still living on `Engine`.
 */
export function resolveChoiceSourceCard(
  sourceCard: string | undefined,
  options: ActionChoiceOption[],
): string | undefined {
  return sourceCard ?? getOptionsSourceCard(options)
}

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
    this.nodeState = 'ready'
  }

  /**
   * S4b Task 12 — absorbed from `Engine.applyInteractionRequest`. Wires up
   * this InteractionNode for a freshly-emitted interaction request:
   *
   *   - calls `setChoice(promptKey, choiceOptions, promptParams)` so the node
   *     surfaces the prompt + options
   *   - sets `this.request` to the InteractionRequest payload
   *   - records `pendingActionId` (always) and `ownerNodeId` (unless
   *     `preserveOwner` is true — used by the resolveChoice second-pass that
   *     keeps the existing XorNode owner pointer)
   *   - shallow-merges `contextWritePatch` into `actionContext` (mirrors the
   *     ActionDef-declared `result.extraData.actionContextWrite` patch flow)
   *   - resolves `sourceCard` via the static `resolveChoiceSourceCard`
   *     fallback (option-derived single sourceCard if not explicit)
   *
   * The engine still owns the top-level `pendingInteractionContext` /
   * `pendingInteractionNodeId` mirror fields for `snapshot()` /
   * `getPendingInteractionContext()` back-compat — it copies the returned
   * `contextSnapshot` into those fields after calling `emit`.
   */
  emit(args: {
    request: InteractionRequest
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    choiceOptions: ActionChoiceOption[]
    actionId: string
    ownerNodeId: string | null
    params: ActionExecutionContext['params']
    costs: ActionExecutionContext['costs']
    sourceCard: string | undefined
    actionContext: Record<string, unknown> | undefined
    contextWritePatch?: Record<string, unknown>
    preserveOwner?: boolean
  }): InteractionContextSnapshot {
    const { request, promptKey, promptParams, choiceOptions, actionId, ownerNodeId } = args
    this.setChoice(promptKey, choiceOptions, promptParams)
    this.request = request
    this.pendingActionId = actionId
    if (!args.preserveOwner) {
      this.ownerNodeId = ownerNodeId ?? undefined
    }
    const mergedActionContext = args.contextWritePatch
      ? { ...(args.actionContext ?? {}), ...args.contextWritePatch }
      : args.actionContext
    const ctxSnapshot: InteractionContextSnapshot = {
      params: args.params,
      costs: args.costs,
      sourceCard: resolveChoiceSourceCard(args.sourceCard, choiceOptions),
      actionContext: mergedActionContext,
    }
    this.contextSnapshot = ctxSnapshot
    return ctxSnapshot
  }

  resolve(choice: string) {
    if (!this.choices.some((item) => item.value === choice)) {
      this.block()
      return
    }
    this.nodeState = 'resolved'
  }

  /**
   * S4b Task 14 — reproduces the pre-PR3 `instanceof InteractionNode`
   * dispatch in `Engine.proceed`: `choices.length > 0 → choice`, otherwise
   * `blocked`. Crucially `step()` does NOT inspect `nodeState` — the
   * `'ready' | 'resolved' | 'blocked'` lifecycle is managed by the broader
   * engine flow (`resolve()` / `block()` callers and `nextUnresolved()`
   * filtering), so reading state here would diverge from the pre-PR3
   * semantic and regress test cases where a resolved-but-still-presented
   * InteractionNode hits this path (see improvement-pay-fail-idempotent).
   */
  step(_ctx: EngineContext): NodeStepResult {
    if (this.choices.length > 0) {
      return { kind: 'choice', nodeId: this.id }
    }
    return { kind: 'blocked', reason: 'no choices' }
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
    }
  }
}
