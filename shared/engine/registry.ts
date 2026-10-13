import type { ActionDefinition } from '../contract/types'

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>()

  register(action: ActionDefinition) {
    this.actions.set(action.id, action)
  }

  get(actionId: string) {
    return this.actions.get(actionId)
  }

  getRequired(actionId: string): ActionDefinition {
    const action = this.get(actionId)
    if (!action) throw new Error(`missing action definition: ${actionId}`)
    return action
  }

  /** Iterate over all registered actions. */
  values() {
    return this.actions.values()
  }
}
