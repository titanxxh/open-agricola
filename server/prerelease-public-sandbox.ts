import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CustomCardData } from '../shared/cards/session-card-context'
import { ALL_CARD_IMPLS } from '../shared/cards/register-all'
import { getCardDefinition } from '../shared/cards/catalog'
import { parsePublicCardReference, publicCardDefinition, publicCardId, publicCardReference, type PublicCardReference } from '../shared/contract/public-card-input'
import type { WorkshopPublicCardSnapshot } from '../shared/contract/workshop-public-cards'
import type { PrereleaseRuntime } from '../shared/contract/prerelease-runtime'
import { FormalPublicCards, PublicCardExecutionLease } from './prerelease-public-cards'
import { readPrereleaseRuntime } from './prerelease-sessions'
import { validateAndCompileCustomCodeRemote } from './custom-code/client'
import { getWorkshopSandboxContract } from './workshop-sandbox-contract'

export class PublicSandboxPaused extends Error {
  readonly code = 'public_card_execution_paused'
}
class PublicSandboxNewUnavailable extends Error {}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid public sandbox request')
  return Object.fromEntries(Object.entries(value))
}
export async function readPublicSandboxBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    raw += String(chunk)
    if (Buffer.byteLength(raw) > 16_384) { req.resume(); throw new Error('Public sandbox request is too large') }
  }
  return record(JSON.parse(raw || '{}'))
}
export function parsePublicSandboxIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error('Invalid public sandbox selection')
  const ids = value.map(publicCardId)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate public sandbox input')
  return ids
}
export function parsePublicSandboxReferences(value: unknown): PublicCardReference[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error('Invalid fixed public inputs')
  const refs = value.map(parsePublicCardReference)
  if (new Set(refs.map(ref => ref.sha256)).size !== refs.length) throw new Error('Duplicate public input')
  return refs
}

export class PublicSandboxScope {
  readonly snapshots: WorkshopPublicCardSnapshot[]
  private readonly leases: PublicCardExecutionLease<WorkshopPublicCardSnapshot | PublicCardReference>[]
  constructor(snapshots: WorkshopPublicCardSnapshot[], leases: PublicCardExecutionLease<WorkshopPublicCardSnapshot | PublicCardReference>[]) {
    this.snapshots = snapshots; this.leases = leases
  }
  assert(): void {
    if (this.leases.some(lease => !lease.authorized())) throw new PublicSandboxPaused('Public card execution paused')
  }
  async check(): Promise<void> {
    await Promise.all(this.leases.filter(lease => lease.remainingMs() <= 15_000).map(lease => lease.refresh().catch(() => {})))
    this.assert()
  }
  async checkNew(): Promise<void> { await Promise.all(this.leases.map(lease => lease.refresh())); this.leases.forEach(lease => lease.assertNew()) }
  remainingMs(): number { return Math.min(30_000, ...this.leases.map(lease => lease.remainingMs())) }
}

/** Public fixed inputs remain separate from local Workshop drafts and writes. */
export class PrereleasePublicSandbox {
  readonly source: FormalPublicCards
  readonly runtime: Pick<PrereleaseRuntime, 'buildId' | 'generationId'>
  private readonly leases = new Map<string, PublicCardExecutionLease<WorkshopPublicCardSnapshot | PublicCardReference>>()
  private readonly loading = new Map<string, Promise<PublicCardExecutionLease<WorkshopPublicCardSnapshot | PublicCardReference>>>()
  constructor(source: FormalPublicCards, runtime: Pick<PrereleaseRuntime, 'buildId' | 'generationId'>) {
    this.source = source; this.runtime = runtime
  }
  private async lease(ref: PublicCardReference, force: boolean): Promise<PublicCardExecutionLease<WorkshopPublicCardSnapshot | PublicCardReference>> {
    let lease = this.leases.get(ref.sha256)
    if (!lease) {
      let pending = this.loading.get(ref.sha256)
      if (!pending) {
        if (this.leases.size + this.loading.size >= 256) throw new Error('Public sandbox input capacity reached')
        const started = this.source.clock.monotonic()
        pending = this.source.status(ref).then(status => {
          const created = new PublicCardExecutionLease(this.source, ref, status, started)
          this.leases.set(ref.sha256, created)
          return created
        }).finally(() => { this.loading.delete(ref.sha256) })
        this.loading.set(ref.sha256, pending)
      }
      lease = await pending
    } else if (force || lease.remainingMs() <= 15_000) await lease.refresh().catch(() => {})
    lease.assert()
    return lease
  }
  async create(cardIds: string[]): Promise<PublicSandboxScope> {
    const snapshots: WorkshopPublicCardSnapshot[] = [], leases: PublicCardExecutionLease<WorkshopPublicCardSnapshot | PublicCardReference>[] = []
    for (const id of parsePublicSandboxIds(cardIds)) {
      const fixed = await this.source.snapshot(id), lease = await this.lease(publicCardReference(fixed.snapshot), true)
      lease.assertNew()
      snapshots.push(fixed.snapshot); leases.push(lease)
    }
    const scope = new PublicSandboxScope(snapshots, leases)
    scope.assert()
    return scope
  }
  async inspect(refs: PublicCardReference[], newGame = false): Promise<PublicSandboxScope> {
    const leases: PublicCardExecutionLease<WorkshopPublicCardSnapshot | PublicCardReference>[] = []
    for (const ref of refs) leases.push(await this.lease(ref, true))
    const scope = new PublicSandboxScope([], leases)
    if (newGame) {
      try { leases.forEach(lease => lease.assertNew()) }
      catch { throw new PublicSandboxNewUnavailable('Public card unavailable for new execution') }
    }
    scope.assert()
    return scope
  }
  packet(scope: PublicSandboxScope) {
    scope.assert()
    const serverTime = this.source.clock.now()
    return { ...this.runtime, contractId: getWorkshopSandboxContract().id, serverTime, validUntil: serverTime + scope.remainingMs() }
  }
  async compile(scope: PublicSandboxScope): Promise<CustomCardData[]> {
    const cards: CustomCardData[] = []
    const identities = new Set<string>()
    for (const snapshot of scope.snapshots) {
      const definition = publicCardDefinition(snapshot), id = definition.cardJson.id
      if (identities.has(id)) throw new Error('Conflicting public card identities')
      identities.add(id)
      if (getCardDefinition(id) && ALL_CARD_IMPLS[id]) continue
      const source = snapshot.input.effectCode
      if (!source) { cards.push({ ...definition, effectCode: null }); continue }
      const compiled = await validateAndCompileCustomCodeRemote(source, id)
      if (!compiled.valid) throw new Error(`Public card ${id} is unsupported: ${compiled.errors.join('; ')}`)
      cards.push({ ...definition, effectCode: source, compiledCode: compiled.compiledCode, codeManifest: compiled.manifest })
      scope.assert()
    }
    scope.assert()
    return cards
  }
}

let instance: PrereleasePublicSandbox | undefined
export function configurePrereleasePublicSandbox(value: PrereleasePublicSandbox | undefined): void { instance = value }
export function getPrereleasePublicSandbox(): PrereleasePublicSandbox {
  const runtime = readPrereleaseRuntime()
  if (!runtime) throw new Error('Public sandbox requires prerelease runtime')
  if (!instance || instance.runtime.buildId !== runtime.buildId || instance.runtime.generationId !== runtime.generationId) {
    instance = new PrereleasePublicSandbox(new FormalPublicCards(runtime.formalApiBase), runtime)
  }
  return instance
}

export async function handlePrereleasePublicSandbox(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (process.env.RELEASE_CHANNEL !== 'prerelease') return false
  const url = new URL(req.url ?? '/', 'http://localhost'), base = '/api/workshop/public-sandbox/v1'
  if (!url.pathname.startsWith(`${base}/`)) return false
  const send = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
  try {
    const service = getPrereleasePublicSandbox()
    if (url.pathname === `${base}/cards` && req.method === 'GET') { send(200, { ok: true, ...await service.source.catalog(url.searchParams) }); return true }
    if (req.method !== 'POST' || !['/inputs', '/status'].some(path => url.pathname === `${base}${path}`) || url.search) { send(405, { ok: false, code: 'prerelease_readonly' }); return true }
    const body = await readPublicSandboxBody(req), allowed = url.pathname.endsWith('/inputs') ? ['cardIds'] : ['inputs', 'newGame']
    if (Object.keys(body).some(key => !allowed.includes(key)) || body.newGame !== undefined && typeof body.newGame !== 'boolean') throw new Error('Only public input references are accepted')
    const scope = url.pathname.endsWith('/inputs') ? await service.create(parsePublicSandboxIds(body.cardIds)) : await service.inspect(parsePublicSandboxReferences(body.inputs), body.newGame === true)
    send(200, { ok: true, snapshots: scope.snapshots, lease: service.packet(scope) })
  } catch (error) { send(error instanceof PublicSandboxNewUnavailable ? 409 : error instanceof PublicSandboxPaused ? 503 : 400,
    { ok: false, code: error instanceof PublicSandboxNewUnavailable ? 'public_card_unavailable_new' : 'public_card_execution_paused', error: error instanceof Error ? error.message : 'Public source unavailable' }) }
  return true
}
