import { BaseNode } from './base'

export class PlayerSwitchNode extends BaseNode {
  public targetPlayerId: string

  constructor(id: string, targetPlayerId: string) {
    super(id, 'playerSwitch')
    this.targetPlayerId = targetPlayerId
  }
}
