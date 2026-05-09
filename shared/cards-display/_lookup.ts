import type {
  MinorImprovement as MinorImprovementCard,
  Occupation as OccupationCard,
  PlayerActionCard,
} from './types'
import { majorImprovementIdsList } from './major'
import {
  minorImprovementCardsList,
  minorImprovementIdsList,
  occupationCardsList,
  occupationIdsList,
  getCustomMinorImprovement,
  getCustomOccupation,
} from './_lookup-data'

export const majorImprovementIds = majorImprovementIdsList

export type MinorImprovement = MinorImprovementCard | PlayerActionCard

export const minorImprovements: MinorImprovement[] = [...minorImprovementCardsList]

export const minorImprovementIds = minorImprovementIdsList

export const getMinorImprovement = (id: string) =>
  minorImprovements.find((improvement) => improvement.id === id)
  ?? getCustomMinorImprovement(id)

export type Occupation = OccupationCard | PlayerActionCard

export const occupations: Occupation[] = [...occupationCardsList]

export const occupationIds = occupationIdsList

export const getOccupation = (id: string) =>
  occupations.find((occupation) => occupation.id === id)
  ?? getCustomOccupation(id)
