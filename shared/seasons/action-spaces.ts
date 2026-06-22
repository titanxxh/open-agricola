import type { ActionDefinition, ActionSpace, Resource } from '../contract/types'
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

const createSeasonActionDefinition = (season: SeasonId): ActionDefinition => ({
  id: seasonActionIdBySeason[season],
  nameKey: seasonActionNameBySeason[season],
  descriptionKey: seasonActionDescriptionBySeason[season],
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4, 5, 6],
  strictCanExecute: true,
  canBeExecutedByPlayer: canUseSeasonAction(season),
  execute: () => ({ type: 'ok' }),
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
