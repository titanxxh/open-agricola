import type { ActionDefinition } from '../contract/types'
import { getAdHocAction } from './helpers/ad-hoc-action-registry'

const actionDefinitionLookup = new Map<string, ActionDefinition>()

export const registerActionDefinitions = (actions: readonly ActionDefinition[]): void => {
  for (const action of actions) actionDefinitionLookup.set(action.id, action)
}

export const getActionDefinition = (actionId: string): ActionDefinition | undefined =>
  actionDefinitionLookup.get(actionId) ?? getAdHocAction(actionId)
