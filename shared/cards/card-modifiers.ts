import type { CostModifier } from '../game/types'
import { getOccupationCard } from './catalog'
import { getMinorImprovementCard } from './catalog'

export const getCardModifier = (cardId: string): CostModifier | undefined => {
  return getCardModifiers(cardId)[0]
}

export const getCardModifiers = (cardId: string): CostModifier[] => {
  const occupation = getOccupationCard(cardId)
  if (occupation) {
    const modifiers = [
      ...(occupation.modifiers ?? []),
      ...(occupation.modifier ? [occupation.modifier] : []),
    ]
    if (modifiers.length > 0) {
      return modifiers
    }
  }
  
  const minor = getMinorImprovementCard(cardId)
  if (minor) {
    const modifiers = [
      ...(minor.modifiers ?? []),
      ...(minor.modifier ? [minor.modifier] : []),
    ]
    if (modifiers.length > 0) {
      return modifiers
    }
  }
  
  return []
}
