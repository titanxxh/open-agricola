import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FARM_COLS,
  FARM_ROWS,
  normalizePlayerFarm,
  validateFenceSelection,
} from './fence-validation.ts'
import type { PlayerFarmState } from './fence-validation.ts'
import { validatePlowSelection } from './plow-validation.ts'
import { validateSowSelection } from './sow-validation.ts'
import {
  validateMultiTilePayload,
  validateResourcePayload,
  validateSingleTilePayload,
} from './payload-validation.ts'
import { handleGameRoute } from './game-router.ts'
import { createWsServer, getRooms } from './room-manager.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../data')
const dataFile = resolve(dataDir, 'game-state.json')

type GameState = {
  players?: PlayerFarmState[]
}

type RoomSelectionPayload = {
  playerId?: string
  rooms?: { row: number; col: number }[]
  costPerRoom?: Partial<PlayerFarmState['resources']>
}

type StableSelectionPayload = {
  playerId?: string
  stables?: { row: number; col: number }[]
}

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

const ensureDataDir = async () => {
  await fs.mkdir(dataDir, { recursive: true })
}

const readState = async (): Promise<GameState | null> => {
  try {
    const raw = await fs.readFile(dataFile, 'utf8')
    return JSON.parse(raw) as GameState
  } catch {
    return null
  }
}

const writeState = async (state: GameState) => {
  await ensureDataDir()
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2), 'utf8')
}

const parseBody = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolveBody) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolveBody(data ? (JSON.parse(data) as Record<string, unknown>) : {})
      } catch {
        resolveBody({})
      }
    })
  })

const stableWoodCost = 2
const maxStableCount = 4

const positionKey = (pos: { row: number; col: number }) =>
  `${pos.row}-${pos.col}`

const isWithinFarm = (pos: { row: number; col: number }) =>
  pos.row >= 0 && pos.row < FARM_ROWS && pos.col >= 0 && pos.col < FARM_COLS

type RoomSelectionResult =
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

type StableSelectionResult =
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

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && req.url === '/api/rooms') {
    sendJson(res, 200, { ok: true, rooms: getRooms() })
    return
  }

  if (req.url?.startsWith('/api/game/')) {
    const handled = await handleGameRoute(req, res)
    if (handled) return
  }

  if (req.method === 'GET' && req.url === '/api/state') {
    const state = await readState()
    sendJson(res, 200, { state })
    return
  }

  if (req.method === 'POST' && req.url === '/api/state') {
    const body = await parseBody(req)
    if (!body || typeof body !== 'object' || !body.state) {
      sendJson(res, 400, { error: 'Invalid state' })
      return
    }
    await writeState(body.state as GameState)
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && req.url === '/api/dev/add-resource') {
    const body = await parseBody(req)
    const { playerId, resource, amount } = body as {
      playerId?: string
      resource?: string
      amount?: number
    }
    const payloadError = validateResourcePayload({ playerId, resource, amount })
    if (payloadError) {
      sendJson(res, 400, { error: payloadError })
      return
    }
    const resourceKey = resource as keyof PlayerFarmState['resources']
    const state = await readState()
    if (!state || !Array.isArray(state.players)) {
      sendJson(res, 400, { error: 'State missing' })
      return
    }
    const player = state.players.find((p) => p.id === playerId)
    if (!player || !player.resources) {
      sendJson(res, 400, { error: 'Player not found' })
      return
    }
    const delta = Number(amount ?? 0)
    const nextValue = Math.max(0, (player.resources[resourceKey] ?? 0) + delta)
    player.resources[resourceKey] = nextValue
    await writeState(state)
    sendJson(res, 200, { state })
    return
  }

  if (req.method === 'POST' && req.url === '/api/fence/validate') {
    return
  }

  if (req.method === 'POST' && req.url === '/api/fence/validate') {
    const body = await parseBody(req)
    const { playerId, edges, extraWood } = body as {
      playerId?: string
      edges?: string[]
      extraWood?: number
    }
    if (!playerId || !Array.isArray(edges)) {
      sendJson(res, 400, { error: 'Invalid payload' })
      return
    }
    const state = await readState()
    if (!state || !Array.isArray(state.players)) {
      sendJson(res, 400, { error: 'State missing' })
      return
    }
    const playerIndex = state.players.findIndex((p) => p.id === playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { error: 'Player not found' })
      return
    }
    const player = normalizePlayerFarm(state.players[playerIndex])
    const result = validateFenceSelection(player, edges, Number(extraWood ?? 0))
    if (!result.ok) {
      sendJson(res, 200, { error: result.error })
      return
    }
    state.players[playerIndex] = result.player
    await writeState(state)
    sendJson(res, 200, { state })
    return
  }

  if (req.method === 'POST' && req.url === '/api/room/validate') {
    const body = (await parseBody(req)) as RoomSelectionPayload
    const { playerId, rooms, costPerRoom } = body
    const payloadError = validateMultiTilePayload({
      playerId,
      tiles: rooms as { row?: number; col?: number }[] | undefined,
    })
    if (payloadError || !costPerRoom) {
      sendJson(res, 400, {
        error: payloadError ?? {
          code: 'INVALID_COST',
          message: 'costPerRoom is required',
        },
      })
      return
    }
    const selectedRoomsInput = rooms ?? []
    const state = await readState()
    if (!state || !Array.isArray(state.players)) {
      sendJson(res, 400, { error: 'State missing' })
      return
    }
    const playerIndex = state.players.findIndex((p) => p.id === playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { error: 'Player not found' })
      return
    }
    const player = normalizePlayerFarm(state.players[playerIndex])
    const selection = validateRoomSelection(player, selectedRoomsInput)
    if (!selection.ok) {
      sendJson(res, 200, { error: { code: selection.code } })
      return
    }
    const selectedCount = selection.selectedKeys.size
    const totalCost: Partial<PlayerFarmState['resources']> = {}
    Object.entries(costPerRoom).forEach(([key, value]) => {
      if (typeof value !== 'number' || value <= 0) return
      const resourceKey = key as keyof PlayerFarmState['resources']
      totalCost[resourceKey] = value * selectedCount
    })
    const canPay = Object.entries(totalCost).every(([key, value]) => {
      const resourceKey = key as keyof PlayerFarmState['resources']
      const available = player.resources?.[resourceKey] ?? 0
      return (value ?? 0) <= available
    })
    if (!canPay) {
      sendJson(res, 200, { error: { code: 'NOT_ENOUGH_RESOURCES' } })
      return
    }
    Object.entries(totalCost).forEach(([key, value]) => {
      if (typeof value !== 'number') return
      const resourceKey = key as keyof PlayerFarmState['resources']
      player.resources[resourceKey] =
        (player.resources[resourceKey] ?? 0) - value
    })
    const selectedRooms = selectedRoomsInput.filter((room) =>
      selection.selectedKeys.has(positionKey(room)),
    )
    player.roomTiles = [...player.roomTiles, ...selectedRooms]
    player.rooms += selectedRooms.length
    state.players[playerIndex] = player
    await writeState(state)
    sendJson(res, 200, { state })
    return
  }

  if (req.method === 'POST' && req.url === '/api/stable/validate') {
    const body = (await parseBody(req)) as StableSelectionPayload
    const { playerId, stables } = body
    const payloadError = validateMultiTilePayload({
      playerId,
      tiles: stables as { row?: number; col?: number }[] | undefined,
    })
    if (payloadError) {
      sendJson(res, 400, { error: payloadError })
      return
    }
    const selectedStablesInput = stables ?? []
    const state = await readState()
    if (!state || !Array.isArray(state.players)) {
      sendJson(res, 400, { error: 'State missing' })
      return
    }
    const playerIndex = state.players.findIndex((p) => p.id === playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { error: 'Player not found' })
      return
    }
    const player = normalizePlayerFarm(state.players[playerIndex])
    const selection = validateStableSelection(player, selectedStablesInput)
    if (!selection.ok) {
      sendJson(res, 200, { error: { code: selection.code } })
      return
    }
    const selectedCount = selection.selectedKeys.size
    const woodCost = stableWoodCost * selectedCount
    if ((player.resources?.wood ?? 0) < woodCost) {
      sendJson(res, 200, { error: { code: 'NOT_ENOUGH_RESOURCES' } })
      return
    }
    player.resources.wood = (player.resources.wood ?? 0) - woodCost
    const selectedStables = selectedStablesInput.filter((stable) =>
      selection.selectedKeys.has(positionKey(stable)),
    )
    player.stableTiles = [...player.stableTiles, ...selectedStables]
    state.players[playerIndex] = player
    await writeState(state)
    sendJson(res, 200, { state })
    return
  }

  if (req.method === 'POST' && req.url === '/api/plow/validate') {
    const body = await parseBody(req)
    const { playerId, tile } = body as {
      playerId?: string
      tile?: { row?: number; col?: number }
    }
    const payloadError = validateSingleTilePayload({ playerId, tile })
    if (payloadError) {
      sendJson(res, 400, { error: payloadError })
      return
    }
    const selectedTile = tile as { row: number; col: number }
    const state = await readState()
    if (!state || !Array.isArray(state.players)) {
      sendJson(res, 400, { error: 'State missing' })
      return
    }
    const playerIndex = state.players.findIndex((p) => p.id === playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { error: 'Player not found' })
      return
    }
    const player = normalizePlayerFarm(state.players[playerIndex])
    const result = validatePlowSelection(player, {
      row: selectedTile.row,
      col: selectedTile.col,
    })
    if (!result.ok) {
      sendJson(res, 200, { error: result.error })
      return
    }
    state.players[playerIndex] = result.player
    await writeState(state)
    sendJson(res, 200, { state })
    return
  }

  if (req.method === 'POST' && req.url === '/api/sow/validate') {
    const body = await parseBody(req)
    const { playerId, crops } = body as {
      playerId?: string
      crops?: { row?: number; col?: number; crop?: string }[]
    }
    if (!playerId || !Array.isArray(crops)) {
      sendJson(res, 400, { error: 'Invalid payload' })
      return
    }
    const state = await readState()
    if (!state || !Array.isArray(state.players)) {
      sendJson(res, 400, { error: 'State missing' })
      return
    }
    const playerIndex = state.players.findIndex((p) => p.id === playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { error: 'Player not found' })
      return
    }
    const player = normalizePlayerFarm(state.players[playerIndex])
    const result = validateSowSelection(
      player,
      crops.map((crop) => ({
        row: Number(crop.row),
        col: Number(crop.col),
        crop: crop.crop as 'grain' | 'vegetable',
      })),
    )
    if (!result.ok) {
      sendJson(res, 200, { error: result.error })
      return
    }
    state.players[playerIndex] = result.player
    await writeState(state)
    sendJson(res, 200, { state })
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

createWsServer(server)

const PORT = Number(process.env.BACKEND_PORT) || 5175
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`)
})
