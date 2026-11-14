import { browserApiFetch } from '../services/browser-api'
import { assertPrereleaseAccess, getPrereleaseLeaseRemainingMs, getPrereleaseRevision, getPrereleaseRuntime } from '../services/prerelease-runtime'
import { parsePublicCardSnapshot, publicCardReference } from '../../shared/contract/public-card-input'
import type { PublicSandboxInputs, PublicSandboxWorkerLease } from '../../shared/contract/public-sandbox'

export const PUBLIC_SANDBOX_PAUSED_EVENT = 'oa-public-sandbox-paused'
export function pausePublicSandbox(): void { window.dispatchEvent(new Event(PUBLIC_SANDBOX_PAUSED_EVENT)) }

/** No permission is persisted; each restored input receives a fresh source check. */
export class PublicSandboxAccess {
  private readonly inputs: PublicSandboxInputs
  private revision = 0
  private wallDeadline = 0
  private monotonicDeadline = 0
  private timer?: ReturnType<typeof setInterval>
  private refreshing?: Promise<void>
  private stopped = false
  private readonly onPause: () => void
  constructor(inputs: PublicSandboxInputs, onPause: () => void = pausePublicSandbox) { this.inputs = inputs; this.onPause = onPause }
  private binding(): void {
    assertPrereleaseAccess()
    const runtime = getPrereleaseRuntime()
    if (!runtime || runtime.buildId !== this.inputs.buildId || runtime.generationId !== this.inputs.generationId) throw new Error('prerelease_runtime_changed')
  }
  assert(): void {
    this.binding()
    if (this.stopped || Date.now() >= this.wallDeadline || performance.timeOrigin + performance.now() >= this.monotonicDeadline) throw new Error('Public card execution paused')
  }
  lease(): PublicSandboxWorkerLease {
    this.assert()
    const beta = getPrereleaseLeaseRemainingMs()
    return { buildId: this.inputs.buildId, generationId: this.inputs.generationId, runtimeId: `browser-local:${this.inputs.buildId}`,
      hashes: this.inputs.snapshots.map(snapshot => snapshot.sha256), wallDeadline: Math.min(this.wallDeadline, Date.now() + beta),
      monotonicDeadline: Math.min(this.monotonicDeadline, performance.timeOrigin + performance.now() + beta) }
  }
  async refresh(newGame = false): Promise<void> {
    this.binding()
    const revision = ++this.revision, betaRevision = getPrereleaseRevision(), wallStarted = Date.now(), started = performance.timeOrigin + performance.now()
    let remaining = 30_000
    if (this.inputs.snapshots.length > 0) {
      const response = await browserApiFetch('/api/workshop/public-sandbox/v1/status', { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000), body: JSON.stringify({ inputs: this.inputs.snapshots.map(publicCardReference), newGame }) })
      const value: unknown = await response.json()
      if (newGame && response.status === 409 && value && typeof value === 'object' && 'code' in value && value.code === 'public_card_unavailable_new') throw new Error('Public card unavailable for new execution')
      if (!response.ok || !value || typeof value !== 'object' || !('ok' in value) || value.ok !== true || !('lease' in value)
        || !value.lease || typeof value.lease !== 'object') { this.block(); throw new Error('Public card execution paused') }
      const lease = value.lease
      if (!('buildId' in lease) || lease.buildId !== this.inputs.buildId || !('generationId' in lease) || lease.generationId !== this.inputs.generationId
        || !('contractId' in lease) || lease.contractId !== this.inputs.contractId || !('serverTime' in lease) || typeof lease.serverTime !== 'number'
        || !('validUntil' in lease) || typeof lease.validUntil !== 'number' || !Number.isFinite(lease.validUntil)
        || lease.validUntil <= lease.serverTime || lease.validUntil > lease.serverTime + 30_000) { this.block(); throw new Error('Invalid public source lease') }
      remaining = lease.validUntil - lease.serverTime
    }
    this.binding()
    if (revision !== this.revision || betaRevision !== getPrereleaseRevision() || this.stopped) throw new Error('Public card execution paused')
    this.wallDeadline = wallStarted + remaining
    this.monotonicDeadline = started + remaining
    this.assert()
  }
  async start(newGame = false): Promise<void> {
    await this.refresh(newGame)
    this.timer = setInterval(() => {
      try { this.assert() } catch { this.block(); return }
      const remaining = Math.min(this.wallDeadline - Date.now(), this.monotonicDeadline - performance.timeOrigin - performance.now())
      if (remaining <= 15_000 && !this.refreshing) this.refreshing = this.refresh().catch(() => {}).finally(() => { this.refreshing = undefined })
    }, 1000)
  }
  stop(): void { this.stopped = true; this.revision++; clearInterval(this.timer) }
  private block(): void { if (this.stopped) return; this.stop(); this.wallDeadline = 0; this.monotonicDeadline = 0; this.onPause() }
}


export async function loadPublicSandboxInputs(cardIds: string[]): Promise<PublicSandboxInputs> {
  const response = await browserApiFetch('/api/workshop/public-sandbox/v1/inputs', { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardIds }) })
  const value: unknown = await response.json(), runtime = getPrereleaseRuntime()
  if (!response.ok && value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') throw new Error(value.error)
  if (!response.ok || !runtime || !value || typeof value !== 'object' || !('ok' in value) || value.ok !== true
    || !('snapshots' in value) || !Array.isArray(value.snapshots) || value.snapshots.length !== cardIds.length
    || !('lease' in value) || !value.lease || typeof value.lease !== 'object' || !('buildId' in value.lease) || value.lease.buildId !== runtime.buildId
    || !('generationId' in value.lease) || value.lease.generationId !== runtime.generationId || !('contractId' in value.lease) || typeof value.lease.contractId !== 'string') throw new Error('Public card input unavailable')
  return { snapshots: value.snapshots.map((snapshot: unknown, index) => parsePublicCardSnapshot(snapshot, cardIds[index]!)),
    buildId: runtime.buildId, generationId: runtime.generationId, contractId: value.lease.contractId }
}
