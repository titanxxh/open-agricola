import type { PlayerFarmState } from './fence-validation.ts'
import { FARM_COLS, FARM_ROWS } from './fence-validation.ts'

const positionKey = (pos: { row: number; col: number }) =>
  `${pos.row}-${pos.col}`

const isWithinFarm = (pos: { row: number; col: number }) =>
  pos.row >= 0 && pos.row < FARM_ROWS && pos.col >= 0 && pos.col < FARM_COLS

export type RoomSelectionResult =
  | { ok: true; selectedKeys: Set<string> }
  | { ok: false; code: string }

export const validateRoomSelection = (
  player: PlayerFarmState,
  rooms: { row: number; col: number }[],
): RoomSelectionResult => {
  if (rooms.length === 0) {
    return { ok: false, code: 'NO_SELECTION' }
  }
  const roomSet = new Set(player.roomTiles.map(positionKey))
  const fieldSet = new Set(
    (player.fields ?? []).map((field) => positionKey(field)),
  )
  const stableSet = new Set(
    (player.stableTiles ?? []).map((tile) => positionKey(tile)),
  )
  const pastureSet = new Set(
    (player.pastures ?? [])
      .flatMap((pasture) => pasture.tiles ?? [])
      .map(positionKey),
  )
  const selectedSet = new Set<string>()
  for (const room of rooms) {
    if (!isWithinFarm(room)) {
      return { ok: false, code: 'INVALID_POSITION' }
    }
    const key = positionKey(room)
    if (selectedSet.has(key)) continue
    if (roomSet.has(key) || fieldSet.has(key) || stableSet.has(key) || pastureSet.has(key)) {
      return { ok: false, code: 'OCCUPIED' }
    }
    selectedSet.add(key)
  }
  if (selectedSet.size === 0) {
    return { ok: false, code: 'NO_SELECTION' }
  }
  const visited = new Set(roomSet)
  const queue = player.roomTiles.map((tile) => ({ row: tile.row, col: tile.col }))
  const directions = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    directions.forEach((dir) => {
      const next = { row: current.row + dir.dr, col: current.col + dir.dc }
      if (!isWithinFarm(next)) return
      const key = positionKey(next)
      if (!selectedSet.has(key) || visited.has(key)) return
      visited.add(key)
      queue.push(next)
    })
  }
  const allConnected = Array.from(selectedSet).every((key) => visited.has(key))
  if (!allConnected) {
    return { ok: false, code: 'NOT_CONNECTED' }
  }
  return { ok: true, selectedKeys: selectedSet }
}

const maxStableCount = 4

export type StableSelectionResult =
  | { ok: true; selectedKeys: Set<string> }
  | { ok: false; code: string }

export const validateStableSelection = (
  player: PlayerFarmState,
  stables: { row: number; col: number }[],
): StableSelectionResult => {
  if (stables.length === 0) {
    return { ok: false, code: 'NO_SELECTION' }
  }
  const roomSet = new Set(player.roomTiles.map(positionKey))
  const fieldSet = new Set(
    (player.fields ?? []).map((field) => positionKey(field)),
  )
  const stableSet = new Set(
    (player.stableTiles ?? []).map((tile) => positionKey(tile)),
  )
  const selectedSet = new Set<string>()
  for (const stable of stables) {
    if (!isWithinFarm(stable)) {
      return { ok: false, code: 'INVALID_POSITION' }
    }
    const key = positionKey(stable)
    if (selectedSet.has(key)) continue
    if (roomSet.has(key) || fieldSet.has(key) || stableSet.has(key)) {
      return { ok: false, code: 'OCCUPIED' }
    }
    selectedSet.add(key)
  }
  if (selectedSet.size === 0) {
    return { ok: false, code: 'NO_SELECTION' }
  }
  if (stableSet.size + selectedSet.size > maxStableCount) {
    return { ok: false, code: 'LIMIT_REACHED' }
  }
  return { ok: true, selectedKeys: selectedSet }
}
