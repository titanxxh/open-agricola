import { parsePublicCardSnapshot, parsePublicCardStatus, publicCardId } from '../shared/contract/public-card-input'
import type { WorkshopPublicCardSnapshot, WorkshopPublicCardStatus } from '../shared/contract/workshop-public-cards'

type Clock = { now(): number; monotonic(): number }
const clock: Clock = { now: Date.now, monotonic: () => performance.now() }
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const object = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new Error('Invalid public source response')
  return value
}

/** Only immutable, anonymous public source reads may leave the candidate. */
export class FormalPublicCards {
  private readonly origin: string
  private readonly fetcher: typeof fetch
  readonly clock: Clock
  constructor(origin: string, fetcher: typeof fetch = fetch, time: Clock = clock) {
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid formal public source origin')
    this.origin = url.origin; this.fetcher = fetcher; this.clock = time
  }
  private async get(path: string): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.origin}/api/workshop/public-cards/v1/cards${path}`, {
      method: 'GET', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok || Number(response.headers.get('content-length')) > 4_194_304) { await response.body?.cancel(); throw new Error('Public source unavailable') }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Empty public source response')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > 4_194_304) { await reader.cancel(); throw new Error('Public source response too large') }
        chunks.push(next.value)
      }
    } finally { reader.releaseLock() }
    const result = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (result.ok !== true) throw new Error('Public source refused request')
    return result
  }
  async snapshot(cardId: string) {
    const result = await this.get(`/${publicCardId(cardId)}`)
    const snapshot = parsePublicCardSnapshot(result.snapshot, cardId)
    const status = parsePublicCardStatus(result.status, snapshot.sha256)
    if (!status.access.allowNew || status.validUntil <= this.clock.now()) throw new Error('Public card unavailable for new execution')
    return { snapshot, status }
  }
  async status(snapshot: WorkshopPublicCardSnapshot) {
    const { source } = snapshot.input
    return parsePublicCardStatus(await this.get(`/${publicCardId(source.workshopCardId)}/versions/${publicCardId(source.versionId)}/status?sha256=${snapshot.sha256}`), snapshot.sha256)
  }
  async create(cardId: string): Promise<PublicCardExecutionLease> {
    const started = this.clock.monotonic(), fixed = await this.snapshot(cardId)
    return new PublicCardExecutionLease(this, fixed.snapshot, fixed.status, started)
  }
}

/** A source failure never grants more time, and an older reply cannot undo denial. */
export class PublicCardExecutionLease {
  readonly snapshot: WorkshopPublicCardSnapshot
  private readonly source: FormalPublicCards
  private deadline = 0
  private revision = 0
  constructor(source: FormalPublicCards, snapshot: WorkshopPublicCardSnapshot, status: WorkshopPublicCardStatus, started: number) {
    this.source = source; this.snapshot = snapshot; this.accept(status, started)
  }
  private accept(status: WorkshopPublicCardStatus, started: number): void {
    const remaining = Math.min(status.validUntil - this.source.clock.now(), 30_000 - (this.source.clock.monotonic() - started))
    this.deadline = status.access.allowExisting ? this.source.clock.monotonic() + Math.max(0, remaining) : 0
  }
  authorized(): boolean { return this.source.clock.monotonic() < this.deadline }
  assert(): void { if (!this.authorized()) throw new Error('Public card execution paused') }
  async refresh(): Promise<void> {
    const revision = ++this.revision, started = this.source.clock.monotonic()
    const status = await this.source.status(this.snapshot)
    if (!status.access.allowExisting) { ++this.revision; this.deadline = 0 }
    else if (revision === this.revision) this.accept(status, started)
  }
}
