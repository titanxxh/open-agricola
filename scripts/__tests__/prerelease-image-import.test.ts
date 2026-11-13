import { createHash } from 'node:crypto'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { FULL_TASK_IDS } from '../ci/verification-tasks'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { readRuntime, writeRuntime } from '../prerelease/runtime'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-pre-image-')); roots.push(root)
  const target = parsePrereleaseTarget({ ...JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')),
    directory: join(root, 'open-agricola-prerelease-main'), policyDirectory: resolve('.') })
  mkdirSync(target.directory)
  const bin = join(root, 'bin'), payload = join(root, 'payload'); mkdirSync(bin); mkdirSync(payload)
  const producerSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceSha = 'a'.repeat(40)
  const layer = Buffer.alloc(1024), config = JSON.stringify({ os: 'linux', architecture: 'amd64',
    config: { Labels: { 'org.opencontainers.image.revision': sourceSha, 'io.open-agricola.release-channel': 'prerelease' } },
    rootfs: { type: 'layers', diff_ids: [`sha256:${sha256(layer)}`] } })
  const imageId = `sha256:${sha256(config)}`
  writeFileSync(join(payload, 'config.json'), config); writeFileSync(join(payload, 'layer.tar'), layer)
  writeFileSync(join(payload, 'manifest.json'), JSON.stringify([{ Config: 'config.json', RepoTags: null, Layers: ['layer.tar'] }]))
  const archivePath = join(root, 'image.tar')
  execFileSync('tar', ['-cf', archivePath, '-C', payload, 'manifest.json', 'config.json', 'layer.tar']); chmodSync(archivePath, 0o600)
  const transfer = { format: 1, receipt: { format: 1, repository: 'titanxxh/open-agricola', repositoryId: 123,
    purpose: 'candidate', channel: 'prerelease', sourceSha, producerSha, platform: 'linux/amd64', registryRepository: 'ghcr.io/titanxxh/open-agricola-images',
    manifestDigest: `sha256:${'f'.repeat(64)}`, imageId, build: { runId: 42, runAttempt: 1 },
    verification: { kind: 'prerelease', configuration: 'b'.repeat(64), producerConfiguration: 'c'.repeat(64),
      tasks: FULL_TASK_IDS.map((id, index) => ({ id, runId: 40, jobId: index + 1, runAttempt: 1 })).sort((a, b) => a.id.localeCompare(b.id)) } },
    archive: { sha256: sha256(readFileSync(archivePath)), bytes: readFileSync(archivePath).length } }
  const metadata = { format: 1, gameBuildId: sourceSha, basePath: '/open-agricola/', releaseChannel: 'prerelease', deploymentTarget: 'prerelease-hosted' }
  const callsPath = join(root, 'calls.jsonl'), statePath = join(root, 'docker-state.json')
  const state = { app: false, platform: 'x86_64', failLoad: false, badFrontend: false, pauseLoad: false }
  const save = () => writeFileSync(statePath, JSON.stringify(state)); save()
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs'),a=process.argv.slice(2),s=JSON.parse(fs.readFileSync(${JSON.stringify(statePath)},'utf8'));
fs.appendFileSync(${JSON.stringify(callsPath)},JSON.stringify(a)+'\\n');
const out=x=>process.stdout.write(typeof x==='string'?x:JSON.stringify(x));
if(a[0]==='ps'){if(a.join(' ').includes('com.docker.compose.service=app')&&s.app)out('e'.repeat(64));}
else if(a[0]==='context')out({Host:'unix:///var/run/docker.sock'});
else if(a[0]==='info')out({OSType:'linux',Architecture:s.platform,DockerRootDir:${JSON.stringify(root)}});
else if(a[0]==='load'){
  if(s.failLoad)process.exit(42);
  if(s.pauseLoad){
    fs.writeFileSync(${JSON.stringify(join(root, 'load-waiting'))},a.at(-1));
    const until=Date.now()+10000;while(!fs.existsSync(${JSON.stringify(join(root, 'load-resume'))})&&Date.now()<until)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
    const digest=require('node:crypto').createHash('sha256').update(fs.readFileSync(a.at(-1))).digest('hex');
    fs.writeFileSync(${JSON.stringify(join(root, 'loaded-sha'))},digest);
    if(digest!==${JSON.stringify(transfer.archive.sha256)})process.exit(43);
  }
}
else if(a[0]==='image'&&a[1]==='inspect')out([{Id:${JSON.stringify(imageId)},Os:'linux',Architecture:'amd64',Config:JSON.parse(${JSON.stringify(config)}).config}]);
else if(a[0]==='create')out('f'.repeat(64));
else if(a[0]==='cp')fs.writeFileSync(a.at(-1),JSON.stringify({...${JSON.stringify(metadata)},...(s.badFrontend?{gameBuildId:'bad'}:{})}));
else if(a[0]==='rm'){}else process.exit(2);
`, { mode: 0o700 })
  const operationId = '7e1b543f-5ef1-4a03-8e3b-8dcefd63a665'
  type InvocationOptions = { transfer?: unknown; expiresAt?: number; expectedCurrent?: string; operationId?: string }
  const environment = { ...process.env, CI: '', GITHUB_ACTIONS: '', SSH_CONNECTION: 'owner fixture', PATH: `${bin}:${process.env.PATH}` }
  const input = (action: string, options: InvocationOptions) => JSON.stringify({ format: 1, policySha: producerSha,
    expiresAt: options.expiresAt ?? Date.now() + 300_000, fingerprint: targetFingerprint(target), target,
    request: { action, expectedCurrent: options.expectedCurrent ?? 'empty', operationId: options.operationId ?? operationId, transfer: options.transfer ?? transfer } })
  const args = ['--import', 'tsx', 'scripts/prerelease/operations.ts', 'receive']
  const invoke = (action: string, options: InvocationOptions = {}) => spawnSync(process.execPath, args,
    { encoding: 'utf8', timeout: 30_000, env: environment, input: input(action, options) })
  const invokeAsync = (action: string) => {
    const child = spawn(process.execPath, args, { env: environment, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', value => { stdout += value.toString() }); child.stderr.on('data', value => { stderr += value.toString() })
    child.stdin.end(input(action, {}))
    return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      child.once('error', reject); child.once('close', status => resolve({ status, stdout, stderr }))
    })
  }
  const stage = () => {
    const result = invoke('prepare-image-import'); expect(result.status, result.stderr).toBe(0)
    const path = JSON.parse(result.stdout).archivePath
    copyFileSync(archivePath, path); chmodSync(path, 0o600); return path
  }
  return { root, target, producerSha, sourceSha, transfer, imageId, operationId, invoke, invokeAsync, stage, state, save,
    cache: join(target.directory, 'control', `image-candidate-${sourceSha}-${producerSha}.json`),
    calls: () => existsSync(callsPath) ? readFileSync(callsPath, 'utf8') : '' }
}

it('prepares a private fixed-image transfer through the owner receiver without runtime or credential setup', () => {
  const value = fixture(), result = value.invoke('prepare-image-import')
  expect(result.status, result.stderr).toBe(0)
  const prepared = JSON.parse(result.stdout)
  expect(prepared).toMatchObject({ imageId: value.imageId })
  expect(prepared.archivePath).toBe(join(value.target.directory, 'control', `image-import-${value.operationId}.tar`))
  expect(existsSync(join(value.target.directory, 'control/gate.json'))).toBe(false)
  expect(existsSync(join(value.target.directory, 'control/compose.json'))).toBe(false)
  expect(value.calls()).not.toMatch(/buildx|"run"|"start"|"load"/)
})

it('validates and loads the bounded tag-free archive before publishing its target-bound cache record', () => {
  const value = fixture(), path = value.stage(), result = value.invoke('import-image')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(readFileSync(value.cache, 'utf8'))).toMatchObject({ fingerprint: targetFingerprint(value.target), transfer: value.transfer })
  expect(existsSync(path)).toBe(false)
  expect(existsSync(join(value.target.directory, 'control/gate.json'))).toBe(false)
  expect(value.calls()).toContain('"load","--platform","linux/amd64"')
  expect(value.calls()).not.toMatch(/buildx|"run"|"start"|"tag"/)
})

it('loads the validated snapshot while a concurrent upload replaces the operation transfer path', async () => {
  const value = fixture(), upload = value.stage()
  value.state.pauseLoad = true; value.save()
  const importing = value.invokeAsync('import-image')
  const waiting = join(value.root, 'load-waiting'), deadline = Date.now() + 10_000
  while (!existsSync(waiting) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
  expect(existsSync(waiting)).toBe(true)
  writeFileSync(upload, 'another invocation overwrote the upload')
  writeFileSync(join(value.root, 'load-resume'), '')
  const result = await importing
  expect(result.status, result.stderr).toBe(0)
  expect(readFileSync(join(value.root, 'loaded-sha'), 'utf8')).toBe(value.transfer.archive.sha256)
  expect(readFileSync(waiting, 'utf8')).not.toBe(upload)
  expect(existsSync(readFileSync(waiting, 'utf8'))).toBe(false)
})

it('retains the original image binding across interrupted load and rejects a same-source replacement', () => {
  const value = fixture(); value.stage(); value.state.failLoad = true; value.save()
  expect(value.invoke('import-image').status).not.toBe(0)
  expect(existsSync(value.cache)).toBe(false)
  expect(readdirSync(join(value.target.directory, 'control')).some(name => name.startsWith('image-snapshot-'))).toBe(false)
  const changed = { ...value.transfer, receipt: { ...value.transfer.receipt, imageId: `sha256:${'d'.repeat(64)}` } }
  expect(value.invoke('prepare-image-import', { transfer: changed }).stderr).toContain('original image transfer')
  value.state.failLoad = false; value.save()
  expect(value.invoke('import-image').status).toBe(0)
  expect(JSON.parse(readFileSync(value.cache, 'utf8')).transfer.receipt.imageId).toBe(value.imageId)
})

it('allows a new transport archive for the exact original receipt only after preparing it again', () => {
  const value = fixture(), path = value.stage()
  const bytes = Buffer.concat([readFileSync(path), Buffer.alloc(1024)])
  const transfer = { ...value.transfer, archive: { sha256: sha256(bytes), bytes: bytes.length } }
  expect(value.invoke('import-image', { transfer }).stderr).toContain('prepared transfer')
  expect(value.invoke('prepare-image-import', { transfer }).status).toBe(0)
  expect(readFileSync(path).length).toBe(0)
  writeFileSync(path, bytes, { mode: 0o600 })
  const result = value.invoke('import-image', { transfer })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(readFileSync(value.cache, 'utf8')).transfer).toEqual(transfer)
})

it('rejects another image for the exact candidate pinned by a pending deployment before Docker admission', () => {
  const value = fixture(), record = readRuntime(value.target)
  writeRuntime(value.target, { ...record, operation: { id: value.operationId, kind: 'deploy', buildId: value.sourceSha,
    image: `sha256:${'d'.repeat(64)}`, sourceBuildId: null, sourceImage: null, stage: 'migration', backupStem: null, generation: record.generation } })
  const result = value.invoke('prepare-image-import')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('pending image ID')
  expect(value.calls()).toBe('')
})

it.each(['expired', 'producer', 'expected-current', 'open', 'running-app', 'platform', 'frontend', 'truncated'])('fails closed on %s without changing runtime or importing an unverified image', kind => {
  const value = fixture(); const path = value.stage()
  const record = readRuntime(value.target)
  if (kind === 'open') writeRuntime(value.target, { ...record, mode: 'open' })
  if (kind === 'running-app') value.state.app = true
  if (kind === 'platform') value.state.platform = 'aarch64'
  if (kind === 'frontend') value.state.badFrontend = true
  if (kind === 'truncated') writeFileSync(path, 'truncated', { mode: 0o600 })
  value.save()
  const before = existsSync(join(value.target.directory, 'control/gate.json')) ? readFileSync(join(value.target.directory, 'control/gate.json'), 'utf8') : undefined
  const result = value.invoke('import-image', {
    ...(kind === 'expired' ? { expiresAt: Date.now() - 1 } : {}),
    ...(kind === 'producer' ? { transfer: { ...value.transfer, receipt: { ...value.transfer.receipt, producerSha: 'f'.repeat(40) } } } : {}),
    ...(kind === 'expected-current' ? { expectedCurrent: 'e'.repeat(40) } : {}),
  })
  expect(result.status, result.stdout).not.toBe(0)
  expect(existsSync(value.cache)).toBe(false)
  expect(existsSync(join(value.target.directory, 'control/gate.json')) ? readFileSync(join(value.target.directory, 'control/gate.json'), 'utf8') : undefined).toBe(before)
  expect(value.calls()).not.toMatch(/buildx|"run"|"start"|"stop"|"tag"/)
})
