import type { Occupation as OccupationCard, PlayerActionCard } from '../cards/types'
import { occupationCards, occupationIds } from '../cards/catalog'
import { getCustomOccupation } from '../cards/custom-registry'

export type Occupation = OccupationCard | PlayerActionCard

export const occupations: Occupation[] = occupationCards

export { occupationIds }

export const getOccupation = (id: string) =>
  occupations.find((occupation) => occupation.id === id)
  ?? getCustomOccupation(id)
