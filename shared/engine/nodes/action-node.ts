import type {
  ChoiceEffectPreview,
  ActionExecutionContext,
  ActionExecutionResult,
  Resource,
} from '../../game/types'
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
   * S4b Task 16 — leaf-node medium richness. ActionNode signals 'continue'
   * when not yet resolved (engine main loop drives the actual executor /
   * hook orchestration via `node.execute`); 'done' once resolved. Keeping
   * the signal minimal preserves all pre-PR4 dispatch semantics — the
   * engine still owns the cost/replace/before-phase/insertAfter machinery.
   */
  step(_ctx: EngineContext): NodeStepResult {
    if (this.getState() === 'resolved') return { kind: 'done' }
    return { kind: 'continue' }
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
