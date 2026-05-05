import type {
  ChoiceEffectPreview,
  ActionExecutionContext,
  ActionExecutionResult,
  Resource,
} from '../../game/types'
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
}
