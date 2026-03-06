import type { IncomingMessage, ServerResponse } from 'node:http'
import { GameSession } from './game-session.ts'
import { normalizePlayerFarm, validateFenceSelection } from './fence-validation.ts'
import { validateRoomSelection, validateStableSelection } from './index.ts'
import { validatePlowSelection } from './plow-validation.ts'
import { validateSowSelection } from './sow-validation.ts'
import type { Resource } from '../shared/game/types.ts'

let session: GameSession | null = null

const getSession = (): GameSession => {
  if (!session) session = new GameSession()
  return session
}

export const setSession = (s: GameSession) => { session = s }

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

const stripFunctions = (state: unknown) => {
  const s = state as Record<string, unknown>
  const result: Record<string, unknown> = { ...s, roundStartSnapshot: null }
  if (s && Array.isArray(s.actionSpaces)) {
    result.actionSpaces = (s.actionSpaces as Record<string, unknown>[]).map(
      ({ canBeExecutedByPlayer, execute, resolveChoice, flow, ...rest }) => rest,
    )
  }
  return result
}

export const handleGameRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, null)
    return true
  }

  if (req.method === 'GET' && req.url === '/api/game/state') {
    const resp = getSession().getState()
    sendJson(res, 200, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/action') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; spaceId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.spaceId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSession().takeAction(body.playerIndex, body.spaceId)
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/choice') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; value?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.value !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSession().resolveChoice(body.playerIndex, body.value)
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/reorg') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; zones?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.zones)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSession().confirmAnimalReorg(body.playerIndex, body.zones as Parameters<GameSession['confirmAnimalReorg']>[1])
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/feed') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; selections?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.selections)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSession().confirmHarvestFeed(body.playerIndex, body.selections as Parameters<GameSession['confirmHarvestFeed']>[1])
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/next-player') {
    const resp = getSession().confirmNextPlayer()
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/round-end') {
    const resp = getSession().performRoundEnd()
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo') {
    const resp = getSession().undoStep()
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo-action') {
    const resp = getSession().undoAction()
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/game/actions')) {
    const url = new URL(req.url, 'http://localhost')
    const playerIndex = Number(url.searchParams.get('playerIndex') ?? '0')
    const actions = getSession().getAvailableActions(playerIndex)
    sendJson(res, 200, { ok: true, actions })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/load') {
    const body = JSON.parse(await readBody(req)) as { state?: unknown }
    if (!body.state) {
      sendJson(res, 400, { ok: false, error: 'missing state' })
      return true
    }
    const resp = getSession().loadState(body.state)
    sendJson(res, 200, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/create-pasture') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSession().startDevFenceSelect(body.playerIndex)
    sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/validate') {
    const body = JSON.parse(await readBody(req)) as {
      type: 'fence' | 'room' | 'stable' | 'plow' | 'sow'
      playerId: string
      payload: any
    }
    const state = getSession().getRawState()
    const playerIndex = state.players.findIndex((p) => p.id === body.playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { valid: false, error: 'Player not found' })
      return true
    }
    const player = normalizePlayerFarm(state.players[playerIndex] as any)

    if (body.type === 'fence') {
      const { edges, extraWood } = body.payload
      const result = validateFenceSelection(player, edges, extraWood)
      if (result.ok) {
        state.players[playerIndex] = result.player
      }
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result })
      return true
    }
    if (body.type === 'room') {
      const { rooms, costPerRoom } = body.payload
      const selection = validateRoomSelection(player, rooms)
      if (!selection.ok) {
        sendJson(res, 200, { valid: false, error: selection.code })
        return true
      }
      const playerResources = player.resources || {}
      const costKeys = Object.keys(costPerRoom) as (keyof Resource)[]
      let totalCost: Partial<Resource> = {}
      for (const key of costKeys) {
        const required = (costPerRoom[key] ?? 0) * rooms.length
        const available = playerResources[key] ?? 0
        if (available < required) {
          sendJson(res, 200, { valid: false, error: `Not enough ${key}` })
          return true
        }
        totalCost[key] = required
      }
      for (const key of costKeys) {
        player.resources[key] = (player.resources[key] ?? 0) - (totalCost[key] ?? 0)
      }
      player.roomTiles = [...player.roomTiles, ...rooms]
      player.rooms += rooms.length
      state.players[playerIndex] = player

      sendJson(res, 200, { valid: true })
      return true
    }
    if (body.type === 'stable') {
      const { stables } = body.payload
      const selection = validateStableSelection(player, stables)
      if (!selection.ok) {
        sendJson(res, 200, { valid: false, error: selection.code })
        return true
      }
      const woodRequired = stables.length * 2
      if ((player.resources?.wood ?? 0) < woodRequired) {
        sendJson(res, 200, { valid: false, error: 'Not enough wood' })
        return true
      }
      player.resources.wood = (player.resources.wood ?? 0) - woodRequired
      player.stableTiles = [...player.stableTiles, ...stables]
      state.players[playerIndex] = player

      sendJson(res, 200, { valid: true })
      return true
    }
    if (body.type === 'plow') {
      const { tile } = body.payload
      const result = validatePlowSelection(player, tile)
      if (result.ok) {
        state.players[playerIndex] = result.player
      }
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    if (body.type === 'sow') {
      const { crops } = body.payload
      const result = validateSowSelection(player, crops)
      if (result.ok) {
        state.players[playerIndex] = result.player
      }
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    sendJson(res, 400, { valid: false, error: 'Unknown validation type' })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/new') {
    session = new GameSession()
    const resp = getSession().getState()
    sendJson(res, 200, { ...resp, state: stripFunctions(resp.state) })
    return true
  }



  if (req.method === 'POST' && req.url === '/api/game/dev/play-card') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; cardId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.cardId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const state = getSession().getRawState()
    const player = state.players[body.playerIndex]
    if (!player) {
      sendJson(res, 400, { ok: false, error: 'player not found' })
      return true
    }
    if (!player.minorPlayed.includes(body.cardId)) {
      player.minorPlayed.push(body.cardId)
    }
    sendJson(res, 200, { ok: true, state: stripFunctions(state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-space-taken') {
    const body = JSON.parse(await readBody(req)) as { spaceId?: string; playerId?: string | null }
    if (typeof body.spaceId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const state = getSession().getRawState()
    const space = state.actionSpaces.find((s) => s.id === body.spaceId)
    if (!space) {
      sendJson(res, 400, { ok: false, error: 'space not found' })
      return true
    }
    space.takenBy = body.playerId ?? null
    sendJson(res, 200, { ok: true, state: stripFunctions(state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-current-player') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const state = getSession().getRawState()
    if (body.playerIndex < 0 || body.playerIndex >= state.players.length) {
      sendJson(res, 400, { ok: false, error: 'invalid player index' })
      return true
    }
    state.currentPlayerIndex = body.playerIndex
    sendJson(res, 200, { ok: true, state: stripFunctions(state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-resources') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; resources?: Record<string, number> }
    if (typeof body.playerIndex !== 'number' || !body.resources || typeof body.resources !== 'object') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const state = getSession().getRawState()
    const player = state.players[body.playerIndex]
    if (!player) {
      sendJson(res, 400, { ok: false, error: 'player not found' })
      return true
    }
    Object.entries(body.resources).forEach(([key, value]) => {
      if (typeof value === 'number') {
        (player.resources as Record<string, number>)[key] = value
      }
    })
    sendJson(res, 200, { ok: true, state: stripFunctions(state) })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/add-rooms') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; rooms?: Array<{ row: number; col: number }> }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.rooms)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const state = getSession().getRawState()
    const player = state.players[body.playerIndex]
    if (!player) {
      sendJson(res, 400, { ok: false, error: 'player not found' })
      return true
    }
    // Add room tiles
    player.roomTiles = [...player.roomTiles, ...body.rooms]
    player.rooms = (player.rooms || 0) + body.rooms.length
    sendJson(res, 200, { ok: true, state: stripFunctions(state) })
    return true
  }

  // Dev: Set round
  if (req.method === 'POST' && req.url === '/api/game/dev/set-round') {
    const body = JSON.parse(await readBody(req)) as { round?: number }
    if (typeof body.round !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid round' })
      return true
    }
    const state = getSession().getRawState()
    state.round = body.round
    sendJson(res, 200, { ok: true, state: stripFunctions(state) })
    return true
  }

return false
}
