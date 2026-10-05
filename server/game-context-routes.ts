import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthUser } from './auth.ts'
import { corsHeaders } from './http-origin.ts'
import type { GameContextError, GameContextResponse } from '../shared/contract/protocol/game-context.ts'
import { GameContextStore } from './game/game-context-store.ts'

const CONTEXT_ROUTE = /^\/api\/v1\/game-contexts\/([^/]+)$/
const CONTEXT_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/

const errorStatus = (error: GameContextError): number => {
  switch (error.code) {
    case 'invalid_context_link':
      return 400
    case 'login_required':
      return 401
    case 'not_participant':
      return 403
    case 'unknown_context':
      return 404
    case 'anchor_mismatch':
    case 'context_changed':
      return 409
    case 'context_expired':
    case 'context_removed':
      return 410
    case 'rate_limited':
      return 429
    case 'replay_segment_unavailable':
    case 'viewer_unavailable':
      return 503
  }
}

const contextReturnTo = (roomId: string): string => {
  const params = new URLSearchParams({ context: roomId })
  const configured = process.env.PUBLIC_APP_ORIGIN?.trim()
  if (!configured) return `/?${params.toString()}`
  try {
    const url = new URL(configured)
    url.search = params.toString()
    url.hash = ''
    return `${url.pathname}${url.search}`
  } catch {
    return `/?${params.toString()}`
  }
}

const send = (
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  payload: GameContextResponse,
): void => {
  const body = JSON.stringify(payload)
  const isPublic = payload.ok && payload.lifecycle !== 'active'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...corsHeaders({
      methods: 'GET,OPTIONS',
      headers: 'Content-Type, Authorization',
    }),
    'Cache-Control': isPublic ? 'no-cache' : 'no-store',
  }
  if (isPublic) {
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`
    headers.ETag = etag
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers)
      res.end()
      return
    }
  }
  res.writeHead(status, headers)
  res.end(body)
}

export async function handleGameContextRoute(
  req: IncomingMessage,
  res: ServerResponse,
  store: GameContextStore,
  user: AuthUser | null,
): Promise<Awaited<boolean>> {
  if (req.method !== 'GET' || !req.url) return false
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const match = CONTEXT_ROUTE.exec(url.pathname)
  if (!match) return false
  let roomId = ''
  try {
    roomId = decodeURIComponent(match[1]!)
  } catch {
    send(req, res, 400, {
      ok: false,
      code: 'invalid_context_link',
      message: 'Invalid game context link',
    })
    return true
  }
  if (roomId.length > 128 || !CONTEXT_ID.test(roomId)) {
    send(req, res, 400, {
      ok: false,
      code: 'invalid_context_link',
      message: 'Invalid game context link',
    })
    return true
  }
  const response = (await store.resolve(roomId, user?.id))
  if (!response.ok && response.code === 'login_required') {
    response.returnTo = contextReturnTo(roomId)
  }
  send(req, res, response.ok ? 200 : errorStatus(response), response)
  return true
}
