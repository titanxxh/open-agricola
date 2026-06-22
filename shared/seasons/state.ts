import { createRng } from '../utils/rng'
import { seasonIds, type SeasonId, type ThroughTheSeasonsState } from './types'

const START_SEASON_SEED_NAMESPACE = 0x5e450001

const isSeasonId = (value: unknown): value is SeasonId =>
  typeof value === 'string' && (seasonIds as readonly string[]).includes(value)

export const createThroughTheSeasonsState = (gameSeed: number): ThroughTheSeasonsState => {
  const rng = createRng(Math.floor(gameSeed) ^ START_SEASON_SEED_NAMESPACE)
  const startSeason = seasonIds[Math.floor(rng() * seasonIds.length)] ?? 'winter'
  return {
    startSeason,
    currentSeason: startSeason,
  }
}

export const normalizeThroughTheSeasonsState = (
  raw: unknown,
  gameSeed: number,
): ThroughTheSeasonsState => {
  if (raw && typeof raw === 'object') {
    const candidate = raw as Partial<ThroughTheSeasonsState>
    if (isSeasonId(candidate.startSeason) && isSeasonId(candidate.currentSeason)) {
      return {
        startSeason: candidate.startSeason,
        currentSeason: candidate.currentSeason,
      }
    }
  }
  return createThroughTheSeasonsState(gameSeed)
}
