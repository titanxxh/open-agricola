import type { EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class PlayerSwitchNode extends BaseNode {
  public targetPlayerId: string

  constructor(id: string, targetPlayerId: string) {
    super(id, 'playerSwitch')
    this.targetPlayerId = targetPlayerId
  }

  /**
   * S4b Task 18 — leaf-node medium richness. PlayerSwitchNode signals
   * 'playerSwitch' (carrying the target player id) when not yet resolved
   * so the engine main loop can surface a top-level
   * `EngineStepResult.playerSwitch`. Once resolved (the engine resolves
   * the node before returning), step() reports 'done'.
   */
  step(_ctx: EngineContext): NodeStepResult {
    if (this.getState() === 'resolved') return { kind: 'done' }
    return { kind: 'playerSwitch', targetPlayerId: this.targetPlayerId }
  }

  protected cursorData() {
    return {
      targetPlayerId: this.targetPlayerId,
    }
  }
}
