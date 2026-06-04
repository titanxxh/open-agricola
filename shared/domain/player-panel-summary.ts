import { getExtraRoomCapacity } from '../cards/card-effects'
import type { GameState, PlayerState } from '../contract/types'
import {
  getBorrowedFenceCount,
  getFenceCount,
  getPalisadeCount,
} from './fence-segments'
import { familySize, getFamilyTokenLimit } from './player'
import {
  getAvailableStableSupplyCount,
  getOwnOrdinaryFenceBuildLimit,
  getStableSupplyLimit,
} from './supply-tokens'

export type PlayerPanelSupplySummary = {
  family: { used: number; limit: number }
  rooms: { count: number }
  housingCapacity: { value: number }
  fence: { used: number; limit: number }
  stable: { used: number; limit: number }
}

export const getFarmFenceSegmentCount = (player: PlayerState): number =>
  getFenceCount(player) + getPalisadeCount(player)

export const getEffectiveFarmFenceSegmentLimit = (player: PlayerState): number =>
  getOwnOrdinaryFenceBuildLimit(player) +
  getBorrowedFenceCount(player) +
  getPalisadeCount(player)

export const getEffectiveHousingCapacity = (player: PlayerState): number =>
  player.rooms + getExtraRoomCapacity(player)

export const getPlayerPanelSupplySummary = (
  state: GameState,
  player: PlayerState,
): PlayerPanelSupplySummary => {
  const stableLimit = getStableSupplyLimit(player)
  return {
    family: { used: familySize(player), limit: getFamilyTokenLimit(player) },
    rooms: { count: player.rooms },
    housingCapacity: { value: getEffectiveHousingCapacity(player) },
    fence: {
      used: getFarmFenceSegmentCount(player),
      limit: getEffectiveFarmFenceSegmentLimit(player),
    },
    stable: {
      used: Math.max(0, stableLimit - getAvailableStableSupplyCount(state, player)),
      limit: stableLimit,
    },
  }
}
