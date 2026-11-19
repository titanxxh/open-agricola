import type { PlayerState } from '../../contract/types'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../registry-display'

export type BakeRate = {
  cardId: string
  rate: number
  max: number
  labelKey: string
  /** Alternative recipes for one oven cannot both be used in the same Bake action. */
  exclusiveGroup?: string
}

type BakeRateProvider = (player: PlayerState, rates: readonly BakeRate[]) => readonly BakeRate[]
const bakeRateProviders = new Map<string, BakeRateProvider>()
export const registerBakeRateProvider = (cardId: string, provider: BakeRateProvider): void => {
  bakeRateProviders.set(cardId, provider)
}

const majorBakeTable: Record<string, { rate: number; max: number; labelKey: string }> = {
  Major_Fireplace1: { rate: 2, max: Infinity, labelKey: 'ui.interactionBakeBreadFireplace' },
  Major_Fireplace2: { rate: 2, max: Infinity, labelKey: 'ui.interactionBakeBreadFireplace' },
  Major_Fireplace3: { rate: 2, max: Infinity, labelKey: 'ui.interactionBakeBreadFireplace' },
  Major_CookingHearth1: { rate: 3, max: Infinity, labelKey: 'ui.interactionBakeBreadCookingHearth' },
  Major_CookingHearth2: { rate: 3, max: Infinity, labelKey: 'ui.interactionBakeBreadCookingHearth' },
  Major_CookingHearth3: { rate: 3, max: Infinity, labelKey: 'ui.interactionBakeBreadCookingHearth' },
  Major_Moor_Cookhouse1: { rate: 3, max: Infinity, labelKey: 'improvements.Major_Moor_Cookhouse1.name' },
  Major_Moor_Cookhouse2: { rate: 3, max: Infinity, labelKey: 'improvements.Major_Moor_Cookhouse2.name' },
  Major_ClayOven: { rate: 5, max: 1, labelKey: 'ui.interactionBakeBreadClayOven' },
  Major_ClayOven2: { rate: 5, max: 1, labelKey: 'ui.interactionBakeBreadClayOven' },
  Major_StoneOven: { rate: 4, max: 2, labelKey: 'ui.interactionBakeBreadStoneOven' },
  Major_StoneOven2: { rate: 4, max: 2, labelKey: 'ui.interactionBakeBreadStoneOven' },
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
      if (!(ex.triggers ?? []).includes('bake-bread')) continue
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
    if (!card || !card.isBaking || !card.exchanges) continue
    for (const ex of card.exchanges) {
      if (!(ex.triggers ?? []).includes('bake-bread')) continue
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
  const owned = new Set([...player.improvements, ...player.minorPlayed, ...player.occupationPlayed])
  for (const [cardId, provider] of bakeRateProviders) {
    if (owned.has(cardId)) rates.push(...provider(player, rates.map(rate => ({ ...rate }))))
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
