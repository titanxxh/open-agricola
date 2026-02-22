import type { ActionDefinition } from '../game/types'

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>()

  register(action: ActionDefinition) {
    this.actions.set(action.id, action)
  }

  get(actionId: string) {
    return this.actions.get(actionId)
  }
}
