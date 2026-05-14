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

  /**
   * S4b Task 17 / PR5 sub-commit 4 — ActivateCardNode signals
   * `'activateListener'` (with its `nodeId`) so the engine main loop can
   * dispatch `executeCardListener`, follow-up flow insertion and
   * effective-owner metadata handling without an `instanceof ActivateCardNode` test.
   * Once resolved → `'done'`. Side-effect implementation stays in the
   * engine (executeCardListener, tree.insertAfter, log emission).
   */
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
