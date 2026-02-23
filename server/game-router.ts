import type { IncomingMessage, ServerResponse } from 'node:http'
import { GameSession } from './game-session.ts'

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

  if (req.method === 'POST' && req.url === '/api/game/new') {
    session = new GameSession()
    const resp = getSession().getState()
    sendJson(res, 200, { ...resp, state: stripFunctions(resp.state) })
    return true
  }

  return false
}
