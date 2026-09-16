import type { SeasonId } from '../seasons/types'

export const seasonActionIdBySeason: Record<SeasonId, string> = {
  winter: 'season-winter-romantic-evening',
  spring: 'season-spring-animal-and-fruit',
  summer: 'season-summer-farmers-market',
  autumn: 'season-autumn-thanksgiving',
}

export const seasonActionIds = Object.values(seasonActionIdBySeason)
