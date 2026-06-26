import type { ActionFlow, ActionSpace, FarmTilePosition, Field, GameState, PlayerState, Resource } from '../contract/types'
import { getMajorCard } from '../cards/major'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../cards/registry-display'
import { positionKey } from '../domain/farm'
import { improvementAction } from '../actions/effects/improvement'
import { replaceTerrainWithField } from './farm-terrain'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from './types'

export type MoorSpecialActionPayload = {
  tile?: FarmTilePosition
}

export const isMoorTerrainAction = (actionId: MoorSpecialActionId): boolean =>
  actionId === 'cut-peat' || actionId === 'fell-trees' || actionId === 'slash-and-burn'

const emptyResources = (): Resource => ({
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
  fuel: 0,
  horse: 0,
})

export const createMoorSpecialActionSpace = (actionId: MoorSpecialActionId): ActionSpace => ({
  id: actionId,
  nameKey: `actions.${actionId}.name`,
  descriptionKey: `actions.${actionId}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: emptyResources(),
  takenBy: [],
})

export const isMoorSpecialActionCardUsableByPlayer = (
  card: MoorSpecialActionCardState,
  playerId: string,
): boolean => {
  if (card.location.kind === 'market') return true
  if (card.location.kind === 'playerFaceUp') return card.location.playerId !== playerId
  return false
}

const removeTerrain = (
  player: PlayerState,
  tile: FarmTilePosition | undefined,
  kind: 'forest' | 'moor',
): boolean => {
  if (!tile) return false
  const key = positionKey(tile)
  const index = (player.farmTerrain ?? []).findIndex((entry) => positionKey(entry) === key)
  if (index < 0 || player.farmTerrain![index]!.kind !== kind) return false
  player.farmTerrain = player.farmTerrain!.filter((_, idx) => idx !== index)
  return true
}

const hasTerrain = (
  player: PlayerState,
  tile: FarmTilePosition | undefined,
  kind: 'forest' | 'moor',
): boolean => {
  if (!tile) return false
  const key = positionKey(tile)
  return (player.farmTerrain ?? []).some((entry) =>
    positionKey(entry) === key && entry.kind === kind)
}

const hasAdjacentField = (fields: readonly Field[], tile: FarmTilePosition): boolean => {
  const fieldKeys = new Set(fields.map((field) => positionKey(field)))
  return [
    { row: tile.row - 1, col: tile.col },
    { row: tile.row + 1, col: tile.col },
    { row: tile.row, col: tile.col - 1 },
    { row: tile.row, col: tile.col + 1 },
  ].some((neighbor) => fieldKeys.has(positionKey(neighbor)))
}

const horseMarketFoodCost = (state: GameState): number =>
  [2, 5, 6].includes(state.players.length) ? 1 : 0

const improvementFlow = (types: readonly ('major' | 'minor')[]): ActionFlow => ({
  type: 'leaf',
  actionId: 'improvement',
  actionContext: { types: [...types] },
})

const canExecuteImprovementFlow = (
  state: GameState,
  player: PlayerState,
  types: readonly ('major' | 'minor')[],
): boolean =>
  improvementAction.canBeExecutedByPlayer(state, player, {
    actionContext: { types: [...types] },
  })

const applyMoorSpecialActionBonuses = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
): void => {
  if (state.enableFarmersOfTheMoor !== true) return
  const resources = player.resources as Record<keyof Resource, number | undefined>
  const cards = [
    ...(player.improvements ?? []).map((cardId) => getMajorCard(cardId)),
    ...(player.minorPlayed ?? []).map((cardId) => getRegisteredMinorImprovement(cardId)),
    ...(player.occupationPlayed ?? []).map((cardId) => getRegisteredOccupation(cardId)),
  ]
  for (const card of cards) {
    for (const bonus of card?.moorSpecialActionBonuses ?? []) {
      if (bonus.actionId !== actionId) continue
      const amount = (resources.horse ?? 0) > 0 && bonus.horseAmount !== undefined
        ? bonus.horseAmount
        : bonus.amount
      if (amount <= 0) continue
      resources[bonus.resource] = (resources[bonus.resource] ?? 0) + amount
    }
  }
}

export const validateMoorSpecialAction = (
  state: GameState,
  playerIndex: number,
  cardId: string,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload = {},
): { ok: true } | { ok: false; error: string } => {
  const player = state.players[playerIndex]
  const farmersOfTheMoor = state.farmersOfTheMoor
  if (!player || !farmersOfTheMoor) return { ok: false, error: 'farmers of the moor unavailable' }
  const card = farmersOfTheMoor.specialActionCards.find((candidate) => candidate.id === cardId)
  if (!card || !card.actions.includes(actionId)) return { ok: false, error: 'special action unavailable' }
  if (!isMoorSpecialActionCardUsableByPlayer(card, player.id)) {
    return { ok: false, error: 'special action unavailable' }
  }
  const requiredFood =
    (card.location.kind === 'playerFaceUp' ? 2 : 0) +
    (actionId === 'horse-market' ? horseMarketFoodCost(state) : 0) +
    (actionId === 'illicit-work' ? 1 : 0)
  if (player.resources.food < requiredFood) {
    return { ok: false, error: 'not enough food' }
  }
  const requiredFuel =
    actionId === 'black-market' || actionId === 'illicit-work' ? 1 : 0
  if ((player.resources.fuel ?? 0) < requiredFuel) {
    return { ok: false, error: 'not enough fuel' }
  }

  switch (actionId) {
    case 'cut-peat':
      if (!hasTerrain(player, payload.tile, 'moor')) return { ok: false, error: 'terrain unavailable' }
      break
    case 'fell-trees':
      if (!hasTerrain(player, payload.tile, 'forest')) return { ok: false, error: 'terrain unavailable' }
      break
    case 'slash-and-burn':
      if (!payload.tile || !hasTerrain(player, payload.tile, 'forest')) {
        return { ok: false, error: 'terrain unavailable' }
      }
      if ((player.fields ?? []).length > 0 && !hasAdjacentField(player.fields, payload.tile)) {
        return { ok: false, error: 'terrain unavailable' }
      }
      break
    case 'hiring-fair':
      break
    case 'horse-market':
      break
    case 'black-market':
      if (!canExecuteImprovementFlow(state, player, ['minor'])) {
        return { ok: false, error: 'special action unavailable' }
      }
      break
    case 'illicit-work':
      if (!canExecuteImprovementFlow(state, player, ['major'])) {
        return { ok: false, error: 'special action unavailable' }
      }
      break
    default:
      return { ok: false, error: 'special action unavailable' }
  }
  return { ok: true }
}

export const applyMoorSpecialAction = (
  state: GameState,
  playerIndex: number,
  cardId: string,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload = {},
): { ok: true; followUpFlow?: ActionFlow } | { ok: false; error: string } => {
  const validation = validateMoorSpecialAction(state, playerIndex, cardId, actionId, payload)
  if (!validation.ok) return validation
  const player = state.players[playerIndex]!
  const card = state.farmersOfTheMoor!.specialActionCards.find((candidate) => candidate.id === cardId)!
  let followUpFlow: ActionFlow | undefined

  switch (actionId) {
    case 'cut-peat':
      if (!removeTerrain(player, payload.tile, 'moor')) return { ok: false, error: 'terrain unavailable' }
      player.resources.fuel = (player.resources.fuel ?? 0) + 3
      applyMoorSpecialActionBonuses(state, player, actionId)
      break
    case 'fell-trees':
      if (!removeTerrain(player, payload.tile, 'forest')) return { ok: false, error: 'terrain unavailable' }
      player.resources.wood += 2
      applyMoorSpecialActionBonuses(state, player, actionId)
      break
    case 'slash-and-burn': {
      if (!payload.tile) return { ok: false, error: 'terrain unavailable' }
      const result = replaceTerrainWithField(player, payload.tile, 'forest')
      if (!result.ok) return { ok: false, error: 'terrain unavailable' }
      break
    }
    case 'hiring-fair':
      player.resources.food += state.players.length === 3 ? 2 : 1
      break
    case 'horse-market':
      player.resources.food -= horseMarketFoodCost(state)
      player.resources.horse = (player.resources.horse ?? 0) + 1
      break
    case 'black-market':
      player.resources.fuel = (player.resources.fuel ?? 0) - 1
      followUpFlow = improvementFlow(['minor'])
      break
    case 'illicit-work':
      player.resources.food -= 1
      player.resources.fuel = (player.resources.fuel ?? 0) - 1
      followUpFlow = improvementFlow(['major'])
      break
    default:
      return { ok: false, error: 'special action unavailable' }
  }

  if (card.location.kind === 'market') {
    card.location = { kind: 'playerFaceUp', playerId: player.id }
  } else {
    player.resources.food -= 2
    card.location = { kind: 'playerFaceDown', playerId: player.id }
  }
  return followUpFlow ? { ok: true, followUpFlow } : { ok: true }
}

export const resetMoorSpecialActionCards = (state: GameState): void => {
  state.farmersOfTheMoor?.specialActionCards.forEach((card) => {
    card.location = { kind: 'market' }
  })
}
