import type { ActionExecutionResult, PlayerState } from '../../game/types'

export const growFamily = (player: PlayerState): ActionExecutionResult => {
  if (player.rooms <= player.familySize) {
    return { type: 'fail', logKey: 'log.familyGrowthFail' }
  }
  player.familySize += 1
  player.newbornCount += 1
  return { type: 'ok', logKey: 'log.familyGrowth' }
}

export const growFamilyWithoutRoom = (
  player: PlayerState,
): ActionExecutionResult => {
  player.familySize += 1
  player.newbornCount += 1
  return { type: 'ok', logKey: 'log.familyGrowth' }
}
