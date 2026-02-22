import type { Resource } from './types'
import { occupationsA } from '../actions/cards/A/occupations'
import { occupationsB } from '../actions/cards/B/occupations'
import { occupationsE } from '../actions/cards/E/occupations'

export type Occupation = {
  id: string
  cost: Partial<Resource>
  reward?: Partial<Resource>
}

export const occupations: Occupation[] = [
  ...occupationsA,
  ...occupationsB,
  ...occupationsE,
]

export const occupationIds = occupations.map((occupation) => occupation.id)

export const getOccupation = (id: string) =>
  occupations.find((occupation) => occupation.id === id)
