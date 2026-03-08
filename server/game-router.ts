import type { IncomingMessage, ServerResponse } from 'node:http'
import { GameSession } from './game-session.ts'
import { normalizePlayerFarm, validateFenceSelection } from './fence-validation.ts'
import { validateRoomSelection, validateStableSelection } from './validators.ts'
import { validatePlowSelection } from './plow-validation.ts'
import { validateSowSelection } from './sow-validation.ts'
import { serializeState } from '../shared/game/serialization.ts'
import type { Resource } from '../shared/game/types.ts'

let session: GameSession | null = null

const getSingletonSession = (): GameSession => {
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

const respondWith = (resp: import('./game-session.ts').SessionResponse) => ({
  ...resp,
  state: serializeState(resp.state),
})

export const handleGameRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, null)
    return true
  }

  if (req.method === 'GET' && req.url === '/api/game/state') {
    const resp = getSingletonSession().getState()
    sendJson(res, 200, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/action') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; spaceId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.spaceId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().takeAction(body.playerIndex, body.spaceId)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/choice') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; value?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.value !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().resolveChoice(body.playerIndex, body.value)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/reorg') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; zones?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.zones)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().confirmAnimalReorg(body.playerIndex, body.zones as Parameters<GameSession['confirmAnimalReorg']>[1])
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/feed') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; selections?: unknown[] }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.selections)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().confirmHarvestFeed(body.playerIndex, body.selections as Parameters<GameSession['confirmHarvestFeed']>[1])
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/next-player') {
    const resp = getSingletonSession().confirmNextPlayer()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/confirm-player-switch') {
    const resp = getSingletonSession().confirmPlayerSwitch()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/round-end') {
    const resp = getSingletonSession().performRoundEnd()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo') {
    const resp = getSingletonSession().undoStep()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/undo-action') {
    const resp = getSingletonSession().undoAction()
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/game/actions')) {
    const url = new URL(req.url, 'http://localhost')
    const playerIndex = Number(url.searchParams.get('playerIndex') ?? '0')
    const actions = getSingletonSession().getAvailableActions(playerIndex)
    sendJson(res, 200, { ok: true, actions })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/load') {
    const body = JSON.parse(await readBody(req)) as { state?: unknown }
    if (!body.state) {
      sendJson(res, 400, { ok: false, error: 'missing state' })
      return true
    }
    const resp = getSingletonSession().loadState(body.state)
    sendJson(res, 200, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/create-pasture') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().startDevFenceSelect(body.playerIndex)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/commit-farm') {
    const body = JSON.parse(await readBody(req)) as {
      playerIndex?: number
      farmType?: 'fence' | 'room' | 'stable' | 'plow' | 'sow'
      payload?: Record<string, unknown>
    }
    if (typeof body.playerIndex !== 'number' || !body.farmType || !body.payload) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().commitFarmChoice(body.playerIndex, body.farmType, body.payload)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/validate') {
    const body = JSON.parse(await readBody(req)) as {
      type: 'fence' | 'room' | 'stable' | 'plow' | 'sow'
      playerId: string
      payload: Record<string, unknown>
    }
    const state = getSingletonSession().getStateForRead()
    const playerIndex = state.players.findIndex((p) => p.id === body.playerId)
    if (playerIndex === -1) {
      sendJson(res, 400, { valid: false, error: 'Player not found' })
      return true
    }
    const player = normalizePlayerFarm(state.players[playerIndex] as Parameters<typeof normalizePlayerFarm>[0])

    if (body.type === 'fence') {
      const { edges, extraWood } = body.payload as { edges: string[]; extraWood?: number }
      const result = validateFenceSelection(player, edges, extraWood ?? 0)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result })
      return true
    }
    if (body.type === 'room') {
      const { rooms, costPerRoom } = body.payload as { rooms: { row: number; col: number }[]; costPerRoom: Partial<Resource> }
      const selection = validateRoomSelection(player, rooms)
      if (!selection.ok) {
        sendJson(res, 200, { valid: false, error: selection.code })
        return true
      }
      const costKeys = Object.keys(costPerRoom) as (keyof Resource)[]
      for (const key of costKeys) {
        const required = (costPerRoom[key] ?? 0) * rooms.length
        const available = player.resources[key] ?? 0
        if (available < required) {
          sendJson(res, 200, { valid: false, error: `Not enough ${key}` })
          return true
        }
      }
      sendJson(res, 200, { valid: true })
      return true
    }
    if (body.type === 'stable') {
      const { stables } = body.payload as { stables: { row: number; col: number }[] }
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
      sendJson(res, 200, { valid: true })
      return true
    }
    if (body.type === 'plow') {
      const { tile } = body.payload as { tile: { row: number; col: number } }
      const result = validatePlowSelection(player, tile)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    if (body.type === 'sow') {
      const { crops } = body.payload as { crops: { row: number; col: number; crop: 'grain' | 'vegetable' }[] }
      const result = validateSowSelection(player, crops)
      sendJson(res, 200, { valid: result.ok, error: result.ok ? null : result.error })
      return true
    }
    sendJson(res, 400, { valid: false, error: 'Unknown validation type' })
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/new') {
    let seed: number | undefined
    try {
      const body = JSON.parse(await readBody(req)) as { seed?: number }
      if (typeof body.seed === 'number') seed = body.seed
    } catch { /* no body or invalid JSON — use random seed */ }
    session = new GameSession(seed)
    const resp = getSingletonSession().getState()
    sendJson(res, 200, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/play-card') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; cardId?: string }
    if (typeof body.playerIndex !== 'number' || typeof body.cardId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devPlayCard(body.playerIndex, body.cardId)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-space-taken') {
    const body = JSON.parse(await readBody(req)) as { spaceId?: string; playerId?: string | null }
    if (typeof body.spaceId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devSetSpaceTaken(body.spaceId, body.playerId ?? null)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-current-player') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number }
    if (typeof body.playerIndex !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devSetCurrentPlayer(body.playerIndex)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-resources') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; resources?: Record<string, number> }
    if (typeof body.playerIndex !== 'number' || !body.resources || typeof body.resources !== 'object') {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devSetResources(body.playerIndex, body.resources)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/add-rooms') {
    const body = JSON.parse(await readBody(req)) as { playerIndex?: number; rooms?: Array<{ row: number; col: number }> }
    if (typeof body.playerIndex !== 'number' || !Array.isArray(body.rooms)) {
      sendJson(res, 400, { ok: false, error: 'invalid payload' })
      return true
    }
    const resp = getSingletonSession().devAddRooms(body.playerIndex, body.rooms)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

  if (req.method === 'POST' && req.url === '/api/game/dev/set-round') {
    const body = JSON.parse(await readBody(req)) as { round?: number }
    if (typeof body.round !== 'number') {
      sendJson(res, 400, { ok: false, error: 'invalid round' })
      return true
    }
    const resp = getSingletonSession().devSetRound(body.round)
    sendJson(res, resp.ok ? 200 : 400, respondWith(resp))
    return true
  }

return false
}
