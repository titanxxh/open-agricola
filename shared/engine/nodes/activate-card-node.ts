import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class ActivateCardNode extends BaseNode {
  public listenerId: string
  public cardId: string
  public phase: ActionHookPhase
  public actionId: string
  public event: Record<string, unknown>
  // When dispatch (`buildPhaseTrailingNodes`) peeks the listener handler, it
  // stores the result here so engine-proceed reuses it instead of re-invoking.
  // Caveat: peek runs the handler at dispatch time, which is pre-reorganize
  // for collect-style actions — listeners that depend on post-reorg state
  // (e.g. A17 ReclamationPlow checking animal zones) won't see the right
  // state at peek time. For now, undefined result falls back to lazy invoke
  // in engine-proceed, accepting codex #3's hypothetical "void listener
  // double-run" — project listeners don't return void on after-phase paths
  // that go through this dispatcher.
  public preComputedResult?: ActionHookResult

  constructor(
    id: string,
    listenerId: string,
    cardId: string,
    phase: ActionHookPhase,
    actionId: string,
    event: Record<string, unknown> = {},
    preComputedResult?: ActionHookResult,
  ) {
    super(id, 'activateCard')
    this.listenerId = listenerId
    this.cardId = cardId
    this.phase = phase
    this.actionId = actionId
    this.event = event
    this.preComputedResult = preComputedResult
  }

  /**
   * S4b Task 17 / PR5 sub-commit 4 — ActivateCardNode signals
   * `'activateListener'` (with its `nodeId`) so the engine main loop can
   * dispatch `executeCardListener`, follow-up flow insertion and
   * player-switch wrapping without an `instanceof ActivateCardNode` test.
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
