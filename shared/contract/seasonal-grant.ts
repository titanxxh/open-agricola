import type { SeasonId } from '../seasons/types'

/** The owning resource or construction fact carries the actual grant quantity. */
export type SeasonalGrant = { season: SeasonId }

export const readSeasonalGrant = (value: unknown): SeasonalGrant | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('season' in value)) return undefined
  const season = value.season
  if (season !== 'winter' && season !== 'spring' && season !== 'summer' && season !== 'autumn') return undefined
  return { season }
}
