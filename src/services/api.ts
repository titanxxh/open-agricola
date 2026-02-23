import type { FarmTilePosition, GameState, Resource } from '../../shared/game/types'

const apiBase = 'http://localhost:5175'

export const fetchState = async () => {
  const response = await fetch(`${apiBase}/api/state`)
  return response.json()
}

export const persistGame = async (nextState: GameState) => {
  const payload = {
    ...nextState,
    actionSpaces: nextState.actionSpaces.map(
      ({ canBeExecutedByPlayer, execute, resolveChoice, ...rest }) => rest,
    ),
    roundStartSnapshot: null,
  }
  await fetch(`${apiBase}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: payload }),
  })
}

export const validateFence = async (
  playerId: string,
  edges: string[],
  extraWood: number,
) => {
  const response = await fetch(`${apiBase}/api/game/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'fence', playerId, payload: { edges, extraWood } }),
  })
  return response.json()
}

export const validateRoom = async (
  playerId: string,
  rooms: FarmTilePosition[],
  costPerRoom: Partial<Resource>,
) => {
  const response = await fetch(`${apiBase}/api/game/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'room', playerId, payload: { rooms, costPerRoom } }),
  })
  return response.json()
}

export const validateStable = async (
  playerId: string,
  stables: FarmTilePosition[],
) => {
  const response = await fetch(`${apiBase}/api/game/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'stable', playerId, payload: { stables } }),
  })
  return response.json()
}

export const validatePlow = async (playerId: string, tile: FarmTilePosition) => {
  const response = await fetch(`${apiBase}/api/game/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'plow', playerId, payload: { tile } }),
  })
  return response.json()
}

export const validateSow = async (
  playerId: string,
  crops: { row: number; col: number; crop: 'grain' | 'vegetable' }[],
) => {
  const response = await fetch(`${apiBase}/api/game/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'sow', playerId, payload: { crops } }),
  })
  return response.json()
}

export const addResource = async (
  playerId: string,
  resource: keyof Resource,
  amount: number,
) => {
  const response = await fetch(`${apiBase}/api/dev/add-resource`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, resource, amount }),
  })
  return response.json()
}
