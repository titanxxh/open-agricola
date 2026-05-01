import type { ActionCostPreview, ActionDefinition, ActionExecutionResult, PlayerState } from '../../game/types'
import { getNextEmptyTileForPlayer } from '../../game/farm'
import { payResources } from '../helpers/payment'
import { stableWoodCost } from './fencing'
import { canExecuteWithCostPreview } from '../helpers/cost-preview'
import { canAffordCost } from '../helpers/pay-helpers'

export const buildStable = (player: PlayerState): ActionExecutionResult => {
  const next = getNextEmptyTileForPlayer(player)
  if (!next) {
    return { type: 'fail', logKey: 'log.buildStableFail' }
  }
  if (!canAffordCost(player, { wood: stableWoodCost })) {
    return { type: 'fail', logKey: 'log.buildStableFail' }
  }
  payResources(player, { wood: stableWoodCost })
  player.stableTiles.push(next)
  return { type: 'ok', logKey: 'log.buildStable' }
}

const stablesCostPreview: ActionCostPreview = {
  isStructurallyPossible: ({ player }) => player.stableTiles.length < 4,
  getBaseCost: () => ({ wood: stableWoodCost }),
}

export const stablesAction: ActionDefinition = {
  id: 'stables',
  nameKey: 'actions.stables.name',
  descriptionKey: 'actions.stables.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    canExecuteWithCostPreview(stablesCostPreview, { state, player }),
  costPreview: stablesCostPreview,
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
