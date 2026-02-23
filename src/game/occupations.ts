import type { Occupation as OccupationCard, PlayerActionCard } from '../actions/cards/types'
import { occupationCards, occupationIds } from '../actions/cards/catalog'

export type Occupation = OccupationCard | PlayerActionCard

export const occupations: Occupation[] = occupationCards

export { occupationIds }

export const getOccupation = (id: string) =>
  occupations.find((occupation) => occupation.id === id)
