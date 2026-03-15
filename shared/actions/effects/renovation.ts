import type { ActionCostPreview, ActionDefinition, ActionExecutionResult, PlayerState, Resource } from '../../game/types'
import { payResources } from './pay'
import { canExecuteWithCostPreview } from './cost-preview'
import { canAffordFlatCost, resolveFlatCost } from './pay-helpers'

export const getRenovation = (player: PlayerState) => {
  if (player.houseType === 'wood') {
    return {
      nextType: 'clay' as const,
      cost: { clay: player.rooms, reed: player.rooms },
    }
  }
  if (player.houseType === 'clay') {
    return {
      nextType: 'stone' as const,
      cost: { stone: player.rooms, reed: player.rooms },
    }
  }
  return null
}

export const canRenovate = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
) => {
  const renovation = getRenovation(player)
  if (!renovation) return false
  return canAffordFlatCost(player, renovation.cost, costOverride)
}

export const renovateHouse = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
) => {
  const renovation = getRenovation(player)
  if (!renovation) return false
  const cost = resolveFlatCost(renovation.cost, costOverride)
  if (!canAffordFlatCost(player, renovation.cost, costOverride)) return false
  payResources(player, cost)
  player.houseType = renovation.nextType
  return true
}

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

export const renovateHouseCostPreview: ActionCostPreview = {
  isStructurallyPossible: ({ player }) => getRenovation(player) !== null,
  getBaseCost: ({ player }) => getRenovation(player)?.cost ?? {},
}

export const renovateHouseAction: ActionDefinition = {
  id: 'renovate-house',
  nameKey: 'actions.house-redevelopment.name',
  descriptionKey: 'actions.house-redevelopment.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    canExecuteWithCostPreview(renovateHouseCostPreview, { state, player }),
  costPreview: renovateHouseCostPreview,
  execute: ({ player, costs }) => {
    const renovation = getRenovation(player)
    if (!renovation) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    if (!canAffordFlatCost(player, renovation.cost, costs)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    if (!renovateHouse(player, costs)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    return { type: 'ok' }
  },
}
