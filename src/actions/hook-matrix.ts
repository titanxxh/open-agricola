import type { ActionDefinition } from '../game/types'
import { actionHookPhases } from './hooks'
import type { ActionHookPhase, ActionHookRegistration } from './hooks'
import type { CardListenerRegistration } from './cards/card-listeners'
import { getRegisteredActionHooks } from './hooks'
import { getRegisteredCardListeners } from './cards/card-listeners'

export type HookMatrixEntry = {
  actionId: string
  phases: ActionHookPhase[]
}

const collectPhases = (
  actionId: string,
  actionHooks: ActionHookRegistration[],
  cardListeners: CardListenerRegistration[],
) => {
  const phaseSet = new Set<ActionHookPhase>()
  actionHooks.forEach((hook) => {
    if (hook.actions && !hook.actions.includes(actionId)) return
    ;(hook.phases ?? actionHookPhases).forEach((phase) => phaseSet.add(phase))
  })
  cardListeners.forEach((listener) => {
    if (listener.actions && !listener.actions.includes(actionId)) return
    ;(listener.phases ?? actionHookPhases).forEach((phase) => phaseSet.add(phase))
  })
  return actionHookPhases.filter((phase) => phaseSet.has(phase))
}

export const buildHookMatrix = (
  actions: ActionDefinition[],
  actionHooks: ActionHookRegistration[] = getRegisteredActionHooks(),
  cardListeners: CardListenerRegistration[] = getRegisteredCardListeners(),
): HookMatrixEntry[] =>
  actions.map((action) => ({
    actionId: action.id,
    phases: collectPhases(action.id, actionHooks, cardListeners),
  }))
