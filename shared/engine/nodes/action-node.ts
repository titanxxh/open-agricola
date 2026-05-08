import type {
  ChoiceEffectPreview,
  ActionExecutionContext,
  ActionExecutionResult,
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
    }
  }
}
