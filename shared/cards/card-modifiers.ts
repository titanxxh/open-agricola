import type { CostModifier } from '../../game/types'
import { getOccupationCard } from './catalog'
import { getMinorImprovementCard } from './catalog'

export const getCardModifier = (cardId: string): CostModifier | undefined => {
  const occupation = getOccupationCard(cardId)
  if (occupation?.modifier) {
    return occupation.modifier
  }
  
  const minor = getMinorImprovementCard(cardId)
  if (minor?.modifier) {
    return minor.modifier
  }
  
  return undefined
}

export const getCardModifiers = (cardId: string): CostModifier[] => {
  const modifier = getCardModifier(cardId)
  return modifier ? [modifier] : []
}
