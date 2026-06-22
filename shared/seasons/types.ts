export const seasonIds = ['winter', 'spring', 'summer', 'autumn'] as const

export type SeasonId = typeof seasonIds[number]

export type ThroughTheSeasonsState = {
  startSeason: SeasonId
  currentSeason: SeasonId
}
