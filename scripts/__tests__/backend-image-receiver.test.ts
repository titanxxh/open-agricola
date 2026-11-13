import { spawn } from 'node:child_process'
import { chmodSync, existsSync, linkSync, readFileSync, readdirSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { admitBackendImageOperation, readBackendImageOperation, readBackendImageRequest, startBackendImageOperation } from '../release/backend-image-receiver'
import { createBackendImageFixture } from './_helpers/backend-image-fixture'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })

function fixture(...args: Parameters<typeof createBackendImageFixture>) {
  const value = createBackendImageFixture(...args); roots.push(value.root); return value
}

it('imports a fixed formal image through bounded intake without stopping the application', () => {
  const value = fixture(), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout.trim()).toBe(value.imageId)
  const report: unknown = JSON.parse(readFileSync(join(value.stage, 'image.json'), 'utf8'))
  expect(report).toMatchObject({ sourceSha: value.request.sourceSha, producerSha: value.request.producerSha, nativeImageId: value.imageId })
  const intake: string[] = JSON.parse(readFileSync(join(value.root, 'intake.json'), 'utf8'))
  expect(intake).toEqual(expect.arrayContaining(['--property=MemoryMax=402653184', '--property=MemorySwapMax=0', '--property=CPUQuota=100%', '--property=TasksMax=64']))
  expect(value.calls().some(args => ['compose', 'stop', 'start', 'build', 'tag'].includes(args[0]))).toBe(false)
  expect(readdirSync(value.stage).some(name => name.endsWith('.snapshot.tar'))).toBe(false)
})


it.each([
  ['digest', 'Image transfer digest differs'],
  ['purpose', 'Formal deployment requires a formal-candidate image'],
  ['channel', 'Image purpose and channel do not match'],
  ['truncated', 'Image transfer is incomplete'],
  ['source', 'Imported image differs from the fixed source or policy'],
  ['producer', 'Imported image differs from the fixed source or policy'],
  ['budget', 'Image intake cap exceeds import admission headroom'],
  ['expired', 'Formal image authorization is expired or invalid'],
  ['cgroup', 'Native image intake limits differ from the target budget'],
  ['memory', 'Formal image intake would cross the configured host memory reserve'],
  ['frontend', 'Hosted frontend does not match the image receipt'],
])('rejects %s before installing an application', (failure, message) => {
  const value = fixture()
  if (failure === 'digest') value.request.transfer.archive.sha256 = 'f'.repeat(64)
  if (failure === 'purpose') {
    value.request.transfer.receipt.purpose = 'candidate'; value.request.transfer.receipt.channel = 'prerelease'; value.request.transfer.receipt.verification.kind = 'prerelease'
  }
  if (failure === 'channel') value.request.transfer.receipt.channel = 'prerelease'
  if (failure === 'truncated') writeFileSync(value.archivePath, readFileSync(value.archivePath).subarray(0, -512))
  if (failure === 'source') value.request.sourceSha = 'd'.repeat(40)
  if (failure === 'producer') value.request.producerSha = 'd'.repeat(40)
  if (failure === 'budget') value.request.budget.import.memoryHeadroomMiB = 32
  if (failure === 'expired') value.request.expiresAt = Date.now() - 1
  if (failure === 'cgroup') value.state.wrongLimit = true
  if (failure === 'memory') value.state.lowMemory = true
  if (failure === 'frontend') value.state.badFrontend = true
  value.save()
  const result = value.invoke()
  expect(result.status, result.stdout).not.toBe(0)
  expect(result.stderr).toContain(message)
  expect(existsSync(join(value.stage, 'image.json'))).toBe(false)
  expect(value.calls().some(args => ['compose', 'stop', 'start', 'build', 'tag'].includes(args[0]))).toBe(false)
  if (failure !== 'frontend') expect(value.calls().some(args => args[0] === 'load')).toBe(false)
  if (failure === 'truncated') expect(existsSync(join(value.root, 'copied.json'))).toBe(false)
})

it('loads an independent snapshot when the uploaded archive changes during Docker intake', () => {
  const value = fixture(); value.state.mutateUpload = true; value.save()
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  const loaded: unknown = JSON.parse(readFileSync(join(value.root, 'loaded.json'), 'utf8'))
  expect(loaded).toEqual({ path: expect.stringMatching(/\.snapshot\.tar$/), sha256: value.request.transfer.archive.sha256 })
  expect(readFileSync(value.archivePath, 'utf8')).toBe('replaced SCP input')
})

it('rechecks the same immutable image before maintenance and allows only the authorization deadline to refresh', () => {
  const value = fixture()
  expect(value.invoke().status).toBe(0)
  value.request.expiresAt = Date.now() + 300_000; value.save()
  const confirmed = value.invoke('check')
  expect(confirmed.status, confirmed.stderr).toBe(0)
  expect(confirmed.stdout.trim()).toBe(value.imageId)
  const before = value.calls().length
  value.request.budget.reserveMemoryMiB += 1; value.save()
  const changed = value.invoke('check')
  expect(changed.status).not.toBe(0)
  expect(changed.stderr).toContain('Imported formal image belongs to another input or operation')
  expect(value.calls()).toHaveLength(before)
})


it.each([
  ['arm64', 'c'.repeat(40), 'Archive config ID or platform differs from receipt'],
  ['amd64', 'd'.repeat(40), 'Image source or channel differs from the receipt'],
])('rejects actual archive architecture %s and revision %s before Docker load', (architecture, revision, error) => {
  const value = fixture(architecture, revision), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain(error)
  expect(value.calls().some(args => args[0] === 'load')).toBe(false)
  expect(existsSync(join(value.stage, 'image.json'))).toBe(false)
})

it.each(['public-request', 'hard-linked-upload'])('refuses aliased or public private input: %s', failure => {
  const value = fixture()
  if (failure === 'public-request') chmodSync(join(value.stage, 'request.json'), 0o644)
  else linkSync(value.archivePath, join(value.stage, 'image-alias.tar'))
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Formal image input must be an owner-private regular file or directory')
  expect(value.calls().some(args => args[0] === 'load')).toBe(false)
})

it('binds explicit bootstrap inputs into the existing image intake authority', () => {
  const value = fixture()
  expect(value.invoke().status).toBe(0)
  const before = value.calls().length
  writeFileSync(value.requestPath, JSON.stringify({ ...value.request, installation: { kind: 'bootstrap', caddyImage: `caddy@sha256:${'d'.repeat(64)}` } }))
  const result = value.invoke('check')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Imported formal image belongs to another input or operation')
  expect(value.calls()).toHaveLength(before)
})

it('rejects a mutable Caddy tag as bootstrap authorization before importing an application', () => {
  const value = fixture()
  writeFileSync(value.requestPath, JSON.stringify({ ...value.request, installation: { kind: 'bootstrap', caddyImage: 'caddy:alpine' } }))
  expect(value.invoke().status).not.toBe(0)
  expect(value.calls()).toEqual([])
})

it('accepts a five-minute owner stamp slightly ahead of the independent server clock without accepting expired or distant stamps', () => {
  const value = fixture(), serverNow = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(serverNow)
  value.request.expiresAt = serverNow + 300_200; value.save()
  expect(readBackendImageRequest(value.requestPath).expiresAt).toBe(serverNow + 300_200)
  value.request.expiresAt = serverNow; value.save()
  expect(() => readBackendImageRequest(value.requestPath)).toThrow('expired')
  value.request.expiresAt = serverNow + 600_001; value.save()
  expect(() => readBackendImageRequest(value.requestPath)).toThrow('invalid')
})

it('carries only the fixed fresh admission through the bounded queue after the owner stamp expires', () => {
  const value = fixture(), serverNow = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(serverNow)
  value.request.expiresAt = serverNow + 300_000; value.save()
  admitBackendImageOperation(value.requestPath, 'intake')
  clock.mockReturnValue(serverNow + 20 * 60_000)
  expect(() => readBackendImageRequest(value.requestPath)).toThrow('expired')
  const started = startBackendImageOperation(value.requestPath, { kind: 'intake' })
  expect(started.workDeadline).toBe(serverNow + 40 * 60_000)
  expect(readBackendImageOperation(value.requestPath, 'intake').request.sourceSha).toBe(value.request.sourceSha)
  expect(() => startBackendImageOperation(value.requestPath, { kind: 'intake' })).toThrow('already started')
  clock.mockReturnValue(serverNow + 40 * 60_000 + 1)
  expect(() => readBackendImageOperation(value.requestPath, 'intake')).toThrow('deadline expired')
})

it('does not admit an expired request or start a queue that exceeded thirty minutes', () => {
  const value = fixture(), serverNow = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(serverNow)
  value.request.expiresAt = serverNow - 1; value.save()
  expect(() => admitBackendImageOperation(value.requestPath, 'intake')).toThrow('expired')
  expect(existsSync(join(value.stage, 'intake-admission.json'))).toBe(false)
  value.request.expiresAt = serverNow + 300_000; value.save()
  admitBackendImageOperation(value.requestPath, 'intake')
  clock.mockReturnValue(serverNow + 30 * 60_000 + 1)
  expect(() => startBackendImageOperation(value.requestPath, { kind: 'intake' })).toThrow('queue admission expired')
})

it.each(['binding', 'stamp'])('cannot change %s to renew or retarget an already admitted operation', change => {
  const value = fixture()
  admitBackendImageOperation(value.requestPath, 'intake')
  if (change === 'binding') value.request.budget.reserveMemoryMiB += 1
  else value.request.expiresAt += 1000
  value.save()
  expect(() => startBackendImageOperation(value.requestPath, { kind: 'intake' })).toThrow('differs from the original owner request')
  expect(() => admitBackendImageOperation(value.requestPath, 'intake')).toThrow('EEXIST')
})

it('preflights actual staging and Docker filesystems before upload, then cleans only a failed partial transfer after client expiry', () => {
  const value = fixture(), saved = join(value.root, 'local-image.tar')
  renameSync(value.archivePath, saved)
  const preflight = value.invoke('preflight')
  expect(preflight.status, preflight.stderr).toBe(0)
  expect(existsSync(join(value.stage, 'transfer-preflight.json'))).toBe(true)
  expect(value.calls().some(args => args[0] === 'info')).toBe(true)
  expect(existsSync(value.archivePath)).toBe(false)
  writeFileSync(value.archivePath, 'partial', { mode: 0o600 })
  value.request.expiresAt = Date.now() - 1; value.save()
  const discarded = value.invoke('discard-transfer')
  expect(discarded.status, discarded.stderr).toBe(0)
  expect(JSON.parse(discarded.stdout)).toEqual({ removedBytes: 7 })
  expect(existsSync(value.archivePath)).toBe(false)
  expect(existsSync(value.requestPath)).toBe(true)
  expect(existsSync(saved)).toBe(true)
  expect(value.invoke('discard-transfer').status).toBe(0)
  value.request.expiresAt = Date.now() + 300_000; value.save()
  expect(() => admitBackendImageOperation(value.requestPath, 'intake')).toThrow('EEXIST')
  expect(value.invoke().status).not.toBe(0)
})

it('does not clean partial bytes after the bounded preflight cleanup window', () => {
  const value = fixture(), saved = join(value.root, 'local-image.tar')
  renameSync(value.archivePath, saved)
  expect(value.invoke('preflight').status).toBe(0)
  writeFileSync(value.archivePath, 'retain for inspection', { mode: 0o600 })
  const proof = JSON.parse(readFileSync(join(value.stage, 'transfer-preflight.json'), 'utf8'))
  proof.checkedAt = Date.now() - 31 * 60_000; proof.cleanupUntil = proof.checkedAt + 30 * 60_000
  writeFileSync(join(value.stage, 'transfer-preflight.json'), JSON.stringify(proof))
  expect(value.invoke('discard-transfer').status).not.toBe(0)
  expect(readFileSync(value.archivePath, 'utf8')).toBe('retain for inspection')
})

it.each(['image.json', 'intake-admission.json', 'maintenance-admission.json', 'source.json'])('refuses transfer cleanup over active evidence %s', name => {
  const value = fixture(), saved = join(value.root, 'local-image.tar')
  renameSync(value.archivePath, saved)
  expect(value.invoke('preflight').status).toBe(0)
  writeFileSync(value.archivePath, 'retain active bytes', { mode: 0o600 })
  writeFileSync(join(value.stage, name), '{}', { mode: 0o600 })
  expect(value.invoke('discard-transfer').status).not.toBe(0)
  expect(readFileSync(value.archivePath, 'utf8')).toBe('retain active bytes')
})

it('refuses an actual filesystem reserve larger than its total capacity before upload', () => {
  const value = fixture(), saved = join(value.root, 'local-image.tar'), fs = statfsSync(value.stage)
  renameSync(value.archivePath, saved)
  value.request.budget.diskMiB = Math.ceil(fs.blocks * fs.bsize / 1024 / 1024) + 1
  value.save()
  const result = value.invoke('preflight')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('lacks conservative disk headroom')
  expect(existsSync(join(value.stage, 'transfer-preflight.json'))).toBe(false)
  expect(existsSync(value.archivePath)).toBe(false)
  expect(value.calls().some(args => args[0] === 'load')).toBe(false)
})

it('a real admitted intake claim prevents cleanup from removing its bytes', () => {
  const value = fixture(), saved = join(value.root, 'local-image.tar')
  renameSync(value.archivePath, saved)
  expect(value.invoke('preflight').status).toBe(0)
  renameSync(saved, value.archivePath)
  admitBackendImageOperation(value.requestPath, 'intake')
  const before = readFileSync(value.archivePath)
  expect(value.invoke('discard-transfer').status).not.toBe(0)
  expect(readFileSync(value.archivePath)).toEqual(before)
})

async function waitUntil(predicate: () => boolean): Promise<void> {
  const end = performance.now() + 5000
  while (!predicate()) {
    if (performance.now() > end) throw new Error('Native fixture synchronization timed out')
    await new Promise(done => setTimeout(done, 10))
  }
}

it('waits on real flock outside the intake unit, survives the fixed stamp expiry, and caps actual unit argv after server clock rollback', async () => {
  const value = fixture(), now = Date.now(), clockFile = join(value.root, 'server-clock'), preload = join(value.root, 'server-clock.mjs')
  value.request.expiresAt = now + 300_000; value.save()
  writeFileSync(clockFile, String(now))
  writeFileSync(preload, `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
const read=fs.readFileSync,rename=fs.renameSync;Date.now=()=>Number(read(${JSON.stringify(clockFile)},'utf8'));
fs.renameSync=(from,to)=>{const result=rename(from,to);if(String(to).endsWith('/intake-admission.json')){const value=JSON.parse(read(to,'utf8'));if(value.phase==='running')fs.writeFileSync(${JSON.stringify(clockFile)},String(value.startedAt-1000));}return result};syncBuiltinESMExports();`)
  const lock = join(value.directory, 'backups/.maintenance.lock')
  const holder = spawn(value.realFlock, ['-x', lock, process.execPath, '-e', "process.stdout.write('held');process.stdin.resume()"], { stdio: ['pipe', 'pipe', 'pipe'] })
  const holderClosed = new Promise<void>(done => holder.once('close', () => done()))
  let held = false; holder.stdout.on('data', () => { held = true })
  await waitUntil(() => held)
  const env = { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` }, launched = value.launch('receive', env)
  try {
    await waitUntil(() => existsSync(join(value.stage, 'intake-admission.json')) && existsSync(join(value.root, 'flock.jsonl')))
    expect(existsSync(join(value.root, 'intake.json'))).toBe(false)
    const calls: string[][] = readFileSync(join(value.root, 'flock.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(calls[0]?.slice(0, 3)).toEqual(['-w', '1800', lock])
    writeFileSync(clockFile, String(now + 20 * 60_000))
    holder.stdin.end(); await holderClosed
    const result = await launched.result
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe(value.imageId)
    const admitted = JSON.parse(readFileSync(join(value.stage, 'intake-admission.json'), 'utf8'))
    expect(admitted.startedAt).toBe(now + 20 * 60_000)
    expect(readFileSync(clockFile, 'utf8')).toBe(String(admitted.startedAt - 1000))
    const args: string[] = JSON.parse(readFileSync(join(value.root, 'intake.json'), 'utf8'))
    expect(args).toContain('--property=RuntimeMaxSec=1200')
    expect(args.slice(args.indexOf('--') + 1)).not.toContain('flock')
    expect(value.invoke('check', env).status).not.toBe(0)
  } finally {
    holder.stdin.end()
    holder.kill('SIGTERM')
    launched.child.kill('SIGTERM')
    await holderClosed
  }
}, 30_000)
