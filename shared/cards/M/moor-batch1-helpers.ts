import type { ActionFlow, PlayerState, Resource } from '../../contract/types'
import { countUnusedFarmyardSpaces } from '../../domain/farmyard-usage'
import { getStableCountForCards } from '../../domain/stables'
import { initCardState } from '../__stubs__/helpers'
import { getPlayerBakeRates } from '../helpers/exchange-registry'
import { collectCardsAs } from '../helpers/card-type'
import { getLogicalFields } from '../helpers/card-field'

type CraftReward = {
  ids: readonly string[]
  foodExchangeIds?: readonly string[]
  resource: 'wood' | 'clay' | 'reed'
  amount: number
}

const CRAFT_REWARDS: readonly CraftReward[] = [
  { ids: ['Major_Joinery', 'Major_Joinery2'], resource: 'wood', amount: 3 },
  { ids: ['Major_Pottery', 'Major_Pottery2'], resource: 'clay', amount: 3 },
  { ids: ['Major_Basket', 'Major_Basket2'], resource: 'reed', amount: 2 },
]

export const allImprovementCount = (player: PlayerState) =>
  player.improvements.length + player.minorPlayed.length

export const majorImprovementCount = (player: PlayerState) =>
  collectCardsAs(player, 'major').length

export const countTerrain = (player: PlayerState, kind: 'forest' | 'moor') =>
  (player.farmTerrain ?? []).filter((tile) => tile.kind === kind).length

export const unusedFarmyardSpaces = countUnusedFarmyardSpaces

export const hasFarmShape = (player: PlayerState) =>
  getLogicalFields(player).length > 0 || player.pastures.length > 0 || getStableCountForCards(player) > 0

export const hasStableOrPasture = (player: PlayerState) =>
  getStableCountForCards(player) > 0 || player.pastures.length > 0

export const hasGrowingCrop = (player: PlayerState, crop: 'grain' | 'vegetable') =>
  getLogicalFields(player).some((field) => field.stacks.some((stack) => stack.kind === crop))

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

export const craftBuildingCount = (player: PlayerState) =>
  CRAFT_REWARDS.filter((reward) => reward.ids.some((id) => player.improvements.includes(id))).length

export const craftBuildingResource = (cardId: string) =>
  CRAFT_REWARDS.find((reward) => reward.ids.includes(cardId))?.resource

export const isCraftBuilding = (cardId: string) =>
  craftBuildingResource(cardId) !== undefined

export const playerCraftBuildingIds = (player: PlayerState) =>
  CRAFT_REWARDS.flatMap((reward) =>
    reward.ids.filter((id) => player.improvements.includes(id)),
  )

export const foodCraftBuildingResource = (cardId: string) =>
  CRAFT_REWARDS.find((reward) => (reward.foodExchangeIds ?? reward.ids).includes(cardId))?.resource

export const isFoodCraftBuilding = (cardId: string) =>
  foodCraftBuildingResource(cardId) !== undefined

export const playerFoodCraftBuildingIds = (player: PlayerState) =>
  CRAFT_REWARDS.flatMap((reward) =>
    (reward.foodExchangeIds ?? reward.ids).filter((id) => player.improvements.includes(id)),
  )

export const initUsageCounters = (player: PlayerState, cardId: string, amount: number) => {
  const counters = initCardState(player, cardId)
  counters.usage = amount
}

export const usageCounters = (player: PlayerState, cardId: string) =>
  player.cardStates?.[cardId]?.counters?.usage ?? 0

export const setUsageCounterLeaf = (cardId: string, value: number): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: cardId,
  params: { kind: 'set-counter', key: 'usage', value },
})
