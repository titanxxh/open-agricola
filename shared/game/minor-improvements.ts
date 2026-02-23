import type {
  MinorImprovement as MinorImprovementCard,
  PlayerActionCard,
} from '../actions/cards/types'
import {
  minorImprovementCards,
  minorImprovementIds,
} from '../actions/cards/catalog'

export type MinorImprovement = MinorImprovementCard | PlayerActionCard

export const minorImprovements: MinorImprovement[] = minorImprovementCards

export { minorImprovementIds }

export const getMinorImprovement = (id: string) =>
  minorImprovements.find((improvement) => improvement.id === id)
