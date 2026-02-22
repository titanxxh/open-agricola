import type { ActionDefinition } from '../game/types'
import { actionHookPhases } from './hooks'

export type HookMatrixEntry = {
  actionId: string
  phases: string[]
}

export const buildHookMatrix = (actions: ActionDefinition[]): HookMatrixEntry[] =>
  actions.map((action) => ({
    actionId: action.id,
    phases: [...actionHookPhases],
  }))
