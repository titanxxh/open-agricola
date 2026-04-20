import type { PlayerFarmState } from '../shared/logic/farm/fence-validation'

export type ApiValidationError = {
  code: string
  message: string
}

const resourceKeys = new Set([
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
])

export const validateResourcePayload = (payload: {
  playerId?: string
  resource?: string
  amount?: number
}): ApiValidationError | null => {
  if (!payload.playerId) {
    return { code: 'INVALID_PLAYER', message: 'playerId is required' }
  }
  if (!payload.resource || !resourceKeys.has(payload.resource)) {
    return { code: 'INVALID_RESOURCE', message: 'resource is invalid' }
  }
  if (payload.amount !== undefined && !Number.isFinite(Number(payload.amount))) {
    return { code: 'INVALID_AMOUNT', message: 'amount must be a number' }
  }
  return null
}

type Position = { row?: number; col?: number }

const isFinitePosition = (position: Position) =>
  Number.isFinite(position.row) && Number.isFinite(position.col)

export const validateSingleTilePayload = (payload: {
  playerId?: string
  tile?: Position
}): ApiValidationError | null => {
  if (!payload.playerId) {
    return { code: 'INVALID_PLAYER', message: 'playerId is required' }
  }
  if (!payload.tile || !isFinitePosition(payload.tile)) {
    return { code: 'INVALID_TILE', message: 'tile must include row and col' }
  }
  return null
}

export const validateMultiTilePayload = (payload: {
  playerId?: string
  tiles?: Position[]
}): ApiValidationError | null => {
  if (!payload.playerId) {
    return { code: 'INVALID_PLAYER', message: 'playerId is required' }
  }
  if (!Array.isArray(payload.tiles) || payload.tiles.length === 0) {
    return { code: 'INVALID_TILES', message: 'tiles must be a non-empty array' }
  }
  const invalid = payload.tiles.some((tile) => !isFinitePosition(tile))
  if (invalid) {
    return { code: 'INVALID_TILE', message: 'each tile must include row and col' }
  }
  return null
}

export const hasPlayer = (
  players: PlayerFarmState[] | undefined,
  playerId: string | undefined,
) => !!playerId && Array.isArray(players) && players.some((item) => item.id === playerId)
