import type { ActionCostPreview, ActionDefinition, ActionExecutionResult, PlayerState, Resource } from '../../game/types'
import { canExecuteWithCostPreview } from './cost-preview'
import { canAffordTypedFlatCost, payTypedFlatCost } from './pay-helpers'

export const getRenovation = (player: PlayerState): { nextType: 'wood' | 'clay' | 'stone'; cost: Partial<Resource> } | null => {
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
) => {
  const renovation = getRenovation(player)
  if (!renovation) return false
  const cost = costOverride
    ? {
        ...renovation.cost,
        ...Object.fromEntries(
          Object.entries(costOverride).map(([key, value]) => [
            key,
            Math.max(0, (renovation.cost[key as keyof Resource] ?? 0) + (value ?? 0)),
          ]),
        ),
      }
    : renovation.cost
  return canAffordTypedFlatCost(player, cost, 'renovation')
}

export const renovateHouse = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
) => {
  const renovation = getRenovation(player)
  if (!renovation) return false
  const cost = costOverride
    ? {
        ...renovation.cost,
        ...Object.fromEntries(
          Object.entries(costOverride).map(([key, value]) => [
            key,
            Math.max(0, (renovation.cost[key as keyof Resource] ?? 0) + (value ?? 0)),
          ]),
        ),
      }
    : renovation.cost
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
  isStructurallyPossible: ({ player }) => getRenovation(player) !== null,
  canExecute: ({ player }, costOverride) => canRenovate(player, costOverride),
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
    if (!canRenovate(player, costs)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    if (!renovateHouse(player, costs)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    return { type: 'ok' }
  },
}
