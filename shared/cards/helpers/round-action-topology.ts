import type { GameState } from '../../contract/types'
import { findActionSpaceById, hasActionSpace } from '../../domain/space'

export type RoundActionSlot = {
  roundNumber: number
  actionId: string
}

type BoardActionPos = {
  top: number
  left: number
  width: number
  height: number
}

type BoardActionItem = {
  id: string | null
  pos: BoardActionPos
}

const SIDE_PANEL_OFFSET = 170
const SHARED_EXTENSION_OFFSET = 360
const SIX_PLAYER_RAIL_OFFSET = 180
const ROUND_SLOT_SIZE = 140

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

const SIDE_ACTIONS: Record<string, BoardActionPos> = {
  'copse': { top: 18, left: 5, width: 60, height: 83 },
  'grove': { top: 110, left: 54, width: 60, height: 86 },
  'resource-market-4': { top: 236, left: 5, width: 110, height: 65 },
  'resource-market': { top: 236, left: 5, width: 110, height: 65 },
  'hollow-4': { top: 313, left: 5, width: 60, height: 86 },
  'hollow': { top: 313, left: 5, width: 60, height: 86 },
  'lessons-4': { top: 412, left: 5, width: 115, height: 94 },
  'lessons-3': { top: 412, left: 5, width: 115, height: 94 },
  'traveling-players': { top: 516, left: 53, width: 65, height: 84 },
}

const CENTRAL_ACTIONS: Record<string, BoardActionPos> = {
  'farm-expansion': { top: -3, left: 30, width: 115, height: 134 },
  'meeting-place': { top: 134, left: 31, width: 115, height: 72 },
  'grain-seeds': { top: 220, left: 30, width: 115, height: 69 },
  'farmland': { top: 310, left: 30, width: 115, height: 80 },
  'forest': { top: 203, left: 253, width: 60, height: 86 },
  'clay-pit': { top: 306, left: 175, width: 60, height: 86 },
  'lessons': { top: 406, left: 30, width: 115, height: 94 },
  'reed-bank': { top: 411, left: 254, width: 60, height: 86 },
  'day-laborer': { top: 526, left: 30, width: 115, height: 74 },
  'fishing': { top: 514, left: 175, width: 62, height: 86 },
}

const SIDE_ACTION_OVERRIDES: Record<number, Partial<Record<string, Partial<BoardActionPos>>>> = {
  3: {
    'resource-market': { top: 255, left: 4, width: 111, height: 64 },
    'hollow': { top: 329, left: 6 },
    'lessons-3': { top: 433, left: 2 },
  },
  4: {
    'grove': { top: 138 },
  },
}

const EXPANSION_56_ACTIONS: Record<string, BoardActionPos> = {
  'lessons-56-2f': { top: 18, left: 24, width: 115, height: 94 },
  'copse-56': { top: 18, left: 256, width: 60, height: 83 },
  'riverbank-forest-56': { top: 140, left: 112, width: 60, height: 110 },
  'grove-56': { top: 146, left: 254, width: 60, height: 86 },
  'lessons-56-variable': { top: 296, left: 24, width: 115, height: 94 },
  'modest-wish-children-56': { top: 296, left: 206, width: 115, height: 94 },
  'animal-market-56': { top: 430, left: 24, width: 115, height: 134 },
  'resource-market-56': { top: 432, left: 192, width: 110, height: 65 },
  'hollow-56': { top: 532, left: 230, width: 60, height: 86 },
  'house-building-56': { top: 662, left: 24, width: 115, height: 134 },
  'traveling-players-56': { top: 672, left: 244, width: 65, height: 84 },
}

const SIX_ONLY_ACTIONS: Record<string, BoardActionPos> = {
  'farm-supplies-6': { top: 18, left: 52, width: 115, height: 94 },
  'resource-trade-6': { top: 138, left: 52, width: 115, height: 94 },
  'corral-6': { top: 258, left: 52, width: 115, height: 74 },
  'side-job-6': { top: 358, left: 52, width: 115, height: 94 },
  'improvement-6': { top: 478, left: 52, width: 115, height: 94 },
}

const ROUND_POS: Record<number, Pick<BoardActionPos, 'top' | 'left'>> = {
  1: { top: 2, left: 167 },
  2: { top: 1, left: 331 },
  3: { top: 1, left: 493 },
  4: { top: 1, left: 657 },
  5: { top: 156, left: 330 },
  6: { top: 156, left: 493 },
  7: { top: 156, left: 657 },
  8: { top: 311, left: 330 },
  9: { top: 311, left: 493 },
  10: { top: 462, left: 330 },
  11: { top: 462, left: 493 },
  12: { top: 626, left: 6 },
  13: { top: 626, left: 172 },
  14: { top: 626, left: 489 },
}

const getBoardPlayerCount = (state: Pick<GameState, 'players'>): 2 | 3 | 4 | 5 | 6 => {
  const count = state.players.length
  if (count >= 6) return 6
  if (count === 5) return 5
  if (count >= 4) return 4
  if (count === 3) return 3
  return 2
}

const getBoardOffset = (playerCount: 2 | 3 | 4 | 5 | 6) => {
  if (playerCount === 2) return 0
  if (playerCount === 5) return SHARED_EXTENSION_OFFSET
  if (playerCount === 6) return SHARED_EXTENSION_OFFSET + SIX_PLAYER_RAIL_OFFSET
  return SIDE_PANEL_OFFSET
}

const shiftPos = (pos: BoardActionPos, leftOffset: number): BoardActionPos => ({
  ...pos,
  left: pos.left + leftOffset,
})

const shiftPositions = (positions: Record<string, BoardActionPos>, leftOffset: number): Record<string, BoardActionPos> =>
  Object.fromEntries(
    Object.entries(positions).map(([spaceId, pos]) => [
      spaceId,
      shiftPos(pos, leftOffset),
    ]),
  ) as Record<string, BoardActionPos>

const getBasePositions = (playerCount: 2 | 3 | 4 | 5 | 6): Record<string, BoardActionPos> => {
  const leftOffset = getBoardOffset(playerCount)
  const shiftedCentral = shiftPositions(CENTRAL_ACTIONS, leftOffset)
  if (playerCount === 5) return { ...EXPANSION_56_ACTIONS, ...shiftedCentral }
  if (playerCount === 6) {
    return {
      ...SIX_ONLY_ACTIONS,
      ...shiftPositions(EXPANSION_56_ACTIONS, SIX_PLAYER_RAIL_OFFSET),
      ...shiftedCentral,
    }
  }
  const basePositions = { ...SIDE_ACTIONS, ...shiftedCentral }
  const overrides = SIDE_ACTION_OVERRIDES[playerCount]
  if (!overrides) return basePositions
  return Object.fromEntries(
    Object.entries(basePositions).map(([spaceId, pos]) => [
      spaceId,
      {
        ...pos,
        ...(overrides[spaceId] ?? {}),
      },
    ]),
  ) as Record<string, BoardActionPos>
}

const getBoardActionItems = (
  state: Pick<GameState, 'players' | 'round' | 'roundActionOrder' | 'actionSpaces'>,
): BoardActionItem[] => {
  const playerCount = getBoardPlayerCount(state)
  const leftOffset = getBoardOffset(playerCount)
  const positions = getBasePositions(playerCount)
  const items: BoardActionItem[] = Object.entries(positions)
    .filter(([spaceId]) => hasActionSpace(state, spaceId))
    .map(([id, pos]) => ({ id, pos }))
  for (let index = 0; index < state.roundActionOrder.length; index += 1) {
    const actionId = state.roundActionOrder[index]
    const roundNumber = index + 1
    const pos = ROUND_POS[roundNumber]
    if (!pos || roundNumber > state.round) continue
    items.push({
      id: actionId && hasActionSpace(state, actionId) ? actionId : null,
      pos: {
        top: pos.top,
        left: pos.left + leftOffset,
        width: ROUND_SLOT_SIZE,
        height: ROUND_SLOT_SIZE,
      },
    })
  }
  return items
}

const centerY = (pos: BoardActionPos) => pos.top + pos.height / 2
const centerX = (pos: BoardActionPos) => pos.left + pos.width / 2

const isSameHorizontalBand = (a: BoardActionPos, b: BoardActionPos) => {
  const aCenter = centerY(a)
  const bCenter = centerY(b)
  return aCenter >= b.top && aCenter <= b.top + b.height && bCenter >= a.top && bCenter <= a.top + a.height
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

export const getLeftBoardActionSpaceId = (
  state: Pick<GameState, 'players' | 'round' | 'roundActionOrder' | 'actionSpaces'>,
  actionId: string,
): string | null => {
  const items = getBoardActionItems(state)
  const current = items.find((item) => item.id === actionId)?.pos
  if (!current) return null
  let best: BoardActionItem | null = null
  for (const candidateItem of items) {
    const candidate = candidateItem.pos
    if (candidateItem.id === actionId) continue
    if (!isSameHorizontalBand(current, candidate)) continue
    if (centerX(candidate) >= centerX(current)) continue
    if (candidate.left + candidate.width > current.left) continue
    if (!best || candidate.left + candidate.width > best.pos.left + best.pos.width) {
      best = candidateItem
    }
  }
  return best?.id ?? null
}

export const isRoundSpaceOccupied = (
  state: Pick<GameState, 'round' | 'roundActionOrder' | 'actionSpaces'>,
  roundNumber: number,
): boolean => {
  const actionId = getRoundSpaceActionId(state, roundNumber)
  if (!actionId) return false
  const space = findActionSpaceById(state, actionId)
  return (space?.takenBy.length ?? 0) > 0
}
