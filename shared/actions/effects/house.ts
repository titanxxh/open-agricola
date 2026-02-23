import type { PlayerState, Resource } from '../../game/types'
import { applyCostOverride, canPayResources, payResources } from './pay'

export const getBuildRoomCost = (houseType: PlayerState['houseType']) => {
  if (houseType === 'clay') return { clay: 5, reed: 2 }
  if (houseType === 'stone') return { stone: 5, reed: 2 }
  return { wood: 5, reed: 2 }
}

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

export const canAfford = (player: PlayerState, cost: Partial<Resource>) =>
  canPayResources(player, cost)
