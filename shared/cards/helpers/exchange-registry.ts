import type { PlayerState } from '../../game/types'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../types'

export type BakeRate = {
  cardId: string
  rate: number
  max: number
  labelKey: string
}

const majorBakeTable: Record<string, { rate: number; max: number; labelKey: string }> = {
  Major_Fireplace1: { rate: 2, max: Infinity, labelKey: 'ui.interactionBakeBreadFireplace' },
  Major_Fireplace2: { rate: 2, max: Infinity, labelKey: 'ui.interactionBakeBreadFireplace' },
  Major_CookingHearth1: { rate: 3, max: Infinity, labelKey: 'ui.interactionBakeBreadCookingHearth' },
  Major_CookingHearth2: { rate: 3, max: Infinity, labelKey: 'ui.interactionBakeBreadCookingHearth' },
  Major_ClayOven: { rate: 5, max: 1, labelKey: 'ui.interactionBakeBreadClayOven' },
  Major_StoneOven: { rate: 4, max: 2, labelKey: 'ui.interactionBakeBreadStoneOven' },
}

export const getPlayerBakeRates = (player: PlayerState): BakeRate[] => {
  const rates: BakeRate[] = []
  for (const cardId of player.improvements) {
    const entry = majorBakeTable[cardId]
    if (entry) {
      rates.push({ cardId, ...entry })
    }
  }
  for (const cardId of player.minorPlayed) {
    const card = getRegisteredMinorImprovement(cardId)
    if (!card || !card.isBaking || !card.exchanges) continue
    for (const ex of card.exchanges) {
      if (ex.trigger !== 'bake-bread') continue
      const grainCost = (ex.from as Record<string, number>).grain ?? 0
      const foodGain = (ex.to as Record<string, number>).food ?? 0
      if (grainCost > 0 && foodGain > 0) {
        rates.push({
          cardId,
          rate: foodGain / grainCost,
          max: ex.max ?? Infinity,
          labelKey: `cards.${cardId}.bakeBread`,
        })
      }
    }
  }
  for (const cardId of player.occupationPlayed) {
    const card = getRegisteredOccupation(cardId)
    if (!card || !(card as any).isBaking || !(card as any).exchanges) continue
    for (const ex of (card as any).exchanges) {
      if (ex.trigger !== 'bake-bread') continue
      const grainCost = (ex.from as Record<string, number>).grain ?? 0
      const foodGain = (ex.to as Record<string, number>).food ?? 0
      if (grainCost > 0 && foodGain > 0) {
        rates.push({
          cardId,
          rate: foodGain / grainCost,
          max: ex.max ?? Infinity,
          labelKey: `cards.${cardId}.bakeBread`,
        })
      }
    }
  }
  return rates
}

export const hasAnyBakingImprovement = (player: PlayerState): boolean => {
  if (player.improvements.some((id) => id in majorBakeTable)) return true
  for (const cardId of player.minorPlayed) {
    const card = getRegisteredMinorImprovement(cardId)
    if (card?.isBaking) return true
  }
  return false
}
