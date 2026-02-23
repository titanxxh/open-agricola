import type { Occupation as OccupationCard } from '../actions/cards/types'
import { occupationCards, occupationIds } from '../actions/cards/catalog'

export type Occupation = OccupationCard

export const occupations: OccupationCard[] = occupationCards

export { occupationIds }

export const getOccupation = (id: string) =>
  occupations.find((occupation) => occupation.id === id)
