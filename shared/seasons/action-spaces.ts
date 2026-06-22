import type { ActionDefinition, ActionFlow, ActionSpace, Resource } from '../contract/types'
import { breedLeaf, canBreedAnimals } from '../actions/effects/breed'
import { familyGrowthAction } from '../actions/effects/family-growth'
import { plowAction } from '../actions/effects/plow'
import { privateFieldPhaseAction } from '../actions/effects/private-field-phase'
import { sowAction } from '../actions/effects/sow'
import { summerBreadOrSellAction, summerBreadOrSellFlow, summerSourceCard } from './internal-actions'
import {
  canAffordTypedFlatCost,
  payTypedFlatCostDetailed,
} from '../actions/payment/internal'
import { isThroughTheSeasonsSeason, romanticEveningCost } from './rules'
import { seasonIds, type SeasonId } from './types'

const emptyResources: Resource = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

export const seasonActionIdBySeason: Record<SeasonId, string> = {
  winter: 'season-winter-romantic-evening',
  spring: 'season-spring-animal-and-fruit',
  summer: 'season-summer-farmers-market',
  autumn: 'season-autumn-thanksgiving',
}

const seasonActionNameBySeason: Record<SeasonId, string> = {
  winter: 'actions.season-winter-romantic-evening.name',
  spring: 'actions.season-spring-animal-and-fruit.name',
  summer: 'actions.season-summer-farmers-market.name',
  autumn: 'actions.season-autumn-thanksgiving.name',
}

const seasonActionDescriptionBySeason: Record<SeasonId, string> = {
  winter: 'actions.season-winter-romantic-evening.description',
  spring: 'actions.season-spring-animal-and-fruit.description',
  summer: 'actions.season-summer-farmers-market.description',
  autumn: 'actions.season-autumn-thanksgiving.description',
}

const canUseSeasonAction = (season: SeasonId): ActionDefinition['canBeExecutedByPlayer'] =>
  (state) =>
    state.enableThroughTheSeasons === true &&
    state.throughTheSeasons?.currentSeason === season

const springSourceCard = 'through-the-seasons:spring'

const springBreedLeaf = (choiceLabelKey?: string): ActionFlow => ({
  ...breedLeaf(springSourceCard),
  choiceLabelKey,
})

const springSowLeaf = (choiceLabelKey?: string): ActionFlow => ({
  type: 'leaf',
  actionId: 'sow',
  sourceCard: springSourceCard,
  choiceLabelKey,
})

const springAnimalAndFruitFlow = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
): ActionFlow | undefined => {
  const canBreed = canBreedAnimals(state, player, { sourceCard: springSourceCard })
  const canSow = sowAction.canBeExecutedByPlayer(state, player)
  const children: ActionFlow[] = []
  if (canBreed) children.push(springBreedLeaf('actions.breed.name'))
  if (canSow) {
    children.push(springSowLeaf('actions.sow.name'))
  }
  if (canBreed && canSow) {
    children.push({
      type: 'seq',
      sourceCard: springSourceCard,
      choiceLabelKey: 'actions.season-spring-animal-and-fruit.option-breed-sow',
      children: [
        springBreedLeaf(),
        springSowLeaf(),
      ],
    }, {
      type: 'seq',
      sourceCard: springSourceCard,
      choiceLabelKey: 'actions.season-spring-animal-and-fruit.option-sow-breed',
      children: [
        springSowLeaf(),
        springBreedLeaf(),
      ],
    })
  }
  if (children.length === 0) return undefined
  return {
    type: 'xor',
    children,
  }
}

const canUseSpringAnimalAndFruit: ActionDefinition['canBeExecutedByPlayer'] =
  (state, player) =>
    isThroughTheSeasonsSeason(state, 'spring') &&
    springAnimalAndFruitFlow(state, player) !== undefined

const executeSpringAnimalAndFruit: ActionDefinition['execute'] = ({ state, player }) => {
  const flow = springAnimalAndFruitFlow(state, player)
  if (!flow) return { type: 'fail', errorKey: 'log.action' }
  return { type: 'flow', flow }
}

const summerPlowLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'plow',
  sourceCard: summerSourceCard,
  choiceLabelKey: 'actions.plow.name',
})

const summerFarmersMarketFlow = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
): ActionFlow | undefined => {
  const children: ActionFlow[] = []
  if (plowAction.canBeExecutedByPlayer(state, player)) children.push(summerPlowLeaf())
  const breadOrSell = summerBreadOrSellFlow(state, player)
  if (breadOrSell?.type === 'xor') {
    children.push({
      type: 'leaf',
      actionId: summerBreadOrSellAction.id,
      sourceCard: summerSourceCard,
      choiceLabelKey: 'actions.season-summer-farmers-market.option-bread-or-sell',
    })
  } else if (breadOrSell) {
    children.push(breadOrSell)
  }
  if (children.length === 0) return undefined
  return {
    type: 'or',
    children,
  }
}

const canUseSummerFarmersMarket: ActionDefinition['canBeExecutedByPlayer'] =
  (state, player) =>
    isThroughTheSeasonsSeason(state, 'summer') &&
    summerFarmersMarketFlow(state, player) !== undefined

const executeSummerFarmersMarket: ActionDefinition['execute'] = ({ state, player }) => {
  const flow = summerFarmersMarketFlow(state, player)
  if (!flow) return { type: 'fail', errorKey: 'log.action' }
  return { type: 'flow', flow }
}

const autumnPrivateFieldLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'private-field-phase',
  choiceLabelKey: 'actions.private-field-phase.name',
})

const autumnVegetableLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'gain',
  params: { vegetable: 1 },
  choiceLabelKey: 'actions.season-autumn-thanksgiving.option-vegetable',
})

const autumnThanksgivingFlow = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
): ActionFlow => {
  const children: ActionFlow[] = []
  if (privateFieldPhaseAction.canBeExecutedByPlayer(state, player)) {
    children.push(autumnPrivateFieldLeaf())
  }
  children.push(autumnVegetableLeaf())
  return {
    type: 'or',
    children,
  }
}

const executeAutumnThanksgiving: ActionDefinition['execute'] = ({ state, player }) => ({
  type: 'flow',
  flow: autumnThanksgivingFlow(state, player),
})

const canGrowWithoutRoom: ActionDefinition['canBeExecutedByPlayer'] = (state, player) =>
  familyGrowthAction.canBeExecutedByPlayer(state, player, {
    actionContext: { skipRoomCheck: true },
  })

const canUseRomanticEvening: ActionDefinition['canBeExecutedByPlayer'] =
  (state, player) =>
    isThroughTheSeasonsSeason(state, 'winter') &&
    canGrowWithoutRoom(state, player) &&
    canAffordTypedFlatCost(player, romanticEveningCost(state), undefined, state)

const executeRomanticEvening: ActionDefinition['execute'] = (context) => {
  if (!canGrowWithoutRoom(context.state, context.player)) {
    return { type: 'fail', errorKey: 'log.familyFull' }
  }
  const payment = payTypedFlatCostDetailed(
    context.player,
    romanticEveningCost(context.state),
    undefined,
    context.state,
  )
  if (!payment.ok) return { type: 'fail', errorKey: 'log.action' }
  const growth = familyGrowthAction.execute({
    ...context,
    actionContext: {
      ...(context.actionContext ?? {}),
      skipRoomCheck: true,
    },
  })
  if (growth.type !== 'ok') return growth
  return {
    ...growth,
    resourcesPaid: payment.resourcesPaid,
  }
}

const createSeasonActionDefinition = (season: SeasonId): ActionDefinition => ({
  id: seasonActionIdBySeason[season],
  nameKey: seasonActionNameBySeason[season],
  descriptionKey: seasonActionDescriptionBySeason[season],
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4, 5, 6],
  strictCanExecute: true,
  canBeExecutedByPlayer:
    season === 'winter'
      ? canUseRomanticEvening
      : season === 'spring'
        ? canUseSpringAnimalAndFruit
        : season === 'summer'
          ? canUseSummerFarmersMarket
          : canUseSeasonAction(season),
  execute:
    season === 'winter'
      ? executeRomanticEvening
      : season === 'spring'
        ? executeSpringAnimalAndFruit
        : season === 'summer'
          ? executeSummerFarmersMarket
          : executeAutumnThanksgiving,
})

export const seasonActionDefinitions: ActionDefinition[] =
  seasonIds.map(createSeasonActionDefinition)

export const createSeasonActionSpaces = (playerCount?: number): ActionSpace[] =>
  seasonActionDefinitions
    .filter((action) =>
      !playerCount || !action.players || action.players.includes(playerCount),
    )
    .map((action) => ({
      ...action,
      resources: { ...emptyResources },
      takenBy: [],
      blockedBy: [],
    }))

export const seasonActionIds = Object.values(seasonActionIdBySeason)
