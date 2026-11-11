import type { IncomingMessage, ServerResponse } from 'node:http'
import { PRERELEASE_IDENTITY_FRESHNESS_MS } from '../shared/contract/prerelease-identity'
import { configuredFormalAppOrigin, configuredPrereleaseTarget } from './prerelease-authority'
import type { PostgresDatabase } from './database/postgres'
import { PrereleaseIdentityLifecycle, PrereleaseLifecycleError, type PrereleaseOwnerRequest } from './prerelease-identity-lifecycle'

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
const origin = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value } catch { return false }
}

async function requestBody(req: IncomingMessage): Promise<PrereleaseOwnerRequest> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > 65_536) { req.resume(); throw new PrereleaseLifecycleError('prerelease_request_too_large', 413) }
    chunks.push(Buffer.from(chunk))
  }
  let input: unknown
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new PrereleaseLifecycleError('prerelease_request_invalid', 400) }
  if (!input || typeof input !== 'object' || !('protocolVersion' in input) || input.protocolVersion !== 1
    || !('channel' in input) || input.channel !== 'prerelease' || !('targetOrigin' in input) || !origin(input.targetOrigin)
    || !('generationId' in input) || !uuid(input.generationId) || !('operationId' in input) || !uuid(input.operationId) || !('action' in input)) throw new PrereleaseLifecycleError('prerelease_request_invalid', 400)
  const binding = { targetOrigin: input.targetOrigin, generationId: input.generationId, operationId: input.operationId }
  if (input.action === 'prepare' && 'targetId' in input && typeof input.targetId === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.targetId)
    && 'expectedPreviousGenerationId' in input && (input.expectedPreviousGenerationId === null || uuid(input.expectedPreviousGenerationId))) {
    return { ...binding, action: input.action, targetId: input.targetId, expectedPreviousGenerationId: input.expectedPreviousGenerationId }
  }
  if (input.action === 'close') return { ...binding, action: input.action }
  if (input.action === 'activate' && 'auditOperationId' in input && uuid(input.auditOperationId)) return { ...binding, action: input.action, auditOperationId: input.auditOperationId }
  if (input.action === 'associate' && 'refs' in input && Array.isArray(input.refs) && input.refs.length > 0 && input.refs.length <= 100) {
    const refs: Array<{ userId: string; sourceGrantId: string }> = []
    const rawRefs: unknown[] = input.refs
    for (const ref of rawRefs) {
      if (!ref || typeof ref !== 'object' || !('userId' in ref) || typeof ref.userId !== 'string' || !ref.userId || ref.userId.length > 256 || Array.from(ref.userId).some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
        || !('sourceGrantId' in ref) || typeof ref.sourceGrantId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ref.sourceGrantId)) throw new PrereleaseLifecycleError('prerelease_request_invalid', 400)
      refs.push({ userId: ref.userId, sourceGrantId: ref.sourceGrantId })
    }
    return { ...binding, action: input.action, refs }
  }
  if (input.action === 'audit-complete' && 'identityManifestSha256' in input && typeof input.identityManifestSha256 === 'string' && /^[a-f0-9]{64}$/.test(input.identityManifestSha256)
    && 'identityCount' in input && typeof input.identityCount === 'number' && Number.isSafeInteger(input.identityCount) && input.identityCount >= 0
    && 'verificationReceiptSha256' in input && typeof input.verificationReceiptSha256 === 'string' && /^[a-f0-9]{64}$/.test(input.verificationReceiptSha256)) {
    return { ...binding, action: input.action, identityManifestSha256: input.identityManifestSha256, identityCount: input.identityCount, verificationReceiptSha256: input.verificationReceiptSha256 }
  }
  if (input.action === 'retire' && 'purgeReceiptSha256' in input && typeof input.purgeReceiptSha256 === 'string' && /^[a-f0-9]{64}$/.test(input.purgeReceiptSha256)) return { ...binding, action: input.action, purgeReceiptSha256: input.purgeReceiptSha256 }
  throw new PrereleaseLifecycleError('prerelease_request_invalid', 400)
}

export function createPrereleaseLifecycleHandler({ db, requireAdmin, now = Date.now }: {
  db: PostgresDatabase
  requireAdmin: (req: IncomingMessage, res: ServerResponse) => Promise<{ id: string } | null>
  now?: () => number
}) {
  const lifecycle = new PrereleaseIdentityLifecycle(db, now)
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/api/admin/prerelease-identity/lifecycle') return false
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const formalOrigin = configuredFormalAppOrigin()
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...(formalOrigin ? { 'Access-Control-Allow-Origin': formalOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}) })
      res.end(JSON.stringify(value))
    }
    if (!await requireAdmin(req, res)) return true
    try {
      if (req.method === 'GET') {
        const targetOrigin = url.searchParams.get('targetOrigin'), generationId = url.searchParams.get('generationId')
        if (!origin(targetOrigin) || (generationId !== null && !uuid(generationId)) || url.searchParams.size !== (generationId === null ? 1 : 2)) throw new PrereleaseLifecycleError('prerelease_request_invalid', 400)
        send(200, { ok: true, protocolVersion: 1, generation: await lifecycle.read(targetOrigin, generationId ?? undefined) })
      } else if (req.method === 'POST') {
        if (!formalOrigin || req.headers.origin !== formalOrigin) throw new PrereleaseLifecycleError('csrf_rejected', 403)
        const input = await requestBody(req)
        const completed = await lifecycle.apply(input, configuredPrereleaseTarget()?.targetOrigin)
        if (input.action === 'associate') {
          const checkedAt = now()
          send(200, { ok: true, protocolVersion: 1, receipt: completed, checkedAt, validUntil: checkedAt + PRERELEASE_IDENTITY_FRESHNESS_MS,
            associations: await lifecycle.associations(input.generationId, input.refs) })
        } else send(200, { ok: true, protocolVersion: 1, receipt: completed })
      } else throw new PrereleaseLifecycleError('method_not_allowed', 405)
    } catch (error) {
      if (!(error instanceof PrereleaseLifecycleError)) throw error
      send(error.status, { ok: false, code: error.code })
    }
    return true
  }
}
