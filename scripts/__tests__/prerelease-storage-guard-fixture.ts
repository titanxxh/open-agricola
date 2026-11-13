import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { targetFingerprint, type PrereleaseTarget } from '../prerelease/config'

export function seedStorageGuard(target: PrereleaseTarget) {
  const path = join(target.directory, 'control/storage-guard.json')
  if (existsSync(path)) return
  mkdirSync(join(target.directory, 'control'), { recursive: true })
  writeFileSync(path, JSON.stringify({ format: 1, targetId: target.targetId, fingerprint: targetFingerprint(target), status: 'healthy', healthyCycle: 'ee4d6c82-676f-4dcc-a570-52377b3b32f5',
    observedAt: Date.now(), validUntil: Date.now() + 120_000, operationsAllowed: true }))
}
