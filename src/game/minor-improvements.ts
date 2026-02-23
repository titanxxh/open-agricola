import type { MinorImprovement as MinorImprovementCard } from '../actions/cards/types'
import {
  minorImprovementCards,
  minorImprovementIds,
} from '../actions/cards/catalog'

export type MinorImprovement = MinorImprovementCard

export const minorImprovements: MinorImprovementCard[] = minorImprovementCards

export { minorImprovementIds }

export const getMinorImprovement = (id: string) =>
  minorImprovements.find((improvement) => improvement.id === id)
