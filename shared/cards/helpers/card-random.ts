import { createRng } from '../../utils/rng'
import type { GameState, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from './card-state'

/**
 * Roll a seeded, cacheable random pick from `candidates`. The result is stored under
 * `(cardId, key)` in player.cardStates and returned on subsequent calls without re-rolling.
 *
 * Intended use: cards that produce randomness (A3 PaperKnife, B3 Moonshine) must call
 * this helper once at the moment of randomization, then set
 * `state.pendingUndoBoundary = true` so undo cannot cross the roll.
 *
 * Seed derivation: `gameSeed ^ rngTick`, with rngTick incremented on each new roll.
 * Cached results are keyed by `(cardId, key)` — replay reads the cache without advancing
 * rngTick, so history re-runs produce identical outcomes.
 */
export const rollAndCacheCardPick = <T>(
  state: GameState,
  player: PlayerState,
  cardId: string,
  key: string,
  candidates: T[],
): T => {
  const cached = readCardExtraData<T>(player, cardId, key)
  if (cached !== undefined) return cached
  if (candidates.length === 0) {
    throw new Error(`rollAndCacheCardPick: empty candidates for ${cardId}/${key}`)
  }
  state.rngTick = (state.rngTick ?? 0) + 1
  const seed = (state.gameSeed ?? 0) ^ state.rngTick
  const rng = createRng(seed)
  const idx = Math.floor(rng() * candidates.length)
  const pick = candidates[idx]!
  writeCardExtraData(player, cardId, key, pick)
  return pick
}
