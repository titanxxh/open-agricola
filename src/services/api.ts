import type { FarmTilePosition, Resource } from '../../shared/game/types'

const backendHost =
  typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const apiBase =
  import.meta.env.VITE_API_BASE || `http://${backendHost}:5175`

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

