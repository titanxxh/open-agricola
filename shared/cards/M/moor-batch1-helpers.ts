import type { PlayerState, Resource } from '../../contract/types'
import { countFieldsWithCrop } from '../../domain/field'
import { countUnusedFarmyardSpaces } from '../../domain/farmyard-usage'
import { getStableCountForCards } from '../../domain/stables'
import { getPlayerBakeRates } from '../helpers/exchange-registry'
import { collectCardsAs } from '../helpers/card-type'

type CraftReward = {
  ids: readonly string[]
  resource: 'wood' | 'clay' | 'reed'
  amount: number
}

const CRAFT_REWARDS: readonly CraftReward[] = [
  { ids: ['Major_Joinery', 'Major_Joinery2', 'Major_Moor_FurnitureStall'], resource: 'wood', amount: 3 },
  { ids: ['Major_Pottery', 'Major_Pottery2', 'Major_Moor_CeramicsStall'], resource: 'clay', amount: 3 },
  { ids: ['Major_Basket', 'Major_Basket2', 'Major_Moor_BasketStall'], resource: 'reed', amount: 2 },
]

export const allImprovementCount = (player: PlayerState) =>
  player.improvements.length + player.minorPlayed.length

export const majorImprovementCount = (player: PlayerState) =>
  collectCardsAs(player, 'major').length

export const countTerrain = (player: PlayerState, kind: 'forest' | 'moor') =>
  (player.farmTerrain ?? []).filter((tile) => tile.kind === kind).length

export const unusedFarmyardSpaces = countUnusedFarmyardSpaces

export const hasFarmShape = (player: PlayerState) =>
  player.fields.length > 0 || player.pastures.length > 0 || getStableCountForCards(player) > 0

export const hasStableOrPasture = (player: PlayerState) =>
  getStableCountForCards(player) > 0 || player.pastures.length > 0

export const hasGrowingCrop = (player: PlayerState, crop: 'grain' | 'vegetable') =>
  countFieldsWithCrop(player.fields, crop) > 0

export const bestBakeFood = (player: PlayerState) =>
  Math.max(0, ...getPlayerBakeRates(player).map((rate) => rate.rate))

export const craftResourceGain = (player: PlayerState): Partial<Resource> => {
  const gain: Partial<Resource> = {}
  for (const reward of CRAFT_REWARDS) {
    if (reward.ids.some((id) => player.improvements.includes(id))) {
      gain[reward.resource] = (gain[reward.resource] ?? 0) + reward.amount
    }
  }
  return gain
}

export const hasCraftBuilding = (player: PlayerState) =>
  Object.keys(craftResourceGain(player)).length > 0
