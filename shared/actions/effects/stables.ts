import type { ActionCostPreview, ActionDefinition, ActionExecutionResult, PlayerState, Resource } from '../../game/types'
import { getNextEmptyTileForPlayer } from '../../game/farm'
import { payResources } from '../helpers/payment'
import { stableWoodCost } from './fencing'
import { canExecuteWithCostPreview } from '../helpers/cost-preview'
import { canAffordCost } from '../helpers/pay-helpers'
import { applyCostOverride } from '../helpers/payment'

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

const readCostOverride = (
  actionContext?: Record<string, unknown>,
): Partial<Resource> | undefined => {
  const override = actionContext?.costOverride
  if (!override || typeof override !== 'object') return undefined
  return override as Partial<Resource>
}

export const stablesAction: ActionDefinition = {
  id: 'stables',
  nameKey: 'actions.stables.name',
  descriptionKey: 'actions.stables.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, opts) =>
    canExecuteWithCostPreview(stablesCostPreview, { state, player }, readCostOverride(opts?.actionContext)),
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

// re-export for external callers building actionContext
export { applyCostOverride }
