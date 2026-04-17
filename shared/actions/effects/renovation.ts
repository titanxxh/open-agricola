import type { ActionCostPreview, ActionDefinition, ActionExecutionResult, PlayerState, Resource } from '../../game/types'
import { canExecuteWithCostPreview } from './cost-preview'
import { canAffordTypedFlatCost, payTypedFlatCost } from './pay-helpers'

type RenovationPlan = {
  nextType: PlayerState['houseType']
  cost: Partial<Resource>
}

const mergeRenovationCost = (
  baseCost: Partial<Resource>,
  costOverride?: Partial<Resource>,
) => {
  if (!costOverride) return baseCost
  return {
    ...baseCost,
    ...Object.fromEntries(
      Object.entries(costOverride).map(([key, value]) => [
        key,
        Math.max(0, (baseCost[key as keyof Resource] ?? 0) + (value ?? 0)),
      ]),
    ),
  }
}

export const getRenovation = (
  player: PlayerState,
  params?: Record<string, unknown>,
): RenovationPlan | null => {
  const skipClayTier = params?.skipClayTier === true
  if (player.houseType === 'wood' && skipClayTier) {
    return {
      nextType: 'stone',
      cost: { stone: player.rooms, reed: 1 },
    }
  }
  if (player.houseType === 'wood') {
    return {
      nextType: 'clay',
      cost: { clay: player.rooms, reed: 1 },
    }
  }
  if (player.houseType === 'clay') {
    return {
      nextType: 'stone',
      cost: { stone: player.rooms, reed: 1 },
    }
  }
  return null
}

export const canRenovate = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
  renovationOverride?: RenovationPlan | null,
) => {
  const renovation = renovationOverride ?? getRenovation(player)
  if (!renovation) return false
  const cost = mergeRenovationCost(renovation.cost, costOverride)
  return canAffordTypedFlatCost(player, cost, 'renovation')
}

export const renovateHouse = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
  renovationOverride?: RenovationPlan | null,
) => {
  const renovation = renovationOverride ?? getRenovation(player)
  if (!renovation) return false
  const cost = mergeRenovationCost(renovation.cost, costOverride)
  if (!payTypedFlatCost(player, cost, 'renovation')) return false
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
  isStructurallyPossible: ({ player, params }) => getRenovation(player, params) !== null,
  canExecute: ({ player, params }, costOverride) =>
    canRenovate(player, costOverride, getRenovation(player, params)),
  getBaseCost: ({ player, params }) => getRenovation(player, params)?.cost ?? {},
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
  execute: ({ player, params, costs }) => {
    const renovation = getRenovation(player, params)
    if (!renovation) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    if (!canRenovate(player, costs, renovation)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    if (!renovateHouse(player, costs, renovation)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    return { type: 'ok' }
  },
}
