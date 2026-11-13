import {
  PRERELEASE_IDENTITY_PROTOCOL, PRERELEASE_IDENTITY_FRESHNESS_MS,
  type PrereleaseIdentityState, type PrereleaseIdentityEvent,
} from '../shared/contract/prerelease-identity'
import type { PrereleaseRuntime } from '../shared/contract/prerelease-runtime'

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const object = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new Error('Invalid prerelease authority response')
  return value
}
const text = (value: unknown): string => { if (typeof value !== 'string' || !value || value.length > 256) throw new Error('Invalid identity text'); return value }
const timestamp = (value: unknown): number => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid identity time'); return value }

export function parsePrereleaseIdentityState(value: unknown, runtime: PrereleaseRuntime, grantId?: string): PrereleaseIdentityState {
  const state = object(value), account = object(state.account), source = object(state.source), grant = object(state.grant)
  if (state.protocolVersion !== PRERELEASE_IDENTITY_PROTOCOL || state.channel !== 'prerelease'
    || state.targetOrigin !== runtime.appOrigin || state.generationId !== runtime.generationId
    || typeof state.grantId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state.grantId)
    || grantId !== undefined && state.grantId !== grantId || typeof state.betaAccess !== 'boolean') throw new Error('Identity authority binding mismatch')
  let parsedAccount: PrereleaseIdentityState['account']
  if (account.kind === 'active') {
    const subject = object(account.subject), id = text(subject.id)
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid external user ID')
    parsedAccount = { kind: 'active', subject: { id, username: text(subject.username), displayName: text(subject.displayName) } }
  } else if (account.kind === 'deleted') parsedAccount = { kind: 'deleted' }
  else throw new Error('Invalid authority account')
  const parsedSource: PrereleaseIdentityState['source'] = source.kind === 'active' ? { kind: 'active', expiresAt: timestamp(source.expiresAt) } : source.kind === 'invalid' ? { kind: 'invalid' } : (() => { throw new Error('Invalid source') })()
  if (grant.kind !== 'active' && grant.kind !== 'revoked') throw new Error('Invalid grant')
  const confirmedAt = timestamp(state.confirmedAt), validUntil = timestamp(state.validUntil)
  if (validUntil > confirmedAt + PRERELEASE_IDENTITY_FRESHNESS_MS) throw new Error('Authority freshness exceeds protocol')
  return { protocolVersion: 1, channel: 'prerelease', targetOrigin: runtime.appOrigin, generationId: runtime.generationId,
    grantId: state.grantId, account: parsedAccount, source: parsedSource, betaAccess: state.betaAccess,
    grant: { kind: grant.kind, expiresAt: timestamp(grant.expiresAt) }, confirmedAt, validUntil }
}

export type ExchangeInput = { code: string; browserVerifier: string; returnTo: string }
export interface PrereleaseIdentityClient {
  exchange(input: ExchangeInput): Promise<PrereleaseIdentityState>
  status(grantId: string): Promise<PrereleaseIdentityState>
  events(): Promise<PrereleaseIdentityEvent[]>
  acknowledge(eventId: string, outcome: 'revoked' | 'deleted' | 'rechecked'): Promise<void>
}

export class FormalPrereleaseIdentityClient implements PrereleaseIdentityClient {
  readonly runtime: PrereleaseRuntime
  private readonly serviceKey: string
  private readonly fetcher: typeof fetch
  constructor(runtime: PrereleaseRuntime, serviceKey: string, fetcher: typeof fetch = fetch) {
    this.runtime = runtime; this.serviceKey = serviceKey; this.fetcher = fetcher
    if (Buffer.byteLength(serviceKey) < 32 || new URL(runtime.formalApiBase).protocol !== 'https:') throw new Error('Missing restricted formal identity configuration')
  }
  private async post(path: string, input: object): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.runtime.formalApiBase}/api/prerelease/${path}`, {
      method: 'POST', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${this.serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, channel: 'prerelease', targetOrigin: this.runtime.appOrigin, generationId: this.runtime.generationId, ...input }),
    })
    if (!response.ok || Number(response.headers.get('content-length')) > 65536) throw new Error('Formal identity service unavailable')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Empty authority response')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > 65536) { await reader.cancel(); throw new Error('Authority response too large') }
        chunks.push(next.value)
      }
    } finally { reader.releaseLock() }
    const result = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (result.ok !== true) throw new Error('Authority refused identity operation')
    return result
  }
  async exchange(input: ExchangeInput) { return parsePrereleaseIdentityState((await this.post('exchange', input)).state, this.runtime) }
  async status(grantId: string) { return parsePrereleaseIdentityState((await this.post('status', { grantId })).state, this.runtime, grantId) }
  async events(): Promise<PrereleaseIdentityEvent[]> {
    const response = await this.post('events', {})
    if (response.protocolVersion !== 1 || !Array.isArray(response.events) || response.events.length > 100) throw new Error('Invalid authority events')
    return response.events.map((value: unknown) => {
      const event = object(value), id = text(event.id), userId = text(event.userId), createdAt = timestamp(event.createdAt)
      if (!/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new Error('Invalid authority event identity')
      if (event.kind === 'source_revoked' && typeof event.grantId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(event.grantId)) return { id, userId, createdAt, kind: 'source_revoked', grantId: event.grantId }
      if ((event.kind === 'account_deleted' || event.kind === 'beta_changed') && event.grantId === null) return { id, userId, createdAt, kind: event.kind, grantId: null }
      throw new Error('Invalid authority event')
    })
  }
  async acknowledge(eventId: string, outcome: 'revoked' | 'deleted' | 'rechecked'): Promise<void> {
    const response = await this.post('acknowledgements', { eventId, outcome }), receipt = object(response.receipt)
    if (receipt.eventId !== eventId || receipt.outcome !== outcome) throw new Error('Invalid authority acknowledgement')
    timestamp(receipt.completedAt)
  }
}
