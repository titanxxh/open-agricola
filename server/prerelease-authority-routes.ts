import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PRERELEASE_IDENTITY_PROTOCOL } from '../shared/contract/prerelease-identity'
import type { PostgresDatabase } from './database/postgres'
import { consumeRateLimit } from './database/rate-limit'
import { configuredFormalAppOrigin, configuredPrereleaseTarget, PrereleaseAuthority, PrereleaseAuthorityError, type PrereleaseTarget } from './prerelease-authority'

const secretMatches = (provided: string, expected: string) => timingSafeEqual(
  createHash('sha256').update(provided).digest(), createHash('sha256').update(expected).digest(),
)
const opaqueSecret = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

async function readInput(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > 4096) { req.resume(); throw new PrereleaseAuthorityError('prerelease_request_too_large', 413) }
    chunks.push(Buffer.from(chunk))
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (object(value)) return value
  } catch { /* Invalid JSON shares the bounded request error. */ }
  throw new PrereleaseAuthorityError('prerelease_request_invalid', 400)
}

function generationId(input: Record<string, unknown>): string {
  if (typeof input.generationId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.generationId)) throw new PrereleaseAuthorityError('prerelease_generation_invalid', 400)
  return input.generationId
}

function validateTarget(input: Record<string, unknown>, target: PrereleaseTarget): void {
  if (input.protocolVersion !== PRERELEASE_IDENTITY_PROTOCOL || input.channel !== 'prerelease' || input.targetOrigin !== target.targetOrigin) {
    throw new PrereleaseAuthorityError('prerelease_target_invalid', 400)
  }
}

export function createPrereleaseAuthorityHandler({ db, getSourceToken, now = Date.now }: {
  db: PostgresDatabase
  getSourceToken: (req: IncomingMessage) => Promise<string>
  now?: () => number
}) {
  const authority = new PrereleaseAuthority(db, now)
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (!path.startsWith('/api/prerelease/')) return false
    const target = configuredPrereleaseTarget()
    const sourceOrigin = configuredFormalAppOrigin()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status: number, body: unknown, browser = false) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...(browser && sourceOrigin ? {
        'Access-Control-Allow-Origin': sourceOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin',
      } : {}) })
      res.end(JSON.stringify(body))
    }
    const browser = path === '/api/prerelease/entry' || path === '/api/prerelease/handoffs'
    try {
      if (browser) {
        if (!sourceOrigin || req.headers.origin !== sourceOrigin) {
          throw new PrereleaseAuthorityError('csrf_rejected', 403)
        }
        if (path === '/api/prerelease/entry' && req.method === 'GET') {
          send(200, { ok: true, protocolVersion: PRERELEASE_IDENTITY_PROTOCOL, entry: await authority.entry(await getSourceToken(req), target) }, true)
          return true
        }
      }
      if (!target) throw new PrereleaseAuthorityError('prerelease_entry_disabled', 503)
      if (!browser && (req.headers.origin !== undefined || !secretMatches(req.headers.authorization ?? '', `Bearer ${target.serviceKey}`))) {
        throw new PrereleaseAuthorityError('prerelease_service_unauthorized', 401)
      }
      if (!target.entryEnabled && (browser || path === '/api/prerelease/exchange')) throw new PrereleaseAuthorityError('prerelease_entry_disabled', 503)
      if (!browser) {
        const checkedAt = now()
        const budget = await consumeRateLimit(db, 'prerelease:identity-service', target.targetOrigin, 600, 60_000, checkedAt)
        if (!budget.allowed) {
          res.setHeader('Retry-After', String(Math.max(1, Math.ceil((budget.resetAt - checkedAt) / 1000))))
          throw new PrereleaseAuthorityError('rate_limited', 429)
        }
      }
      if (req.method !== 'POST') throw new PrereleaseAuthorityError('prerelease_method_not_allowed', 405)
      const input = await readInput(req)
      validateTarget(input, target)
      if (path === '/api/prerelease/handoffs') {
        if (!opaqueSecret(input.browserChallenge) || input.returnTo !== `${target.sourceOrigin}/`) throw new PrereleaseAuthorityError('prerelease_request_invalid', 400)
        send(200, await authority.issue(await getSourceToken(req), target, { browserChallenge: input.browserChallenge, returnTo: input.returnTo }), true)
      } else if (path === '/api/prerelease/exchange') {
        if (!opaqueSecret(input.code) || !opaqueSecret(input.browserVerifier) || input.returnTo !== `${target.sourceOrigin}/`) throw new PrereleaseAuthorityError('prerelease_request_invalid', 400)
        send(200, { ok: true, state: await authority.exchange(target, { code: input.code, browserVerifier: input.browserVerifier, returnTo: input.returnTo, generationId: generationId(input) }) })
      } else if (path === '/api/prerelease/status') {
        if (!opaqueSecret(input.grantId)) throw new PrereleaseAuthorityError('prerelease_request_invalid', 400)
        send(200, { ok: true, state: await authority.status(target, input.grantId, generationId(input)) })
      } else if (path === '/api/prerelease/events') {
        send(200, { ok: true, protocolVersion: PRERELEASE_IDENTITY_PROTOCOL, events: await authority.events(target, generationId(input)) })
      } else if (path === '/api/prerelease/acknowledgements') {
        if (typeof input.eventId !== 'string' || !/^[0-9a-f-]{36}$/.test(input.eventId)
          || (input.outcome !== 'revoked' && input.outcome !== 'deleted' && input.outcome !== 'rechecked')) throw new PrereleaseAuthorityError('prerelease_request_invalid', 400)
        send(200, { ok: true, receipt: await authority.acknowledge(target, generationId(input), input.eventId, input.outcome) })
      } else throw new PrereleaseAuthorityError('prerelease_route_not_found', 404)
    } catch (error) {
      if (!(error instanceof PrereleaseAuthorityError)) throw error
      send(error.status, { ok: false, code: error.code }, browser)
    }
    return true
  }
}
