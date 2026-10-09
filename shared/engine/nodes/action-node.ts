import type {
  ChoiceEffectPreview,
  ActionExecutionContext,
  ActionExecutionResult,
  InternalActionChild,
  InteractionRequest,
} from '../../contract/types'
import type { GameEvent } from '../../contract/events'
import type { TriggerSnapshot } from '../../cards/helpers/trigger-snapshot'
import type { EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class ActionNode extends BaseNode {
  public actionId: string
  public sourceCard?: string
  public params?: Record<string, unknown>
  public actionContext?: Record<string, unknown>
  public effectPreview?: ChoiceEffectPreview
  public choiceLabelKey?: string
  public choiceLabelParams?: Record<string, unknown>
  public resolvedReplacement?: { actionId: string; sourceCard?: string }
  public beforePhaseResolved = false
  public bodyStarted = false
  /** Explicit OR/XOR selection retained through before/owner deferral. */
  public selectedBranchChoice?: string
  public continuationParentHostNodeId?: string
  public internalHostNodeId?: string
  public internalResultKey?: string
  public internalPaymentInfoFrom?: string
  public deferredHostResult?: ActionExecutionResult
  public deferredAfterHostCommitChildren?: InternalActionChild[]
  public deferredAfterHostChildren?: InternalActionChild[]
  public deferredHostCommitCompleted?: boolean
  public deferredHostTransactionEvents?: GameEvent[]
  public deferredHostActionEvents?: GameEvent[]
  public deferredHostTriggerSnapshot?: TriggerSnapshot
  public deferredHostChoice?: string
  public deferredHostResultTargetNodeId?: string
  public deferredHostResultKey?: string
  /**
   * S7 Batch 1 (Sprint S7) — when a leaf ActionNode is built from an
   * ActionDef without `resolveChoice`, its
   * `execute()` may still return `{ type: 'request', request: {...} }`
   * (e.g. `breedAction` emitting `kind: 'animal-reorg'` for B104
   * SheepWalker's last-harvest enforcement). In that case engine-proceed
   * routes the emit via `applyInteractionRequest` with `targetNode === null`
   * and falls back to `pendingNodeIdRef = ActionNode.id`. Without this
   * field the request payload would be lost, so session-core could not pivot
   * into `startReorganizeSubFlow`. Mirrors `OrNode.emittedRequest` /
   * `XorNode.emittedRequest` so
   * pending-envelope callers can read the kind off the host node
   * uniformly regardless of whether the pending node is leaf-paired or
   * leaf-only.
   */
  public emittedRequest?: InteractionRequest

  constructor(
    id: string,
    actionId: string,
    sourceCard?: string,
    params?: Record<string, unknown>,
    choiceLabelKey?: string,
    choiceLabelParams?: Record<string, unknown>,
    actionContext?: Record<string, unknown>,
    effectPreview?: ChoiceEffectPreview,
    internalHostNodeId?: string,
    internalResultKey?: string,
    internalPaymentInfoFrom?: string,
  ) {
    super(id, 'action')
    this.actionId = actionId
    this.sourceCard = sourceCard
    this.params = params
    this.choiceLabelKey = choiceLabelKey
    this.choiceLabelParams = choiceLabelParams
    this.actionContext = actionContext
    this.effectPreview = effectPreview
    this.internalHostNodeId = internalHostNodeId
    this.internalResultKey = internalResultKey
    this.internalPaymentInfoFrom = internalPaymentInfoFrom
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
      resolvedReplacement: this.resolvedReplacement,
      beforePhaseResolved: this.beforePhaseResolved,
      bodyStarted: this.bodyStarted,
      selectedBranchChoice: this.selectedBranchChoice,
      continuationParentHostNodeId: this.continuationParentHostNodeId,
      emittedRequest: this.emittedRequest,
      internalHostNodeId: this.internalHostNodeId,
      internalResultKey: this.internalResultKey,
      internalPaymentInfoFrom: this.internalPaymentInfoFrom,
      deferredHostResult: this.deferredHostResult,
      deferredAfterHostCommitChildren: this.deferredAfterHostCommitChildren,
      deferredAfterHostChildren: this.deferredAfterHostChildren,
      deferredHostCommitCompleted: this.deferredHostCommitCompleted,
      deferredHostTransactionEvents: this.deferredHostTransactionEvents,
      deferredHostActionEvents: this.deferredHostActionEvents,
      deferredHostTriggerSnapshot: this.deferredHostTriggerSnapshot,
      deferredHostChoice: this.deferredHostChoice,
      deferredHostResultTargetNodeId: this.deferredHostResultTargetNodeId,
      deferredHostResultKey: this.deferredHostResultKey,
    }
  }
}
