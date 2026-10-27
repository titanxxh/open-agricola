import type { GameSeed } from '../contract/types'
import type { FarmersOfTheMoorState, MoorStartCardId } from './types'
import { dealMoorStartCards, isMoorStartCardId } from './start-cards'
import { createMoorSpecialActionCards, normalizeMoorSpecialActionCards } from './special-action-cards'
import { createSeededRng, shuffleWithRng } from '../utils/rng'

export const createFarmersOfTheMoorState = (
  playerIds: readonly string[],
  seed: GameSeed,
): FarmersOfTheMoorState => {
  const cards = createMoorSpecialActionCards(playerIds.length)
  if (playerIds.length === 1) {
    const order = shuffleWithRng(cards.map(card => card.id), createSeededRng(seed, 'moor-solo-supply'))
    for (const card of cards) card.location = { kind: 'solo-draw', order: order.indexOf(card.id) }
  }
  return {
    complexity: 'iii',
    startCardByPlayerId: dealMoorStartCards(playerIds, seed),
    specialActionCards: cards,
    ...(playerIds.length === 1 ? { soloRetentionPaid: false } : {}),
  }
}

export const normalizeFarmersOfTheMoorState = (
  raw: unknown,
  playerIds: readonly string[],
  seed: GameSeed,
): FarmersOfTheMoorState => {
  const fallback = createFarmersOfTheMoorState(playerIds, seed)
  if (!raw || typeof raw !== 'object') return fallback
  const source = raw as { startCardByPlayerId?: Record<string, unknown>; specialActionCards?: unknown; soloRetentionPaid?: unknown }
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
    ...(playerIds.length === 1 && typeof source.soloRetentionPaid === 'boolean' ? { soloRetentionPaid: source.soloRetentionPaid } : {}),
  }
}
