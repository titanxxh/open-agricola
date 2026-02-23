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
  const response = await fetch(`${apiBase}/api/fence/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, edges, extraWood }),
  })
  return response.json()
}

export const validateRoom = async (
  playerId: string,
  rooms: FarmTilePosition[],
  costPerRoom: Partial<Resource>,
) => {
  const response = await fetch(`${apiBase}/api/room/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, rooms, costPerRoom }),
  })
  return response.json()
}

export const validateStable = async (
  playerId: string,
  stables: FarmTilePosition[],
) => {
  const response = await fetch(`${apiBase}/api/stable/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, stables }),
  })
  return response.json()
}

export const validatePlow = async (playerId: string, tile: FarmTilePosition) => {
  const response = await fetch(`${apiBase}/api/plow/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, tile }),
  })
  return response.json()
}

export const validateSow = async (
  playerId: string,
  crops: { row: number; col: number; crop: 'grain' | 'vegetable' }[],
) => {
  const response = await fetch(`${apiBase}/api/sow/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, crops }),
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
