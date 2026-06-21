import type { GameState } from '../../contract/types'

export type RoundActionSlot = {
  roundNumber: number
  actionId: string
}

const LEFT_ROUND_BY_ROUND: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  6: 5,
  7: 6,
  9: 8,
  11: 10,
  13: 12,
  14: 13,
}

export const getRoundSpaceActionId = (
  state: Pick<GameState, 'round' | 'roundActionOrder'>,
  roundNumber: number,
): string | null => {
  if (roundNumber < 1 || roundNumber > 14 || roundNumber > state.round) return null
  return state.roundActionOrder[roundNumber - 1] ?? null
}

export const getRoundActionSlot = (
  state: Pick<GameState, 'round' | 'roundActionOrder'>,
  actionId: string,
): RoundActionSlot | null => {
  const index = state.roundActionOrder.findIndex((candidate) => candidate === actionId)
  if (index < 0) return null
  const roundNumber = index + 1
  if (roundNumber > state.round) return null
  return { roundNumber, actionId }
}

export const getLeftRoundActionSpaceId = (
  state: Pick<GameState, 'round' | 'roundActionOrder'>,
  actionId: string,
): string | null => {
  const slot = getRoundActionSlot(state, actionId)
  if (!slot) return null
  const leftRoundNumber = LEFT_ROUND_BY_ROUND[slot.roundNumber]
  if (!leftRoundNumber) return null
  return getRoundSpaceActionId(state, leftRoundNumber)
}

export const isRoundSpaceOccupied = (
  state: Pick<GameState, 'round' | 'roundActionOrder' | 'actionSpaces'>,
  roundNumber: number,
): boolean => {
  const actionId = getRoundSpaceActionId(state, roundNumber)
  if (!actionId) return false
  const space = state.actionSpaces.find((candidate) => candidate.id === actionId)
  return (space?.takenBy.length ?? 0) > 0
}
