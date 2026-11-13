import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { stopStorageOperation } from '../prerelease/storage-operation'

it('interrupts the registered long owner session without waiting for its operation lock or killing an unrelated process', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-storage-session-'))
  const target = parsePrereleaseTarget({ ...JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')), directory: join(root, 'open-agricola-prerelease-main') })
  const control = join(target.directory, 'control'); mkdirSync(control, { recursive: true })
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'])
  const worker = spawn('setsid', ['--wait', 'flock', '-w', '1', join(control, '.operation.lock'), process.execPath, '--import', 'tsx', '--input-type=module', '-e',
    `import { registerStorageOperation } from ${JSON.stringify(resolve('scripts/prerelease/storage-operation.ts'))}; registerStorageOperation(${JSON.stringify(target)}); setInterval(()=>{},1000);`],
  { env: { ...process.env, PRERELEASE_LOCK_SCOPE: targetFingerprint(target) } })
  let stderr = ''; worker.stderr.on('data', chunk => { stderr += chunk.toString() })
  const exited = once(worker, 'exit')
  try {
    const deadline = Date.now() + 3000
    while (!existsSync(join(control, 'storage-operation.json')) && Date.now() < deadline) await new Promise(done => setTimeout(done, 20))
    expect(existsSync(join(control, 'storage-operation.json')), stderr).toBe(true)
    await stopStorageOperation(target)
    await exited
    expect(sentinel.exitCode).toBeNull()
    expect(() => process.kill(sentinel.pid ?? -1, 0)).not.toThrow()
    await expect(stopStorageOperation(target)).resolves.toBeUndefined()
  } finally {
    worker.kill(); sentinel.kill(); await once(sentinel, 'exit'); rmSync(root, { recursive: true, force: true })
  }
})
