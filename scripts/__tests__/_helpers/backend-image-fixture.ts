import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { dockerFixtureEnvironment } from './docker-fixture-environment'
import { FULL_TASK_IDS } from '../../ci/verification-tasks'

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

export function createBackendImageFixture(architecture = 'amd64', labelSource = 'c'.repeat(40)) {
  const root = mkdtempSync(join(tmpdir(), 'oa-formal-image-'))
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
  const realFlock = execFileSync('which', ['flock'], { encoding: 'utf8' }).trim()
  writeFileSync(join(bin, 'flock'), `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process'),a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(join(root, 'flock.jsonl'))},JSON.stringify(a)+'\\n');const result=cp.spawnSync(${JSON.stringify(realFlock)},a,{stdio:'inherit'});process.exit(result.status??1);
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
  const args = (mode: string) => ['scripts/release/backend-image-receiver.ts', mode, requestPath,
    ...(['check', 'preflight', 'discard-transfer'].includes(mode) ? [directory, sourceSha, producerSha] : [])]
  const env = (extra: NodeJS.ProcessEnv = {}) => dockerFixtureEnvironment({ CI: '', GITHUB_ACTIONS: '', PATH: `${bin}:${process.env.PATH}`, ...extra })
  const cwd = resolve(import.meta.dirname, '../../..')
  const invoke = (mode = 'receive', extra: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, args(mode), { cwd, env: env(extra), encoding: 'utf8', timeout: 30000 })
  const launch = (mode: string, extra: NodeJS.ProcessEnv = {}) => {
    const child = spawn(process.execPath, args(mode), { cwd, env: env(extra), stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    const result = new Promise<{ status: number | null; stdout: string; stderr: string }>((done, reject) => {
      child.once('error', reject); child.once('close', status => done({ status, stdout, stderr }))
    })
    return { child, result }
  }
  return { root, bin, directory, stage, requestPath, statePath, request, state, save, invoke, launch, realFlock, imageId, archivePath,
    calls: (): string[][] => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [] }
}
