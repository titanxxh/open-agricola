import type {
  ChoiceEffectPreview,
  ActionExecutionContext,
  ActionExecutionResult,
  InteractionRequest,
  Resource,
} from '../../contract/types'
import type { EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class ActionNode extends BaseNode {
  public actionId: string
  public sourceCard?: string
  public params?: Partial<Resource>
  public actionContext?: Record<string, unknown>
  public effectPreview?: ChoiceEffectPreview
  public choiceLabelKey?: string
  public choiceLabelParams?: Record<string, unknown>
  public beforePhaseResolved = false
  /**
   * S7 Batch 1 (Sprint S7) — when a leaf ActionNode is built from an
   * ActionDef without `resolveChoice` (no paired InteractionNode wrap), its
   * `execute()` may still return `{ type: 'request', request: {...} }`
   * (e.g. `breedAction` emitting `kind: 'animal-reorg'` for B104
   * SheepWalker's last-harvest enforcement). In that case engine-proceed
   * routes the emit via `applyInteractionRequest` with `targetNode === null`
   * and falls back to `pendingNodeIdRef = ActionNode.id`. Without this
   * field the request payload would be lost (no InteractionNode hosts it
   * and `peekInteraction()` returns null), so session-core could not pivot
   * into `startReorganizeSubFlow`. Mirrors `OrNode.emittedRequest` /
   * `XorNode.emittedRequest` / `OptionalNode.emittedRequest` so
   * `peekInteractionHost()` callers can read the kind off the host node
   * uniformly regardless of whether the pending node is leaf-paired or
   * leaf-only.
   */
  public emittedRequest?: InteractionRequest

  constructor(
    id: string,
    actionId: string,
    sourceCard?: string,
    params?: Partial<Resource>,
    choiceLabelKey?: string,
    choiceLabelParams?: Record<string, unknown>,
    actionContext?: Record<string, unknown>,
    effectPreview?: ChoiceEffectPreview,
  ) {
    super(id, 'action')
    this.actionId = actionId
    this.sourceCard = sourceCard
    this.params = params
    this.choiceLabelKey = choiceLabelKey
    this.choiceLabelParams = choiceLabelParams
    this.actionContext = actionContext
    this.effectPreview = effectPreview
  }

  execute(
    context: ActionExecutionContext & { actionId: string },
    executor: (context: ActionExecutionContext) => ActionExecutionResult,
  ) {
    return executor(context)
  }

  isDoable() {
    return true
  }

  /**
   * S4b Task 16 / PR5 sub-commit 4 — ActionNode signals `'execute'` (with
   * its `nodeId` + `actionId`) so the engine main loop can dispatch the
   * cost/replace/before-phase/hook/executor pipeline without an
   * `instanceof ActionNode` test. Once resolved → `'done'`. The engine
   * still owns the dispatch implementation (heavy: hook system, tree
   * mutations, log emission) — this signal is purely the "what kind of
   * leaf am I?" answer.
   */
  step(_ctx: EngineContext): NodeStepResult {
    if (this.getState() === 'resolved') return { kind: 'done' }
    return { kind: 'execute', nodeId: this.id, actionId: this.actionId }
  }

  protected cursorData() {
    return {
      actionId: this.actionId,
      sourceCard: this.sourceCard,
      params: this.params,
      actionContext: this.actionContext,
      effectPreview: this.effectPreview,
      choiceLabelKey: this.choiceLabelKey,
      choiceLabelParams: this.choiceLabelParams,
      beforePhaseResolved: this.beforePhaseResolved,
      emittedRequest: this.emittedRequest,
    }
  }
}
