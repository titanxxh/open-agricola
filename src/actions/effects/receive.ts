import type { ActionExecutionResult, PlayerState, Resource } from '../../game/types'
import { gainResources } from './gain'

export const receiveResources = (
  player: PlayerState,
  resources: Partial<Resource>,
): ActionExecutionResult => {
  gainResources(player, resources)
  return { type: 'ok' }
}
