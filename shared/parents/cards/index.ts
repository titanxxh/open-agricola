import { fatherParentCards } from './fathers'
import { motherParentCards } from './mothers'
import type { ParentCardDefinition } from '../types'

export const parentCards: readonly ParentCardDefinition[] = [
  ...motherParentCards,
  ...fatherParentCards,
] as const

const parentCardsById = new Map<string, ParentCardDefinition>(
  parentCards.map((card) => [card.id, card]),
)

export const getParentCardDefinition = (id: string): ParentCardDefinition | undefined =>
  parentCardsById.get(id)

export { fatherParentCards, motherParentCards }
