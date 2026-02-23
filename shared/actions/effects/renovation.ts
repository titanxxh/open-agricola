import type { ActionExecutionResult, PlayerState } from '../../game/types'
import { canRenovate, renovateHouse } from './house'

export const renovate = (player: PlayerState): ActionExecutionResult => {
  if (!canRenovate(player)) {
    return { type: 'fail', logKey: 'log.renovationFail' }
  }
  const success = renovateHouse(player)
  if (!success) {
    return { type: 'fail', logKey: 'log.renovationFail' }
  }
  return { type: 'ok' }
}
