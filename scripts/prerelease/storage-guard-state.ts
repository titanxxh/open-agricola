import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** This separate owner file cannot race writes to gate.json or be changed by a candidate. */
export function readStorageGuard(path: string, targetId: string, fingerprint?: string): { operationsAllowed: boolean } | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const now = Date.now()
    if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 1
      || !('targetId' in value) || value.targetId !== targetId || !('fingerprint' in value)
      || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)
      || fingerprint !== undefined && value.fingerprint !== fingerprint || !('status' in value) || value.status !== 'healthy'
      || !('observedAt' in value) || typeof value.observedAt !== 'number' || value.observedAt > now
      || !('validUntil' in value) || typeof value.validUntil !== 'number' || value.validUntil <= now
      || value.validUntil - value.observedAt > 120_000 || !('operationsAllowed' in value) || typeof value.operationsAllowed !== 'boolean') return null
    return { operationsAllowed: value.operationsAllowed }
  } catch { return null }
}

export function assertStorageAdmission(target: { directory: string; targetId: string }, fingerprint: string, phase: 'idle' | 'operation' = 'idle'): void {
  const state = readStorageGuard(join(target.directory, 'control/storage-guard.json'), target.targetId, fingerprint)
  if (!state) throw new Error('Prerelease storage guard is missing, stale or latched; owner recovery is required')
  if (phase === 'operation' && !state.operationsAllowed) throw new Error('Prerelease storage headroom cannot admit another operation')
}
