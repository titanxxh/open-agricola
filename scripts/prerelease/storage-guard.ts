import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicJson } from './runtime'
import { assertOwnerPath, targetFingerprint, type PrereleaseTarget } from './config'

const usageKeys = ['sourceDatabaseBytes', 'validationDatabaseBytes', 'bucketBytes', 'multipartBytes', 'localBytes', 'offsiteBytes'] as const
const freeKeys = ['hostFreeBytes', 'hostFreeInodes', 'offsiteFreeBytes', 'offsiteFreeInodes'] as const
export type StorageObservation = Record<typeof usageKeys[number] | typeof freeKeys[number], number>
export type StorageGuardLimits = StorageObservation & { operationReserveBytes: number }
export type StorageGuardPolicy = { limits: StorageGuardLimits; leaseMs: number }
export type StorageGuardNative = { observe: () => Promise<StorageObservation>; stop: () => Promise<string[]> }

/** The guard alone owns this record; ordinary owner operations only read it. */
export async function runStorageGuardCycle(target: PrereleaseTarget, policy: StorageGuardPolicy, native: StorageGuardNative) {
  const path = join(target.directory, 'control/storage-guard.json'), fingerprint = targetFingerprint(target)
  assertOwnerPath(path)
  let reason: string | null = null
  const observedAt = Date.now()
  let observation: StorageObservation | null = null
  if (existsSync(path)) {
    try {
      const previous: unknown = JSON.parse(readFileSync(path, 'utf8'))
      if (!previous || typeof previous !== 'object' || !('fingerprint' in previous) || previous.fingerprint !== fingerprint
        || !('status' in previous) || previous.status !== 'healthy') {
        reason = previous && typeof previous === 'object' && 'status' in previous && previous.status === 'latched'
          && 'reason' in previous && typeof previous.reason === 'string' && /^[a-zA-Z-]{1,80}$/.test(previous.reason)
          ? previous.reason : 'previous-latch-or-invalid-state'
      }
      else if (!('validUntil' in previous) || typeof previous.validUntil !== 'number' || previous.validUntil <= observedAt) reason = 'expired-observation'
    } catch { reason = 'invalid-state' }
  }
  if (!reason) {
    try {
      observation = await native.observe()
      for (const key of [...usageKeys, ...freeKeys]) {
        if (!Number.isSafeInteger(observation[key]) || observation[key] < 0) throw new Error('Invalid storage observation')
      }
      reason = usageKeys.find(key => observation !== null && observation[key] >= policy.limits[key])
        ?? freeKeys.find(key => observation !== null && observation[key] <= policy.limits[key]) ?? null
      if (Date.now() - observedAt >= policy.leaseMs) reason = 'observation-deadline'
    } catch { reason = 'observation-failed' }
  }
  if (reason) {
    const state = { format: 1, targetId: target.targetId, fingerprint, status: 'latched', reason, observedAt,
      validUntil: observedAt, operationsAllowed: false, observation }
    atomicJson(path, state)
    const failures = await native.stop().catch(() => ['stop-failed'])
    const stopped = { ...state, stoppedAt: Date.now(), failures }
    atomicJson(path, stopped)
    return stopped
  }
  if (!observation) throw new Error('Storage observation missing')
  const operationsAllowed = observation.hostFreeBytes - policy.limits.hostFreeBytes >= policy.limits.operationReserveBytes
    && observation.offsiteFreeBytes - policy.limits.offsiteFreeBytes >= policy.limits.operationReserveBytes
    && policy.limits.localBytes - observation.localBytes >= policy.limits.operationReserveBytes
    && policy.limits.offsiteBytes - observation.offsiteBytes >= policy.limits.operationReserveBytes
  const state = { format: 1, targetId: target.targetId, fingerprint, status: 'healthy', reason: null, observedAt,
    validUntil: observedAt + policy.leaseMs, operationsAllowed, observation }
  atomicJson(path, state)
  return state
}
