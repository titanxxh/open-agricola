import type { ActionExecutionResult, PlayerState, Resource } from '../../game/types'
import { gainResources } from './gain'
import { addResourcesFromCards } from '../../logic/stats'

export const receiveResources = (
  player: PlayerState,
  resources: Partial<Resource>,
  sourceCard?: string,
): ActionExecutionResult => {
  gainResources(player, resources)
  if (sourceCard) {
    addResourcesFromCards(player, resources)
  }
  return { type: 'ok' }
}
