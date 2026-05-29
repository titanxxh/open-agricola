import type { GameState, PlayerState, SupplyTokenKey } from '../contract/types'
import { getOwnOrdinaryFenceCount, MAX_ORDINARY_FENCE_PIECES } from './fence-segments'
import { getFarmHandStableInUseCount, getOrdinaryStableCount } from './stables'

export const MAX_STABLE_PIECES = 4

export const readConsumedSupplyTokenCount = (player: PlayerState, key: SupplyTokenKey): number =>
  Math.max(0, player.supplyTokensConsumed?.[key] ?? 0)

export const addConsumedSupplyTokenCount = (
  player: PlayerState,
  key: SupplyTokenKey,
  amount: number,
): void => {
  if (amount <= 0) return
  player.supplyTokensConsumed ??= {}
  player.supplyTokensConsumed[key] = readConsumedSupplyTokenCount(player, key) + amount
}

export const getOwnOrdinaryFenceBuildLimit = (player: PlayerState): number =>
  Math.max(0, MAX_ORDINARY_FENCE_PIECES - readConsumedSupplyTokenCount(player, 'fence'))

export const getOwnOrdinaryFenceHeldOnCardsCount = (player: PlayerState): number => {
  const ashTrees = player.cardStates?.E74_AshTrees?.counters?.fences ?? 0
  return Math.max(0, ashTrees)
}

export const getOwnOrdinaryFenceReserveCount = (player: PlayerState): number =>
  Math.max(
    0,
    getOwnOrdinaryFenceBuildLimit(player)
      - getOwnOrdinaryFenceCount(player)
      - getOwnOrdinaryFenceHeldOnCardsCount(player),
  )

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

const readNumberArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number') : []

export const getReservedFutureStableCount = (_state: GameState, player: PlayerState): number =>
  readNumberArray(player.cardStates?.A89_StablePlanner?.extraData?.targetRounds).length

export const getReservedActionSpaceStableCount = (player: PlayerState): number =>
  readStringArray(player.cardStates?.E148_Lazybones?.extraData?.reservedActionSpaces).length

export const getAvailableStableSupplyCount = (state: GameState, player: PlayerState): number =>
  Math.max(
    0,
    MAX_STABLE_PIECES
      - readConsumedSupplyTokenCount(player, 'stable')
      - getOrdinaryStableCount(player)
      - getReservedFutureStableCount(state, player)
      - getReservedActionSpaceStableCount(player)
      - getFarmHandStableInUseCount(player),
  )
