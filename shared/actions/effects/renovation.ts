import type { ActionDefinition, ActionExecutionResult, PlayerState, Resource } from '../../game/types'
import { applyCostOverride, canPayResources, payResources } from './pay'

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
  const cost = applyCostOverride(renovation.cost, costOverride)
  return canPayResources(player, cost)
}

export const renovateHouse = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
) => {
  const renovation = getRenovation(player)
  if (!renovation) return false
  const cost = applyCostOverride(renovation.cost, costOverride)
  if (!canPayResources(player, cost)) return false
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

export const renovateHouseAction: ActionDefinition = {
  id: 'renovate-house',
  nameKey: 'actions.house-redevelopment.name',
  descriptionKey: 'actions.house-redevelopment.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => {
    const renovation = getRenovation(player)
    if (!renovation) return false
    return canPayResources(player, renovation.cost)
  },
  execute: ({ player, costs }) => {
    const renovation = getRenovation(player)
    if (!renovation) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    const renovationCost = applyCostOverride(renovation.cost, costs)
    if (!canPayResources(player, renovationCost)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    if (!renovateHouse(player, costs)) {
      return { type: 'fail', logKey: 'log.renovationFail' }
    }
    return { type: 'ok' }
  },
}
