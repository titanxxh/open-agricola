import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseRoomRetentionUpdate, type RoomRetentionUpdate } from '../shared/contract/room-retention'
import { corsHeaders } from './http-origin'
import type { RoomRetentionStore } from './game/room-retention-store'

const MAX_BODY_BYTES = 1024

export function createRetentionPolicyHandler({ store, requireAdmin }: {
  store: RoomRetentionStore
  requireAdmin: (req: IncomingMessage, res: ServerResponse) => Promise<{ id: string } | null>
}) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/admin/retention-policy') return false
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { ...corsHeaders({ methods: 'GET,PATCH,OPTIONS' }), 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    const admin = await requireAdmin(req, res)
    if (!admin) return true
    if (req.method !== 'GET' && req.method !== 'PATCH') {
      res.setHeader('Allow', 'GET, PATCH')
      send(405, { ok: false, code: 'method_not_allowed' })
      return true
    }
    let update: RoomRetentionUpdate | undefined
    if (req.method === 'PATCH') {
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        const buffer = Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > MAX_BODY_BYTES) {
          req.resume()
          send(413, { ok: false, code: 'retention_policy_body_too_large' })
          return true
        }
        chunks.push(buffer)
      }
      try { update = parseRoomRetentionUpdate(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch {
        send(400, { ok: false, code: 'invalid_retention_policy' })
        return true
      }
    }
    try {
      if (update) {
        const result = await store.update(update, admin.id)
        send(result.kind === 'updated' ? 200 : 409, result.kind === 'updated'
          ? { ok: true, policy: result.policy }
          : { ok: false, code: 'retention_policy_conflict', policy: result.policy })
      } else send(200, { ok: true, policy: await store.read() })
    } catch { send(503, { ok: false, code: 'retention_policy_unavailable' }) }
    return true
  }
}
