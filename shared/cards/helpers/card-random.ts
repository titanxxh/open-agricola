import { createSeededRng } from '../../utils/rng'
import type { GameState, PlayerState, ProtectedObservation } from '../../contract/types'
import { readCardExtraData, writeCardExtraData, readPrivateCardData, writePrivateCardData } from './card-state'

/**
 * Roll a seeded, cacheable random pick from `candidates`. The result is stored under
 * `(cardId, key)` in player.cardStates and returned on subsequent calls without re-rolling.
 *
 * Intended use: cards that produce randomness (A3 PaperKnife, B3 Moonshine) must call
 * this helper once at the moment of randomization, then set
 * `state.pendingUndoBoundary = true` so undo cannot cross the roll.
 *
 * Seed derivation: one stream per roll, with rngTick incremented on each new roll. An
 * Explicit Seed keeps `gameSeed ^ rngTick`; a wide seed uses the tick as the stream label.
 * Cached results are keyed by `(cardId, key)` — replay reads the cache without advancing
 * rngTick, so history re-runs produce identical outcomes.
 */
export const rollAndCacheCardPick = <T>(
  state: GameState,
  player: PlayerState,
  cardId: string,
  key: string,
  candidates: T[],
  reportProtectedObservation?: (observation: ProtectedObservation) => void,
  visibility: 'internal' | 'player-private' = 'internal',
): T => {
  const cached = visibility === 'player-private'
    ? readPrivateCardData<T>(player, cardId, key)
    : readCardExtraData<T>(player, cardId, key)
  if (cached !== undefined) return cached
  if (candidates.length === 0) {
    throw new Error(`rollAndCacheCardPick: empty candidates for ${cardId}/${key}`)
  }
  const rngTick = (state.rngTick ?? 0) + 1
  state.rngTick = rngTick
  const rng = createSeededRng(state.gameSeed ?? 0, `card-random:${rngTick}`, (value) => value ^ rngTick)
  const idx = Math.floor(rng() * candidates.length)
  const pick = candidates[idx]!
  if (visibility === 'player-private') writePrivateCardData(player, cardId, key, pick)
  else writeCardExtraData(player, cardId, key, pick)
  reportProtectedObservation?.({
    kind: 'random',
    recipientPlayerIds: [player.id],
  })
  return pick
}
