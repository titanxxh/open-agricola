import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicJson } from './runtime'
import { targetFingerprint, type PrereleaseTarget } from './config'

const usageKeys = ['sourceDatabaseBytes', 'validationDatabaseBytes', 'bucketBytes', 'multipartBytes', 'localBytes', 'offsiteBytes'] as const
const freeKeys = ['hostFreeBytes', 'hostFreeInodes', 'offsiteFreeBytes', 'offsiteFreeInodes'] as const
export type StorageObservation = Record<typeof usageKeys[number] | typeof freeKeys[number], number>
export type StorageGuardLimits = StorageObservation & { operationReserveBytes: number }
export type StorageGuardPolicy = { limits: StorageGuardLimits; leaseMs: number }
export type StorageGuardNative = { observe: (mode?: 'admission' | 'diagnostic') => Promise<StorageObservation>; stop: () => Promise<string[]> }

// An unwritable control directory must not let a later successful probe erase the incident.
const unpersistedLatches = new Map<string, string>()

/** The guard alone owns this record; ordinary owner operations only read it. */
export async function runStorageGuardCycle(target: PrereleaseTarget, policy: StorageGuardPolicy, native: StorageGuardNative, forceTripReason?: 'supervisor-stop') {
  const path = join(target.directory, 'control/storage-guard.json'), fingerprint = targetFingerprint(target)
  let reason: string | null = unpersistedLatches.get(fingerprint) ?? forceTripReason ?? null
  const persistenceFailures: string[] = []
  const persist = (value: unknown, phase: string) => {
    try { atomicJson(path, value); return true } catch { persistenceFailures.push(phase); return false }
  }
  const observedAt = Date.now()
  let observation: StorageObservation | null = null
  let observationCompletedAt: number | null = null
  if (!reason && existsSync(path)) {
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
  const wasLatched = reason !== null
  const observe = async (mode: 'admission' | 'diagnostic') => {
    const value = await native.observe(mode)
    for (const key of [...usageKeys, ...freeKeys]) {
      if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Invalid storage observation')
    }
    observationCompletedAt = Date.now()
    return value
  }
  if (!reason) {
    try {
      observation = await observe('admission')
      reason = usageKeys.find(key => observation !== null && observation[key] >= policy.limits[key])
        ?? freeKeys.find(key => observation !== null && observation[key] <= policy.limits[key]) ?? null
      if (Date.now() - observedAt >= policy.leaseMs) reason = 'observation-deadline'
    } catch { reason = 'observation-failed' }
  }
  if (!reason && observation) {
    const operationsAllowed = observation.hostFreeBytes - policy.limits.hostFreeBytes >= policy.limits.operationReserveBytes
      && observation.offsiteFreeBytes - policy.limits.offsiteFreeBytes >= policy.limits.operationReserveBytes
      && policy.limits.localBytes - observation.localBytes >= policy.limits.operationReserveBytes
      && policy.limits.offsiteBytes - observation.offsiteBytes >= policy.limits.operationReserveBytes
    const state = { format: 1, targetId: target.targetId, fingerprint, status: 'healthy', reason: null, observedAt,
      validUntil: observedAt + policy.leaseMs, operationsAllowed, observation, persistenceFailures }
    if (persist(state, 'heartbeat')) return state
    reason = 'state-persistence-failed'
  }
  reason ??= 'observation-missing'
  unpersistedLatches.set(fingerprint, reason)
  const state = { format: 1, targetId: target.targetId, fingerprint, status: 'latched', reason, observedAt,
    validUntil: observedAt, operationsAllowed: false, observation, persistenceFailures }
  if (persist(state, 'latch')) unpersistedLatches.delete(fingerprint)
  const failures = await native.stop().catch(() => ['stop-failed'])
  const stoppedAt = Date.now()
  if (wasLatched) {
    try { observation = await observe('diagnostic') } catch { observation = null }
  }
  const stopped = { ...state, stoppedAt, failures, observation,
    diagnostics: observation ? 'available' : 'unavailable', observationCompletedAt }
  if (persist(stopped, 'stop-receipt')) unpersistedLatches.delete(fingerprint)
  return stopped
}
