import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { FULL_TASK_IDS } from '../ci/verification-tasks'

const roots: string[] = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

function fixture(architecture = 'amd64', labelSource = 'c'.repeat(40)) {
  const root = mkdtempSync(join(tmpdir(), 'oa-formal-image-')); roots.push(root)
  const directory = join(root, 'formal'), operationId = randomUUID(), stage = join(directory, 'backups', `.backend-image-${operationId}`)
  mkdirSync(stage, { recursive: true, mode: 0o700 })
  const payload = join(root, 'payload'), bin = join(root, 'bin'), cgroup = join(root, 'cgroup'), dockerRoot = join(root, 'docker')
  for (const path of [payload, bin, cgroup, dockerRoot]) mkdirSync(path, { mode: 0o700 })
  const sourceSha = 'c'.repeat(40), producerSha = 'a'.repeat(40)
  const config = JSON.stringify({ os: 'linux', architecture, config: { Labels: {
    'org.opencontainers.image.revision': labelSource, 'io.open-agricola.release-channel': 'stable',
  } }, rootfs: { type: 'layers', diff_ids: [] } })
  const imageId = `sha256:${sha256(config)}`
  writeFileSync(join(payload, 'config.json'), config)
  writeFileSync(join(payload, 'manifest.json'), JSON.stringify([{ Config: 'config.json', RepoTags: null, Layers: [] }]))
  const archivePath = join(stage, 'image.tar')
  execFileSync('tar', ['-cf', archivePath, '-C', payload, 'config.json', 'manifest.json']); chmodSync(archivePath, 0o600)
  const request = { format: 1, operationId, directory, stage, sourceSha, producerSha, expiresAt: Date.now() + 300_000,
    budget: { format: 1, import: { maxArchiveMiB: 1, memoryHeadroomMiB: 512, intake: { memoryMiB: 384, cpus: 1, pids: 64 } }, diskMiB: 256, reserveMemoryMiB: 512 },
    transfer: { format: 1, receipt: { format: 1, repository: 'titanxxh/open-agricola', repositoryId: 123,
      purpose: 'formal-candidate', channel: 'stable', sourceSha, producerSha, platform: 'linux/amd64',
      registryRepository: 'ghcr.io/titanxxh/open-agricola-images', manifestDigest: `sha256:${'b'.repeat(64)}`, imageId,
      build: { runId: 80, runAttempt: 1 }, verification: { kind: 'stable', configuration: 'd'.repeat(64), producerConfiguration: 'e'.repeat(64),
        tasks: FULL_TASK_IDS.map((id, index) => ({ id, runId: 61, jobId: index + 2, runAttempt: 1 })) } },
      archive: { sha256: sha256(readFileSync(archivePath)), bytes: readFileSync(archivePath).length } } }
  const requestPath = join(stage, 'request.json'), log = join(root, 'docker.jsonl'), statePath = join(root, 'state.json')
  const state = { mutateUpload: false, badFrontend: false, lowMemory: false, wrongLimit: false }
  const save = () => { writeFileSync(requestPath, JSON.stringify(request), { mode: 0o600 }); writeFileSync(statePath, JSON.stringify(state)) }; save()
  const preload = join(root, 'native-intake.mjs')
  writeFileSync(preload, `import fs from 'node:fs';import os from 'node:os';import{syncBuiltinESMExports}from'node:module';
const copy=fs.copyFileSync;fs.copyFileSync=(...args)=>{fs.writeFileSync(${JSON.stringify(join(root, 'copied.json'))},JSON.stringify({from:args[0],to:args[1]}));return copy(...args)};
const read=fs.readFileSync;fs.readFileSync=(path,...args)=>read(path==='/proc/self/cgroup'?${JSON.stringify(join(cgroup, 'membership'))}:typeof path==='string'&&path.startsWith('/sys/fs/cgroup/fixture/')?${JSON.stringify(cgroup)}+'/'+path.split('/').at(-1):path,...args);
if(JSON.parse(read(${JSON.stringify(statePath)},'utf8')).lowMemory)os.freemem=()=>0;syncBuiltinESMExports();`)
  writeFileSync(join(bin, 'systemd-run'), `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process'),a=process.argv.slice(2),s=JSON.parse(fs.readFileSync(${JSON.stringify(statePath)},'utf8'));
const get=p=>a.find(x=>x.startsWith(p)).slice(p.length),unit=get('--unit=');
const files={membership:'0::/fixture/'+unit+'\\n','memory.max':s.wrongLimit?'max':get('--property=MemoryMax='),'memory.swap.max':'0','cpu.max':String(Number(get('--property=CPUQuota=').slice(0,-1))*1000)+' 100000','pids.max':get('--property=TasksMax=')};
for(const[k,v]of Object.entries(files))fs.writeFileSync(${JSON.stringify(cgroup)}+'/'+k,v);
fs.writeFileSync(${JSON.stringify(join(root, 'intake.json'))},JSON.stringify(a));
const command=a.slice(a.indexOf('--')+1),node=command.indexOf(${JSON.stringify(process.execPath)});command.splice(node+1,0,'--import',${JSON.stringify(preload)});
const env={...process.env};for(const item of a.filter(x=>x.startsWith('--setenv='))){const pair=item.slice(9),i=pair.indexOf('=');env[pair.slice(0,i)]=pair.slice(i+1);}
const result=cp.spawnSync(command[0],command.slice(1),{env,stdio:'inherit'});process.exit(result.status??1);
`, { mode: 0o700 })
  const metadata = { format: 1, gameBuildId: sourceSha, basePath: '/open-agricola/', releaseChannel: 'stable', deploymentTarget: 'stable-hosted' }
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto'),a=process.argv.slice(2),s=JSON.parse(fs.readFileSync(${JSON.stringify(statePath)},'utf8'));
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(a)+'\\n');const out=x=>console.log(JSON.stringify(x));
if(a[0]==='context')out([{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}}]);
else if(a[0]==='info')out(a.at(-1).includes('DriverStatus')?[]:{OSType:'linux',Architecture:'amd64',DockerRootDir:${JSON.stringify(dockerRoot)}});
else if(a[0]==='load'){const path=a[a.indexOf('--input')+1];if(s.mutateUpload)fs.writeFileSync(${JSON.stringify(archivePath)},'replaced SCP input');fs.writeFileSync(${JSON.stringify(join(root, 'loaded.json'))},JSON.stringify({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}));}
else if(a[0]==='image')out([{Id:${JSON.stringify(imageId)},Os:'linux',Architecture:'amd64',Config:JSON.parse(${JSON.stringify(config)}).config}]);
else if(a[0]==='create')console.log('f'.repeat(64));
else if(a[0]==='cp')fs.writeFileSync(a.at(-1),JSON.stringify({...${JSON.stringify(metadata)},...(s.badFrontend?{gameBuildId:'wrong'}:{})}));
else if(a[0]!=='rm')process.exit(3);
`, { mode: 0o700 })
  const invoke = (mode = 'receive') => spawnSync(process.execPath, ['scripts/release/backend-image-receiver.ts', mode, requestPath], {
    cwd: resolve(import.meta.dirname, '../..'), env: { ...process.env, CI: '', GITHUB_ACTIONS: '', PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8', timeout: 30000,
  })
  return { root, directory, stage, request, state, save, invoke, imageId, archivePath,
    calls: (): string[][] => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [] }
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
