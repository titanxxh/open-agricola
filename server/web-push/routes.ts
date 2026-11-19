import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  isWebPushId, isWebPushKind, WEB_PUSH_CLICK_PATH, WEB_PUSH_UNBIND_PATH, WEB_PUSH_DEVICE_PATH, type WebPushPreferences,
} from '../../shared/contract/web-push'
import { requestSessionToken } from '../request-auth'
import { parsePushSubscription } from './provider'
import type { WebPushStore } from './store'

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const part = Buffer.from(chunk)
    bytes += part.length
    if (bytes > 4_096) { req.resume(); return null }
    chunks.push(part)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  } catch { /* Return one generic invalid request result. */ }
  return null
}

export function createWebPushHandler(args: {
  store: WebPushStore
  publicKey: string | null
  allowed: WebPushPreferences
  sendJson: (res: ServerResponse, status: number, payload: unknown) => void
}) {
  const { store, publicKey, allowed, sendJson } = args
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (![WEB_PUSH_DEVICE_PATH, WEB_PUSH_CLICK_PATH, WEB_PUSH_UNBIND_PATH].includes(url.pathname)) return false
    const reply = (status: number, payload: unknown) => { sendJson(res, status, payload); return true }
    if (req.method !== 'POST') return reply(405, { ok: false })
    const body = await readBody(req)
    if (url.pathname === WEB_PUSH_CLICK_PATH) {
      if (!body || !isWebPushId(body.deliveryId) || !isWebPushKind(body.kind) || typeof body.accountId !== 'string') return reply(200, { kind: 'unavailable' })
      return reply(200, await store.resolveClick(requestSessionToken(req), body.deliveryId, body.kind, body.accountId))
    }
    if (!body || !isWebPushId(body.deviceId)) return reply(400, { ok: false })
    if (url.pathname === WEB_PUSH_UNBIND_PATH) {
      await store.unbind(body.deviceId)
      return reply(200, { ok: true })
    }
    const token = requestSessionToken(req)
    if (!token || typeof body.accountId !== 'string') return reply(401, { ok: false })
    if (body.operation === 'status') {
      const endpoint = typeof body.endpoint === 'string' && body.endpoint.length <= 2_048 ? body.endpoint : null
      const preferences = await store.preferences(token, body.deviceId, endpoint, body.accountId,
        allowed.draft || allowed['bug-report-inbox'])
      return preferences ? reply(200, { ok: true, publicKey, allowed, preferences }) : reply(401, { ok: false })
    }
    if (body.operation !== 'set' || !isWebPushKind(body.kind) || typeof body.enabled !== 'boolean'
      || typeof body.locale !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(body.locale) || body.locale.length > 16) {
      return reply(400, { ok: false })
    }
    const subscription = parsePushSubscription(body.subscription)
    if (body.enabled && (!subscription || !allowed[body.kind])) return reply(400, { ok: false })
    const preferences = await store.bind(token, { deviceId: body.deviceId, expectedUserId: body.accountId, kind: body.kind, enabled: body.enabled, locale: body.locale, subscription })
    return preferences ? reply(200, { ok: true, publicKey, allowed, preferences }) : reply(403, { ok: false })
  }
}
