import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { assertStorageAdmission } from '../prerelease/storage-guard-state'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-storage-guard-')); roots.push(root)
  const target = parsePrereleaseTarget({ ...JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')),
    directory: join(root, 'open-agricola-prerelease-main') })
  const control = join(target.directory, 'control'); mkdirSync(control, { recursive: true })
  const healthy = { format: 1, targetId: target.targetId, fingerprint: targetFingerprint(target), status: 'healthy', healthyCycle: 'ee4d6c82-676f-4dcc-a570-52377b3b32f5',
    observedAt: Date.now(), validUntil: Date.now() + 60_000, operationsAllowed: true }
  const save = (value: unknown) => writeFileSync(join(control, 'storage-guard.json'), JSON.stringify(value))
  return { target, control, healthy, save }
}
it('admits only a fresh target-bound storage observation and never clears a stop latch', () => {
  const value = fixture()
  expect(() => assertStorageAdmission(value.target, targetFingerprint(value.target))).toThrow(/storage guard/i)
  value.save(value.healthy)
  expect(() => assertStorageAdmission(value.target, targetFingerprint(value.target))).not.toThrow()
  for (const change of [{ status: 'latched' }, { fingerprint: 'a'.repeat(64) }, { validUntil: Date.now() - 1 }, { observedAt: Date.now() + 1000 }]) {
    value.save({ ...value.healthy, ...change })
    expect(() => assertStorageAdmission(value.target, targetFingerprint(value.target))).toThrow(/storage guard/i)
  }
  value.save({ ...value.healthy, operationsAllowed: false })
  expect(() => assertStorageAdmission(value.target, targetFingerprint(value.target), 'operation')).toThrow(/headroom/i)
  expect(() => assertStorageAdmission(value.target, targetFingerprint(value.target))).not.toThrow()
})

it('latches a complete observation exceeding any storage limit and retries every stop boundary independently', async () => {
  const { runStorageGuardCycle } = await import('../prerelease/storage-guard')
  const value = fixture()
  const observation = { sourceDatabaseBytes: 11, validationDatabaseBytes: 2, bucketBytes: 3, multipartBytes: 4,
    localBytes: 5, offsiteBytes: 6, hostFreeBytes: 100, hostFreeInodes: 100, offsiteFreeBytes: 100, offsiteFreeInodes: 100 }
  const limits = { ...observation, sourceDatabaseBytes: 10, hostFreeBytes: 10, hostFreeInodes: 10, offsiteFreeBytes: 10,
    offsiteFreeInodes: 10, operationReserveBytes: 10 }
  const calls: string[] = []
  const native = { observe: async () => observation, stop: async () => { calls.push('stop'); return ['pg unavailable'] } }
  const result = await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, native)
  expect(result.status).toBe('latched')
  expect(result.reason).toBe('sourceDatabaseBytes')
  expect(calls).toEqual(['stop'])
  expect(() => assertStorageAdmission(value.target, targetFingerprint(value.target))).toThrow(/latched/)
  const recovered = await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, {
    observe: async mode => { calls.push(`observe-${mode}`); return { ...observation, sourceDatabaseBytes: 3 } }, stop: async () => { calls.push('retry'); return [] },
  })
  expect(recovered.status).toBe('latched')
  expect(calls).toEqual(['stop', 'retry', 'observe-diagnostic'])
  expect(recovered).toMatchObject({ status: 'latched', reason: 'sourceDatabaseBytes', operationsAllowed: false,
    observation: { sourceDatabaseBytes: 3 }, diagnostics: 'available' })
  expect(() => assertStorageAdmission(value.target, targetFingerprint(value.target))).toThrow(/latched/)
})

it('closes admission on a probe failure without needing the deployment lock', async () => {
  const { runStorageGuardCycle } = await import('../prerelease/storage-guard')
  const value = fixture(), calls: string[] = []
  writeFileSync(join(value.control, '.operation.lock'), 'long-running-backup')
  const limits = { sourceDatabaseBytes: 10, validationDatabaseBytes: 10, bucketBytes: 10, multipartBytes: 10,
    localBytes: 10, offsiteBytes: 10, hostFreeBytes: 1, hostFreeInodes: 1, offsiteFreeBytes: 1, offsiteFreeInodes: 1, operationReserveBytes: 1 }
  const result = await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, {
    observe: async () => { throw new Error('private credential must not leak') }, stop: async () => { calls.push('stopped'); return [] },
  })
  expect(result).toMatchObject({ status: 'latched', reason: 'observation-failed', failures: [] })
  expect(JSON.stringify(result)).not.toContain('credential')
  expect(calls).toEqual(['stopped'])
})

it('rejects unmeasured limits and owner credentials inside candidate paths before native calls', async () => {
  const { parseStorageGuardConfig } = await import('../prerelease/storage-guard-native')
  const value = fixture()
  expect(() => parseStorageGuardConfig(value.target, {})).toThrow(/guard configuration/)
  expect(() => parseStorageGuardConfig(value.target, { format: 1, fingerprint: targetFingerprint(value.target),
    databaseJournal: join(value.target.directory, 'owner.json') })).toThrow(/outside|configuration/)
})


it.each(['probe-failure', 'healthy-write', 'forced-trip'])('stops independently when control persistence fails during %s and never heals the in-process latch', async fault => {
  const { runStorageGuardCycle } = await import('../prerelease/storage-guard')
  const value = fixture(), calls: string[] = []
  value.save(value.healthy)
  const observation = { sourceDatabaseBytes: 2, validationDatabaseBytes: 2, bucketBytes: 2, multipartBytes: 2,
    localBytes: 2, offsiteBytes: 2, hostFreeBytes: 100, hostFreeInodes: 100, offsiteFreeBytes: 100, offsiteFreeInodes: 100 }
  const limits = { ...observation, sourceDatabaseBytes: 10, validationDatabaseBytes: 10, bucketBytes: 10, multipartBytes: 10,
    localBytes: 10, offsiteBytes: 10, hostFreeBytes: 1, hostFreeInodes: 1, offsiteFreeBytes: 1, offsiteFreeInodes: 1, operationReserveBytes: 1 }
  chmodSync(value.control, 0o500)
  try {
    const result = await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, {
      observe: async () => { if (fault === 'probe-failure') throw new Error('probe unavailable'); return observation },
      stop: async () => { calls.push('stop'); return ['postgres-roles'] },
    }, fault === 'forced-trip' ? 'supervisor-stop' : undefined)
    expect(calls).toEqual(['stop'])
    expect(result).toMatchObject({ status: 'latched', failures: ['postgres-roles'] })
    expect(result.persistenceFailures).toContain('latch')
    expect(result.persistenceFailures).toContain('stop-receipt')
  } finally { chmodSync(value.control, 0o700) }
  const recoveredDisk = await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, {
    observe: async () => observation, stop: async () => { calls.push('retry'); return [] },
  })
  expect(recoveredDisk).toMatchObject({ status: 'latched', operationsAllowed: false, persistenceFailures: [], diagnostics: 'available' })
  expect(calls).toEqual(['stop', 'retry'])
  expect(() => assertStorageAdmission(value.target, targetFingerprint(value.target))).toThrow(/latched/)
})


it('preserves a healthy cycle across samples and requires a new acceptance cycle after manual latch archival', async () => {
  const { runStorageGuardCycle } = await import('../prerelease/storage-guard')
  const value = fixture()
  const observation = { sourceDatabaseBytes: 2, validationDatabaseBytes: 2, bucketBytes: 2, multipartBytes: 2,
    localBytes: 2, offsiteBytes: 2, hostFreeBytes: 100, hostFreeInodes: 100, offsiteFreeBytes: 100, offsiteFreeInodes: 100 }
  const limits = { ...observation, sourceDatabaseBytes: 10, validationDatabaseBytes: 10, bucketBytes: 10, multipartBytes: 10,
    localBytes: 10, offsiteBytes: 10, hostFreeBytes: 1, hostFreeInodes: 1, offsiteFreeBytes: 1, offsiteFreeInodes: 1, operationReserveBytes: 1 }
  const native = { observe: async () => observation, stop: async () => [] }
  const first = await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, native)
  expect(first.healthyCycle).toMatch(/^[a-f0-9-]{36}$/)
  expect(await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, native)).toMatchObject({ healthyCycle: first.healthyCycle })
  await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, native, 'supervisor-stop')
  expect(await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, native)).toMatchObject({ status: 'latched' })
  rmSync(join(value.control, 'storage-guard.json'))
  const recovered = await runStorageGuardCycle(value.target, { limits, leaseMs: 60_000 }, native)
  expect(recovered.status).toBe('healthy')
  expect(recovered.healthyCycle).not.toBe(first.healthyCycle)
})
