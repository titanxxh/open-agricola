import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePrereleaseTarget, targetFingerprint } from './config'
import { readStorageGuardConfig, nativeStorageGuard } from './storage-guard-native'
import { runStorageGuardCycle } from './storage-guard'
import { atomicJson } from './runtime'

export async function storageGuard(args: string[]) {
  const [action, targetFile, guardFile] = args
  if (!['once', 'watch', 'trip', '_once', '_watch', '_trip'].includes(action) || !targetFile || !guardFile || args.length !== 3) throw new Error('Use storage-guard-cli.ts once|watch|trip <target.json> <private-guard.json>')
  const target = parsePrereleaseTarget(JSON.parse(readFileSync(targetFile, 'utf8')))
  const config = readStorageGuardConfig(target, guardFile)
  const fingerprint = targetFingerprint(target)
  if (!action.startsWith('_')) {
    mkdirSync(join(target.directory, 'control'), { recursive: true, mode: 0o700 })
    const result = spawnSync('flock', ['-n', join(target.directory, 'control/.storage-guard.lock'), process.execPath,
      '--import', 'tsx', fileURLToPath(import.meta.url), `_${action}`, resolve(targetFile), resolve(guardFile)],
    { env: { ...process.env, PRERELEASE_GUARD_LOCK: fingerprint }, stdio: 'inherit' })
    if (result.error || result.status !== 0) throw new Error('Storage guard failed or another guard owns the target')
    return
  }
  if (process.env.PRERELEASE_GUARD_LOCK !== fingerprint) throw new Error('Storage guard lock is required')
  const native = nativeStorageGuard(target, config)
  if (action === '_trip') atomicJson(join(target.directory, 'control/storage-guard.json'), {
    format: 1, targetId: target.targetId, fingerprint, status: 'latched', reason: 'supervisor-stop', observedAt: Date.now(),
    validUntil: Date.now(), operationsAllowed: false,
  })
  const notify = (ready = false) => {
    if (action === '_watch') execFileSync('systemd-notify', [...(ready ? ['--ready'] : []), 'WATCHDOG=1'], { timeout: 3000, stdio: 'ignore' })
  }
  notify(true)
  do {
    const result = await runStorageGuardCycle(target, config, native)
    // Only resource counts and fixed diagnostic names leave this process, never credentials or object keys.
    process.stdout.write(JSON.stringify(result) + '\n')
    notify()
    if (action !== '_watch') return
    await new Promise(done => setTimeout(done, config.intervalMs))
  } while (action === '_watch')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await storageGuard(process.argv.slice(2)) }
  catch { console.error('Owner storage guard failed; admission remains closed until a fresh observation or explicit latch recovery'); process.exitCode = 1 }
}
