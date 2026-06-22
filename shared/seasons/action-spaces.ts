import type { ActionDefinition, ActionFlow, ActionSpace, Resource } from '../contract/types'
import { breedLeaf } from '../actions/effects/breed'
import { familyGrowthAction } from '../actions/effects/family-growth'
import { sowAction } from '../actions/effects/sow'
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
): ActionFlow => {
  const canSow = sowAction.canBeExecutedByPlayer(state, player)
  const children: ActionFlow[] = [
    springBreedLeaf('actions.breed.name'),
  ]
  if (canSow) {
    children.push(
      springSowLeaf('actions.sow.name'),
      {
        type: 'seq',
        sourceCard: springSourceCard,
        choiceLabelKey: 'actions.season-spring-animal-and-fruit.option-breed-sow',
        children: [
          springBreedLeaf(),
          springSowLeaf(),
        ],
      },
      {
        type: 'seq',
        sourceCard: springSourceCard,
        choiceLabelKey: 'actions.season-spring-animal-and-fruit.option-sow-breed',
        children: [
          springSowLeaf(),
          springBreedLeaf(),
        ],
      },
    )
  }
  return {
    type: 'xor',
    children,
  }
}

const executeSpringAnimalAndFruit: ActionDefinition['execute'] = ({ state, player }) => ({
  type: 'flow',
  flow: springAnimalAndFruitFlow(state, player),
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
    season === 'winter' ? canUseRomanticEvening : canUseSeasonAction(season),
  execute:
    season === 'winter'
      ? executeRomanticEvening
      : season === 'spring'
        ? executeSpringAnimalAndFruit
        : () => ({ type: 'ok' }),
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
