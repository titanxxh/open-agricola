import type { FarmTilePosition, Field, GameState, PlayerState } from '../contract/types'
import { positionKey } from '../domain/farm'
import { replaceTerrainWithField } from './farm-terrain'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from './types'

export type MoorSpecialActionPayload = {
  tile?: FarmTilePosition
}

export const isMoorTerrainAction = (actionId: MoorSpecialActionId): boolean =>
  actionId === 'cut-peat' || actionId === 'fell-trees' || actionId === 'slash-and-burn'

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
  if (card.location.kind === 'playerFaceUp' && player.resources.food < 2) {
    return { ok: false, error: 'not enough food' }
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
): { ok: true } | { ok: false; error: string } => {
  const validation = validateMoorSpecialAction(state, playerIndex, cardId, actionId, payload)
  if (!validation.ok) return validation
  const player = state.players[playerIndex]!
  const card = state.farmersOfTheMoor!.specialActionCards.find((candidate) => candidate.id === cardId)!

  switch (actionId) {
    case 'cut-peat':
      if (!removeTerrain(player, payload.tile, 'moor')) return { ok: false, error: 'terrain unavailable' }
      player.resources.fuel = (player.resources.fuel ?? 0) + 3
      break
    case 'fell-trees':
      if (!removeTerrain(player, payload.tile, 'forest')) return { ok: false, error: 'terrain unavailable' }
      player.resources.wood += 2
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
    default:
      return { ok: false, error: 'special action unavailable' }
  }

  if (card.location.kind === 'market') {
    card.location = { kind: 'playerFaceUp', playerId: player.id }
  } else {
    player.resources.food -= 2
    card.location = { kind: 'playerFaceDown', playerId: player.id }
  }
  return { ok: true }
}

export const resetMoorSpecialActionCards = (state: GameState): void => {
  state.farmersOfTheMoor?.specialActionCards.forEach((card) => {
    card.location = { kind: 'market' }
  })
}
