import type { GameSeed } from '../contract/types'
import type { FarmersOfTheMoorState, MoorStartCardId } from './types'
import { dealMoorStartCards, isMoorStartCardId } from './start-cards'
import { createMoorSpecialActionCards, normalizeMoorSpecialActionCards } from './special-action-cards'

export const createFarmersOfTheMoorState = (
  playerIds: readonly string[],
  seed: GameSeed,
): FarmersOfTheMoorState => ({
  complexity: 'iii',
  startCardByPlayerId: dealMoorStartCards(playerIds, seed),
  specialActionCards: createMoorSpecialActionCards(playerIds.length),
})

export const normalizeFarmersOfTheMoorState = (
  raw: unknown,
  playerIds: readonly string[],
  seed: GameSeed,
): FarmersOfTheMoorState => {
  const fallback = createFarmersOfTheMoorState(playerIds, seed)
  if (!raw || typeof raw !== 'object') return fallback
  const source = raw as { startCardByPlayerId?: Record<string, unknown>; specialActionCards?: unknown }
  const startCardByPlayerId: Record<string, MoorStartCardId> = {}
  for (const playerId of playerIds) {
    const rawId = source.startCardByPlayerId?.[playerId]
    startCardByPlayerId[playerId] = isMoorStartCardId(rawId)
      ? rawId
      : fallback.startCardByPlayerId[playerId]!
  }
  return {
    complexity: 'iii',
    startCardByPlayerId,
    specialActionCards: normalizeMoorSpecialActionCards(source.specialActionCards, playerIds.length),
  }
}
