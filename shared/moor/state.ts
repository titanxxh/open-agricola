import type { FarmersOfTheMoorState, MoorStartCardId } from './types'
import { dealMoorStartCards, isMoorStartCardId } from './start-cards'

export const createFarmersOfTheMoorState = (
  playerIds: readonly string[],
  seed: number,
): FarmersOfTheMoorState => ({
  complexity: 'iii',
  startCardByPlayerId: dealMoorStartCards(playerIds, seed),
  specialActionCards: [],
})

export const normalizeFarmersOfTheMoorState = (
  raw: unknown,
  playerIds: readonly string[],
  seed: number,
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
    specialActionCards: [],
  }
}
