import type { Resource } from './types'
import { minorImprovementsA } from '../actions/cards/A/minor-improvements'
import { minorImprovementsB } from '../actions/cards/B/minor-improvements'
import { minorImprovementsE } from '../actions/cards/E/minor-improvements'

export type MinorImprovement = {
  id: string
  cost: Partial<Resource>
  reward?: Partial<Resource>
}

export const minorImprovements: MinorImprovement[] = [
  ...minorImprovementsA,
  ...minorImprovementsB,
  ...minorImprovementsE,
]

export const minorImprovementIds = minorImprovements.map(
  (improvement) => improvement.id,
)

export const getMinorImprovement = (id: string) =>
  minorImprovements.find((improvement) => improvement.id === id)
