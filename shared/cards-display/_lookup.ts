import type {
  MinorImprovement as MinorImprovementCard,
  Occupation as OccupationCard,
  PlayerActionCard,
} from '../cards/types'
import { majorCardDefinitions } from '../cards/major'
import {
  minorImprovementCards,
  minorImprovementIds,
  occupationCards,
  occupationIds,
} from '../cards/catalog'
import {
  getCustomMinorImprovement,
  getCustomOccupation,
} from '../cards/custom-registry'

export const majorImprovementIds = majorCardDefinitions.map(
  (improvement) => improvement.id,
)

export type MinorImprovement = MinorImprovementCard | PlayerActionCard

export const minorImprovements: MinorImprovement[] = minorImprovementCards

export { minorImprovementIds }

export const getMinorImprovement = (id: string) =>
  minorImprovements.find((improvement) => improvement.id === id)
  ?? getCustomMinorImprovement(id)

export type Occupation = OccupationCard | PlayerActionCard

export const occupations: Occupation[] = occupationCards

export { occupationIds }

export const getOccupation = (id: string) =>
  occupations.find((occupation) => occupation.id === id)
  ?? getCustomOccupation(id)
