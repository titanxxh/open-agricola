import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseBetaAccessAccount } from '../shared/contract/beta-access'
import { corsHeaders } from './http-origin'
import type { BetaAccessStore } from './beta-access-store'

export function createBetaAccessHandler({ store, requireAdmin }: {
  store: BetaAccessStore
  requireAdmin: (req: IncomingMessage, res: ServerResponse) => Promise<{ id: string } | null>
}) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/admin/beta-access') return false
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { ...corsHeaders({ methods: 'GET,PUT,DELETE,OPTIONS' }), 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    const admin = await requireAdmin(req, res)
    if (!admin) return true
    if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
      res.setHeader('Allow', 'GET, PUT, DELETE')
      send(405, { ok: false, code: 'method_not_allowed' })
      return true
    }
    let userId: string | undefined
    if (req.method !== 'GET') {
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        const buffer = Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > 1024) {
          req.resume()
          send(413, { ok: false, code: 'beta_access_body_too_large' })
          return true
        }
        chunks.push(buffer)
      }
      try { userId = parseBetaAccessAccount(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { send(400, { ok: false, code: 'invalid_beta_access_account' }); return true }
    }
    try {
      if (req.method === 'PUT' && userId && !await store.grant(userId, admin.id)) {
        send(404, { ok: false, code: 'beta_access_account_not_found' })
        return true
      }
      if (req.method === 'DELETE' && userId) await store.revoke(userId)
      send(200, { ok: true, grants: await store.list() })
    } catch { send(503, { ok: false, code: 'beta_access_unavailable' }) }
    return true
  }
}
