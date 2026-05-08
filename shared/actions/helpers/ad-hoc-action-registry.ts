import type { ActionDefinition } from '../../contract/types'

const adHocActions = new Map<string, ActionDefinition>()

export const registerAdHocAction = (def: ActionDefinition): void => {
  if (!def.id.startsWith('card_')) {
    throw new Error(`Ad-hoc action id must start with 'card_': ${def.id}`)
  }
  if (adHocActions.has(def.id)) {
    throw new Error(`Ad-hoc action already registered: ${def.id}`)
  }
  adHocActions.set(def.id, def)
}

export const getAdHocAction = (id: string): ActionDefinition | undefined => {
  return adHocActions.get(id)
}

export const getAllAdHocActions = (): ActionDefinition[] => {
  return [...adHocActions.values()]
}

export const _resetAdHocRegistry = (): void => {
  adHocActions.clear()
}
