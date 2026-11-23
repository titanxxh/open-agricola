import type { IncomingMessage, ServerResponse } from 'node:http'
import { parsePlayerPreferences } from '../shared/domain/player-preferences'
import { corsHeaders } from './http-origin'
import type { GamePreferencesStore } from './game/game-preferences-store'

const PATH = '/api/account/game-preferences'
const MAX_BODY_BYTES = 1024

/** Account defaults for seat settings (#2039): read and replaced by the signed-in user only. */
export function createGamePreferencesHandler({ store, authenticate }: {
  store: GamePreferencesStore
  authenticate: (req: IncomingMessage) => Promise<{ id: string } | null | undefined>
}) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== PATH) return false
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { ...corsHeaders({ methods: 'GET,PUT,OPTIONS' }), 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'GET' && req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT')
      send(405, { ok: false, code: 'method_not_allowed' })
      return true
    }
    const user = await authenticate(req)
    if (!user) {
      send(401, { ok: false, code: 'login_required' })
      return true
    }
    try {
      if (req.method === 'GET') {
        send(200, { ok: true, preferences: await store.read(user.id) })
        return true
      }
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        const buffer = Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > MAX_BODY_BYTES) {
          req.resume()
          send(413, { ok: false, code: 'game_preferences_body_too_large' })
          return true
        }
        chunks.push(buffer)
      }
      let preferences
      try { preferences = parsePlayerPreferences(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { preferences = null }
      if (!preferences) {
        send(400, { ok: false, code: 'invalid_game_preferences' })
        return true
      }
      send(200, { ok: true, preferences: await store.write(user.id, preferences) })
    } catch { send(503, { ok: false, code: 'game_preferences_unavailable' }) }
    return true
  }
}
