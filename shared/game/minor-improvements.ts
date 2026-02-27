import type {
  MinorImprovement as MinorImprovementCard,
  PlayerActionCard,
} from '../cards/types'
import {
  minorImprovementCards,
  minorImprovementIds,
} from '../cards/catalog'

export type MinorImprovement = MinorImprovementCard | PlayerActionCard

export const minorImprovements: MinorImprovement[] = minorImprovementCards

export { minorImprovementIds }

export const getMinorImprovement = (id: string) =>
  minorImprovements.find((improvement) => improvement.id === id)
