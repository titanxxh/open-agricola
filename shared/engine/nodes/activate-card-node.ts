import type { ActionHookPhase } from '../../actions/hooks'
import type { EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class ActivateCardNode extends BaseNode {
  public listenerId: string
  public cardId: string
  public phase: ActionHookPhase
  public actionId: string
  public event: Record<string, unknown>

  constructor(
    id: string,
    listenerId: string,
    cardId: string,
    phase: ActionHookPhase,
    actionId: string,
    event: Record<string, unknown> = {},
  ) {
    super(id, 'activateCard')
    this.listenerId = listenerId
    this.cardId = cardId
    this.phase = phase
    this.actionId = actionId
    this.event = event
  }

  step(_ctx: EngineContext): NodeStepResult {
    if (this.getState() === 'resolved') return { kind: 'done' }
    return { kind: 'activateListener', nodeId: this.id }
  }

  protected cursorData() {
    return {
      listenerId: this.listenerId,
      cardId: this.cardId,
      phase: this.phase,
      actionId: this.actionId,
      event: this.event,
    }
  }
}
