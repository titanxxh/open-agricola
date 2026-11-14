import type { WorkshopPublicCardSnapshot } from './workshop-public-cards'

export type PublicSandboxInputs = {
  snapshots: WorkshopPublicCardSnapshot[]
  buildId: string
  generationId: string
  contractId: string
}
export type PublicSandboxWorkerLease = {
  buildId: string
  generationId: string
  runtimeId: string
  hashes: string[]
  wallDeadline: number
  monotonicDeadline: number
}

export function assertPublicSandboxWorkerLease(lease: PublicSandboxWorkerLease | undefined, inputs: PublicSandboxInputs | undefined): void {
  if (!lease || !inputs || lease.buildId !== inputs.buildId || lease.generationId !== inputs.generationId
    || lease.runtimeId !== `browser-local:${inputs.buildId}`
    || lease.hashes.length !== inputs.snapshots.length || lease.hashes.some((hash, index) => hash !== inputs.snapshots[index]?.sha256)
    || !Number.isFinite(lease.wallDeadline) || !Number.isFinite(lease.monotonicDeadline)
    || lease.wallDeadline > Date.now() + 30_000 || lease.monotonicDeadline > performance.timeOrigin + performance.now() + 30_000
    || Date.now() >= lease.wallDeadline || performance.timeOrigin + performance.now() >= lease.monotonicDeadline) throw new Error('Public card execution paused')
}
