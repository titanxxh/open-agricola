import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { storageGuard } from '../prerelease/storage-guard-cli'
import { nativeStorageGuard } from '../prerelease/storage-guard-native'
import type { StorageObservation } from '../prerelease/storage-guard'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(), spawnSync: vi.fn(() => ({ status: 0 })) }))
vi.mock('../prerelease/storage-guard-native', async importOriginal => ({
  ...await importOriginal<typeof import('../prerelease/storage-guard-native')>(),
  nativeStorageGuard: vi.fn(),
}))

const roots: string[] = []
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})
function fixture(timing = { intervalMs: 15_000, probeTimeoutMs: 30_000, leaseMs: 90_000 }) {
  const root = mkdtempSync(join(tmpdir(), 'oa-guard-watch-')); roots.push(root)
  const target = parsePrereleaseTarget({ ...JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')),
    directory: join(root, 'open-agricola-prerelease-main') })
  const targetFile = join(root, 'target.json'), guardFile = join(root, 'guard.json')
  writeFileSync(targetFile, JSON.stringify(target), { mode: 0o600 })
  writeFileSync(guardFile, JSON.stringify({ format: 1, fingerprint: targetFingerprint(target), ...timing,
    databaseJournal: join(root, 'database.json'), objectJournal: join(root, 'objects.json'), rootEnvironmentFile: join(root, 'root.env'),
    objectEndpoint: 'http://127.0.0.1:19000', postgresContainer: 'a'.repeat(64), postgresAdmin: 'owner', tempFileLimitBytes: 1024,
    filesystems: [root], limits: { sourceDatabaseBytes: 1000, validationDatabaseBytes: 1000, bucketBytes: 1000, multipartBytes: 1000,
      localBytes: 1000, offsiteBytes: 1000, hostFreeBytes: 1, hostFreeInodes: 1, offsiteFreeBytes: 1, offsiteFreeInodes: 1, operationReserveBytes: 1 },
  }), { mode: 0o600 })
  vi.stubEnv('PRERELEASE_GUARD_LOCK', targetFingerprint(target))
  return { targetFile, guardFile }
}

it.each(['watch', '_watch'])('rejects the 80/30/120 timing before %s can start under watchdog90', async action => {
  const { targetFile, guardFile } = fixture({ intervalMs: 80_000, probeTimeoutMs: 30_000, leaseMs: 120_000 })
  vi.stubEnv('WATCHDOG_USEC', '90000000')
  await expect(storageGuard([action, targetFile, guardFile])).rejects.toThrow(/watchdog/i)
  expect(spawnSync).not.toHaveBeenCalled()
  expect(execFileSync).not.toHaveBeenCalled()
  expect(nativeStorageGuard).not.toHaveBeenCalled()
})

it.each([undefined, '', '0', '-1', 'NaN', 'Infinity', '90000000junk', '9e7', '90000000.5', '9007199254740992'])('rejects missing or invalid watchdog information: %s', async usec => {
  const { targetFile, guardFile } = fixture()
  vi.stubEnv('WATCHDOG_USEC', usec)
  await expect(storageGuard(['watch', targetFile, guardFile])).rejects.toThrow(/WATCHDOG_USEC/)
  expect(spawnSync).not.toHaveBeenCalled()
})

it('reserves notification and local processing time inside the actual watchdog deadline', async () => {
  const { targetFile, guardFile } = fixture()
  vi.stubEnv('WATCHDOG_USEC', '55000000')
  await expect(storageGuard(['watch', targetFile, guardFile])).rejects.toThrow(/watchdog/i)
  vi.stubEnv('WATCHDOG_USEC', '55000001')
  await storageGuard(['watch', targetFile, guardFile])
  expect(spawnSync).toHaveBeenCalledOnce()
})

it('accepts 15/30/90 and passes the supervisor deadline into the locked child', async () => {
  const { targetFile, guardFile } = fixture()
  vi.stubEnv('WATCHDOG_USEC', '90000000')
  await storageGuard(['watch', targetFile, guardFile])
  expect(spawnSync).toHaveBeenCalledWith('flock', expect.arrayContaining(['_watch', targetFile, guardFile]),
    expect.objectContaining({ env: expect.objectContaining({ WATCHDOG_USEC: '90000000' }) }))
})

it.each(['once', 'trip'])('keeps %s available without a supervisor watchdog', async action => {
  const { targetFile, guardFile } = fixture()
  vi.stubEnv('WATCHDOG_USEC', undefined)
  await storageGuard([action, targetFile, guardFile])
  expect(spawnSync).toHaveBeenCalledOnce()
})

it('does not refresh the watchdog while a collection cycle is stalled', async () => {
  const { targetFile, guardFile } = fixture()
  vi.stubEnv('WATCHDOG_USEC', '90000000')
  vi.useFakeTimers()
  let markStarted!: () => void, complete!: (value: StorageObservation) => void
  const started = new Promise<void>(resolve => { markStarted = resolve })
  const completed = new Promise<StorageObservation>(resolve => { complete = resolve })
  vi.mocked(nativeStorageGuard).mockReturnValueOnce({
    observe: () => { markStarted(); return completed }, stop: async () => [],
  })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.mocked(execFileSync).mockImplementationOnce(() => '').mockImplementationOnce(() => { throw new Error('cycle complete') })
  const running = storageGuard(['_watch', targetFile, guardFile])
  await started
  await vi.advanceTimersByTimeAsync(89_000)
  expect(execFileSync).toHaveBeenCalledTimes(1)
  expect(execFileSync).toHaveBeenCalledWith('systemd-notify', ['--ready', 'WATCHDOG=1'], expect.any(Object))
  complete({ sourceDatabaseBytes: 10, validationDatabaseBytes: 10, bucketBytes: 10, multipartBytes: 10,
    localBytes: 10, offsiteBytes: 10, hostFreeBytes: 100, hostFreeInodes: 100, offsiteFreeBytes: 100, offsiteFreeInodes: 100 })
  await expect(running).rejects.toThrow('cycle complete')
  expect(execFileSync).toHaveBeenCalledTimes(2)
  expect(execFileSync).toHaveBeenLastCalledWith('systemd-notify', ['WATCHDOG=1'], expect.any(Object))
})
