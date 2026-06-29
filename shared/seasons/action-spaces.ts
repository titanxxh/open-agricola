import type { ActionDefinition, ActionFlow, ActionSpace, Resource } from '../contract/types'
import { breedLeaf, canBreedAnimals } from '../actions/effects/breed'
import { familyGrowthAction } from '../actions/effects/family-growth'
import { plowAction } from '../actions/effects/plow'
import { reapAction } from '../actions/effects/reap'
import { sowAction } from '../actions/effects/sow'
import { isActionDoableInFlowContext } from '../actions/flow'
import { getActionDefinition } from '../actions/index'
import { summerBreadOrSellAction, summerBreadOrSellFlow, summerSourceCard } from './internal-actions'
import {
  canAffordTypedFlatCost,
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

const seasonHostSpace = (
  season: SeasonId,
  candidate: ActionDefinition | ActionSpace | undefined,
): ActionSpace => {
  if (candidate && 'resources' in candidate && 'takenBy' in candidate) return candidate
  return {
    id: seasonActionIdBySeason[season],
    nameKey: seasonActionNameBySeason[season],
    descriptionKey: seasonActionDescriptionBySeason[season],
    roundAvailable: 1,
    gainPerRound: {},
    players: [2, 3, 4, 5, 6],
    canBeExecutedByPlayer: canUseSeasonAction(season),
    execute: () => ({ type: 'fail', errorKey: 'log.action' }),
    resources: { ...emptyResources },
    takenBy: [],
    blockedBy: [],
  }
}

const canUseFlowChildAction = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
  space: ActionSpace,
  action: ActionDefinition,
  sourceCard: string,
) =>
  isActionDoableInFlowContext({
    actionId: action.id,
    action,
    state,
    player,
    space,
    sourceCard,
    resolveAction: getActionDefinition,
  })

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
  space: ActionSpace,
): ActionFlow | undefined => {
  const canBreed = canBreedAnimals(state, player, { sourceCard: springSourceCard })
  const canSow = canUseFlowChildAction(state, player, space, sowAction, springSourceCard)
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
  function (this: ActionDefinition | ActionSpace, state, player) {
    const space = seasonHostSpace('spring', this)
    return (
    isThroughTheSeasonsSeason(state, 'spring') &&
    springAnimalAndFruitFlow(state, player, space) !== undefined
    )
  }

const executeSpringAnimalAndFruit: ActionDefinition['execute'] = ({ state, player, space }) => {
  const flow = springAnimalAndFruitFlow(state, player, space)
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
  space: ActionSpace,
): ActionFlow | undefined => {
  const children: ActionFlow[] = []
  if (canUseFlowChildAction(state, player, space, plowAction, summerSourceCard)) {
    children.push(summerPlowLeaf())
  }
  const breadOrSell = summerBreadOrSellFlow(state, player, space)
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
  function (this: ActionDefinition | ActionSpace, state, player) {
    const space = seasonHostSpace('summer', this)
    return (
    isThroughTheSeasonsSeason(state, 'summer') &&
    summerFarmersMarketFlow(state, player, space) !== undefined
    )
  }

const executeSummerFarmersMarket: ActionDefinition['execute'] = ({ state, player, space }) => {
  const flow = summerFarmersMarketFlow(state, player, space)
  if (!flow) return { type: 'fail', errorKey: 'log.action' }
  return { type: 'flow', flow }
}

const autumnPrivateFieldLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'reap',
  actionContext: { trigger: { phase: 'private-field-phase' } },
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
  if (reapAction.canBeExecutedByPlayer(state, player, {
    actionContext: { trigger: { phase: 'private-field-phase' } },
  })) {
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

const winterSourceCard = 'through-the-seasons:winter'

const canGrowWithoutRoom = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
  space: ActionSpace,
) =>
  isActionDoableInFlowContext({
    actionId: familyGrowthAction.id,
    action: familyGrowthAction,
    state,
    player,
    space,
    sourceCard: winterSourceCard,
    actionContext: { skipRoomCheck: true },
    resolveAction: getActionDefinition,
  })

const canUseRomanticEvening: ActionDefinition['canBeExecutedByPlayer'] =
  function (this: ActionDefinition | ActionSpace, state, player) {
    const space = seasonHostSpace('winter', this)
    return (
    isThroughTheSeasonsSeason(state, 'winter') &&
    canGrowWithoutRoom(state, player, space) &&
    canAffordTypedFlatCost(player, romanticEveningCost(state), undefined, state)
    )
  }

const executeRomanticEvening: ActionDefinition['execute'] = (context) => {
  if (!canGrowWithoutRoom(context.state, context.player, context.space)) {
    return { type: 'fail', errorKey: 'log.familyFull' }
  }
  return {
    type: 'flow',
    flow: {
      type: 'seq',
      sourceCard: winterSourceCard,
      children: [
        {
          type: 'leaf',
          actionId: 'pay',
          sourceCard: winterSourceCard,
          params: romanticEveningCost(context.state),
        },
        {
          type: 'leaf',
          actionId: 'family-growth',
          sourceCard: winterSourceCard,
          actionContext: { skipRoomCheck: true },
        },
      ],
    },
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
