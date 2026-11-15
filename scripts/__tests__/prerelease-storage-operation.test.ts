import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { stopStorageOperation } from '../prerelease/storage-operation'

type OperationIdentity = { fingerprint: string; pid: number; group: number; started: string; leaderStarted: string }
const operationModule = resolve('scripts/prerelease/storage-operation.ts')

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000
  while (!predicate() && Date.now() < deadline) await new Promise(done => setTimeout(done, 10))
  expect(predicate()).toBe(true)
}

function identity(pid: number) {
  const raw = readFileSync(`/proc/${pid}/stat`, 'utf8'), fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ')
  return { state: fields[0], started: fields[19] }
}

async function operationFixture(body = 'setInterval(()=>{},1000);', leaderBody?: (program: string, root: string) => string) {
  const root = mkdtempSync(join(tmpdir(), 'oa-storage-operation-race-'))
  const target = parsePrereleaseTarget({ ...JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')), directory: join(root, 'open-agricola-prerelease-main') })
  const control = join(target.directory, 'control'); mkdirSync(control, { recursive: true })
  const recordFile = join(control, 'storage-operation.json')
  const program = `import { registerStorageOperation } from ${JSON.stringify(operationModule)}; registerStorageOperation(${JSON.stringify(target)}); ${body}`
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']), sentinelExit = once(sentinel, 'exit')
  const worker = spawn('setsid', ['--wait', 'flock', '-w', '1', join(control, '.operation.lock'), process.execPath,
    ...(leaderBody ? [] : ['--import', 'tsx']), '--input-type=module', '-e', leaderBody?.(program, root) ?? program],
  { env: { ...process.env, PRERELEASE_LOCK_SCOPE: targetFingerprint(target) } })
  let stderr = ''; worker.stderr.on('data', chunk => { stderr += chunk.toString() })
  const exited = once(worker, 'exit')
  let record: OperationIdentity | undefined
  const cleanup = async () => {
    if (record) {
      for (const [pid, started, group] of [[record.group, record.leaderStarted, true], [record.pid, record.started, false]] as const) {
        try { if (identity(pid).started === started) process.kill(group ? -pid : pid, 'SIGKILL') }
        catch (error) { if (!(error instanceof Error && 'code' in error && ['ENOENT', 'ESRCH'].includes(String(error.code)))) throw error }
      }
    }
    worker.kill(); sentinel.kill(); await Promise.all([exited, sentinelExit]); rmSync(root, { recursive: true, force: true })
  }
  try {
    await waitFor(() => existsSync(recordFile))
    record = JSON.parse(readFileSync(recordFile, 'utf8'))
    if (!record) throw new Error('Missing registered operation')
    expect(worker.exitCode, stderr).toBeNull()
    return { root, target, control, recordFile, record, worker, exited, sentinel, cleanup, program }
  } catch (error) { await cleanup(); throw error }
}

it('is idempotent when the real recorded process vanishes between the existence check and stat read', async () => {
  const fixture = await operationFixture()
  const stopper = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const original = fs.readFileSync; let intercepted = false;
    fs.readFileSync = function(path, ...args) {
      if (!intercepted && String(path) === ${JSON.stringify(`/proc/${fixture.record.pid}/stat`)}) {
        intercepted = true; if (!fs.existsSync(path)) throw Error('Recorded process was not initially live');
        fs.writeSync(1, 'STAT_BARRIER\\n'); fs.readSync(0, Buffer.alloc(1), 0, 1, null);
      }
      return original.call(this, path, ...args);
    };
    syncBuiltinESMExports();
    const { stopStorageOperation } = await import(${JSON.stringify(operationModule)});
    await stopStorageOperation(${JSON.stringify(fixture.target)}); console.log('STOP_OK');
  `])
  const stopped = once(stopper, 'exit'); let stdout = '', stderr = ''
  stopper.stdout.on('data', chunk => { stdout += chunk.toString() }); stopper.stderr.on('data', chunk => { stderr += chunk.toString() })
  try {
    await waitFor(() => stdout.includes('STAT_BARRIER'))
    // Only timing is gated: the error comes from the real kernel after a real child exits and is reaped.
    process.kill(fixture.record.pid, 'SIGKILL'); await fixture.exited
    expect(existsSync(`/proc/${fixture.record.pid}`)).toBe(false)
    stopper.stdin.end('1'); const [code] = await stopped
    expect(code, stderr).toBe(0); expect(stdout).toContain('STOP_OK')
    expect(fixture.sentinel.exitCode).toBeNull(); expect(() => process.kill(fixture.sentinel.pid!, 0)).not.toThrow()
  } finally { stopper.kill(); await stopped; await fixture.cleanup() }
})

it('does not signal an owner group after its registered operation becomes a real zombie', async () => {
  const fixture = await operationFixture('process.exit(0);', (program, root) => `
    import { spawn } from 'node:child_process'; import { readFileSync, writeFileSync } from 'node:fs';
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', ${JSON.stringify(program)}], { stdio: 'ignore' });
    const sleeper = new Int32Array(new SharedArrayBuffer(4)); let zombie = false; const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      try { const raw = readFileSync('/proc/' + child.pid + '/stat', 'utf8');
        if (raw.slice(raw.lastIndexOf(')') + 2).split(' ')[0] === 'Z') { zombie = true; break; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      Atomics.wait(sleeper, 0, 0, 10);
    }
    if (!zombie) process.exit(2);
    writeFileSync(${JSON.stringify(join(root, 'zombie-ready'))}, 'ready');
    // Blocking this fixture parent's event loop deliberately keeps its exited child unreaped.
    Atomics.wait(sleeper, 0, 0, 60000);
  `)
  try {
    await waitFor(() => existsSync(join(fixture.root, 'zombie-ready')))
    expect(identity(fixture.record.pid).state).toBe('Z')
    await expect(stopStorageOperation(fixture.target)).resolves.toBeUndefined()
    expect(identity(fixture.record.group).started).toBe(fixture.record.leaderStarted)
    expect(fixture.worker.exitCode).toBeNull(); expect(fixture.sentinel.exitCode).toBeNull()
  } finally { await fixture.cleanup() }
})

it('fails closed without signalling when the recorded operation is live but its real group leader has exited', async () => {
  const fixture = await operationFixture()
  try {
    process.kill(fixture.record.group, 'SIGKILL'); await fixture.exited
    await waitFor(() => !existsSync(`/proc/${fixture.record.group}`))
    expect(['Z', 'X', 'x']).not.toContain(identity(fixture.record.pid).state)
    await expect(stopStorageOperation(fixture.target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(() => process.kill(fixture.record.pid, 0)).not.toThrow()
    expect(fixture.sentinel.exitCode).toBeNull()
  } finally { await fixture.cleanup() }
})

for (const [file, code] of [['owner', 'EACCES'], ['environ', 'EIO']] as const) {
  it(`does not swallow ${code} while checking a live registered ${file}`, async () => {
    const fixture = await operationFixture()
    const path = file === 'owner' ? `/proc/${fixture.record.pid}/stat` : `/proc/${fixture.record.group}/environ`
    const checker = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module'; const original = fs.readFileSync;
      fs.readFileSync = function(path, ...args) {
        if (String(path) === ${JSON.stringify(path)}) throw Object.assign(new Error('Injected read failure'), { code: ${JSON.stringify(code)} });
        return original.call(this, path, ...args);
      }; syncBuiltinESMExports();
      const { stopStorageOperation } = await import(${JSON.stringify(operationModule)});
      try { await stopStorageOperation(${JSON.stringify(fixture.target)}); process.exitCode = 1; }
      catch (error) { if (error.code !== ${JSON.stringify(code)}) { console.error(error); process.exitCode = 2; } }
    `])
    let stderr = ''; checker.stderr.on('data', chunk => { stderr += chunk.toString() })
    const checked = once(checker, 'exit')
    try {
      const [exit] = await checked; expect(exit, stderr).toBe(0)
      expect(() => process.kill(fixture.record.pid, 0)).not.toThrow(); expect(fixture.sentinel.exitCode).toBeNull()
    } finally { checker.kill(); await checked; await fixture.cleanup() }
  })
}

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
