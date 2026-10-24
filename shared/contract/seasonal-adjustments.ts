import type { SeasonId } from '../seasons/types'
import type { Resource } from './types'

/** Actual signed contribution to one committed settlement. */
export type SeasonalAdjustment = {
  season: SeasonId
  resources: Partial<Resource>
}
