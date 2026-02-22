import type { ActionExecutionResult, PlayerState } from '../../game/types'
import { getNextEmptyTileForPlayer } from '../../game/farm'
import { canPayResources, payResources } from './pay'
import { stableWoodCost } from './fencing'

export const buildStable = (player: PlayerState): ActionExecutionResult => {
  const next = getNextEmptyTileForPlayer(player)
  if (!next) {
    return { type: 'fail', logKey: 'log.buildStableFail' }
  }
  if (!canPayResources(player, { wood: stableWoodCost })) {
    return { type: 'fail', logKey: 'log.buildStableFail' }
  }
  payResources(player, { wood: stableWoodCost })
  player.stableTiles.push(next)
  return { type: 'ok', logKey: 'log.buildStable' }
}
