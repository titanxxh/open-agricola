import type { ActionDefinition, ActionExecutionResult, PlayerState } from '../../game/types'
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

export const stablesAction: ActionDefinition = {
  id: 'stables',
  nameKey: 'actions.stables.name',
  descriptionKey: 'actions.stables.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    player.stableTiles.length < 4 &&
    canPayResources(player, { wood: stableWoodCost }),
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionStableSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionStableConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionStableCancel' },
    ],
  }),
  resolveChoice: () => ({ type: 'ok' }),
}
