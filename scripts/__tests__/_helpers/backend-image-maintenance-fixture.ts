// @covers scripts/release/backend-image-maintenance.ts
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { dockerFixtureEnvironment } from './docker-fixture-environment'
import { createBackendImageFixture } from './backend-image-fixture'
import { backendImageRequestBinding, readBackendImageEvidence } from '../../release/backend-image-receiver'

// Shared by the backend-image-maintenance-*.test.ts files: one fixture, split so Vitest runs its cases in parallel.
const repository = resolve(import.meta.dirname, '../../..'), roots: string[] = []
/** Each test file registers this in afterEach; it removes every fixture root created since the last call. */
export const removeBackendImageMaintenanceRoots = () => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) }

type BackendImageFixture = ReturnType<typeof createBackendImageFixture>
const caddyDigest = `caddy@sha256:${'d'.repeat(64)}`
const oldId = '1'.repeat(64), caddyId = '2'.repeat(64), newId = '3'.repeat(64), sourceBuild = '7'.repeat(40), sourceImage = `sha256:${'8'.repeat(64)}`, caddyImage = `sha256:${'9'.repeat(64)}`
const data = { DATABASE_URL: 'postgres://private-fixture/formal', S3_ENDPOINT: 'http://objects:9000', S3_BUCKET: 'formal', S3_PREFIX: '', S3_REGION: 'fixture', S3_FORCE_PATH_STYLE: 'true', S3_ACCESS_KEY_ID: 'private-fixture-key', S3_SECRET_ACCESS_KEY: 'private-fixture-secret' }
const originalEnvFor = (bootstrap: boolean) => `# owner configuration\nACCOUNT_REGISTRATION_POLICY=invite_only\nPUBLIC_API_BASE=https://api.example.test\nPRIVATE_SENTINEL='keep exactly this value'\n${bootstrap ? '' : `BACKEND_IMAGE=${sourceImage}\nCADDY_IMAGE=${caddyImage}\n`}`
const maintenancePaths = (value: BackendImageFixture) => ({ policy: join(value.stage, 'policy'), statePath: join(value.root, 'maintenance.json'), callsPath: join(value.root, 'maintenance-calls.jsonl') })

/**
 * Every case of one installation kind starts from the same received, policy-installed files, so they are built once per
 * file and worker, kept as a snapshot, and restored at the same absolute path for each case because the stubs embed it.
 * Only the failure-specific maintenance state is written per case. The request expires five minutes after it is
 * created, so a template older than two minutes is rebuilt.
 */
type Template = { base: string; work: string; snapshot: string; request: BackendImageFixture['request']; createdAt: number }
const templates = new Map<boolean, Template>(), TEMPLATE_LIFETIME_MS = 120_000
process.once('exit', () => { for (const template of templates.values()) rmSync(template.base, { recursive: true, force: true }) })

function templateFor(bootstrap: boolean): Template {
  const current = templates.get(bootstrap)
  if (current && Date.now() - current.createdAt < TEMPLATE_LIFETIME_MS) return current
  if (current) rmSync(current.base, { recursive: true, force: true })
  const base = mkdtempSync(join(tmpdir(), 'oa-formal-image-template-')), work = join(base, 'fixture'), snapshot = join(base, 'snapshot')
  mkdirSync(work, { mode: 0o700 })
  const createdAt = Date.now(), value = createBackendImageFixture('amd64', 'c'.repeat(40), { root: work })
  installMaintenanceFixture(value, bootstrap)
  // `cp -a` keeps the owner-private modes the receiver and maintenance checks require.
  execFileSync('cp', ['-a', work, snapshot])
  rmSync(work, { recursive: true, force: true })
  const template = { base, work, snapshot, request: value.request, createdAt }
  templates.set(bootstrap, template)
  return template
}

export function backendImageMaintenanceFixture(failure = '', bootstrap = false) {
  const template = templateFor(bootstrap)
  rmSync(template.work, { recursive: true, force: true })
  execFileSync('cp', ['-a', template.snapshot, template.work]); roots.push(template.work)
  const value = createBackendImageFixture('amd64', 'c'.repeat(40), { root: template.work, restored: { operationId: template.request.operationId, request: structuredClone(template.request) } })
  const { policy, statePath, callsPath } = maintenancePaths(value)
  const state = { failure, bootstrap: bootstrap || failure === 'missing-app', caddyStarted: !bootstrap, projectVolume: false, proofRemoved: false, livePresent: false, liveRemoved: false, head: sourceBuild, running: failure !== 'backup-stopped', started: false, sourceBuild, sourceImage, caddyImage }
  writeFileSync(statePath, JSON.stringify(state))
  const originalEnv = originalEnvFor(bootstrap)
  return bindMaintenanceFixture(value, policy, statePath, callsPath, originalEnv)
}

/** Receives the image and installs the trusted policy, owner configuration and maintenance stubs; all failure-independent. */
function installMaintenanceFixture(value: BackendImageFixture, bootstrap: boolean) {
  if (bootstrap) writeFileSync(value.requestPath, JSON.stringify({ ...value.request, installation: { kind: 'bootstrap', caddyImage: caddyDigest } }))
  const imported = value.invoke()
  if (imported.status !== 0) throw new Error(imported.stderr)
  const { policy, statePath, callsPath } = maintenancePaths(value)
  mkdirSync(join(policy, 'scripts'), { recursive: true })
  for (const name of ['ci', 'release']) cpSync(join(repository, 'scripts', name), join(policy, 'scripts', name), { recursive: true })
  for (const name of ['image-intake.ts', 'backup-storage.sh', 'backup-process.sh', 'backup-files.mjs']) cpSync(join(repository, 'scripts', name), join(policy, 'scripts', name))
  writeFileSync(join(policy, 'package.json'), '{"type":"module"}')
  mkdirSync(join(value.directory, 'data'))
  cpSync(join(repository, 'docker-compose.prod.yml'), join(value.directory, 'docker-compose.prod.yml'))
  writeFileSync(join(value.directory, 'data/dependencies.compose.env'), 'DATABASE_URL=private-fixture\n')
  writeFileSync(join(value.directory, 'data/postgres-cutover.validated'), '')
  writeFileSync(join(value.directory, '.env'), originalEnvFor(bootstrap))
  const tree: string[] = []
  const collect = (directory: string, relative = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name), name = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) collect(file, name)
      else { const bytes = readFileSync(file); tree.push(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') + '\t' + name) }
    }
  }
  collect(policy)
  const policyTree = join(value.root, 'policy-tree.txt'); writeFileSync(policyTree, tree.join('\n') + '\n')
  const prefix = `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');const a=process.argv.slice(2),file=${JSON.stringify(statePath)},s=JSON.parse(fs.readFileSync(file,'utf8'));
const log=(kind,args=a)=>fs.appendFileSync(${JSON.stringify(callsPath)},JSON.stringify({kind,args})+'\\n');const save=()=>fs.writeFileSync(file,JSON.stringify(s));const out=x=>console.log(JSON.stringify(x));
`
  writeFileSync(join(value.bin, 'git'), prefix + `log('git');
if(a[0]==='ls-tree'){process.stdout.write(fs.readFileSync(${JSON.stringify(policyTree)},'utf8'));process.exit(0)}
if(a[0]==='status')process.exit(0);if(a[0]==='fetch')process.exit(0);
if(a[0]==='rev-parse')console.log(a[1].startsWith('FETCH_HEAD')?(s.failure==='fetch'?'f'.repeat(40):${JSON.stringify(value.request.sourceSha)}):s.head);
else if(a[0]==='checkout'){s.head=s.failure==='checkout'?'f'.repeat(40):a[2];save();}else throw Error('Unexpected git');
`, { mode: 0o700 })
  renameSync(join(value.bin, 'docker'), join(value.bin, 'docker-intake'))
  writeFileSync(join(value.bin, 'docker'), prefix + `
if(a[0]==='image'&&a.at(-1).startsWith('caddy@sha256:')){log('docker');out([{Id:s.caddyImage,Os:'linux',Architecture:s.failure==='caddy-architecture'?'arm64':'amd64',RepoDigests:s.failure==='caddy-digest'?[]:[(s.failure==='caddy-canonical'?'docker.io/library/caddy':s.failure==='caddy-foreign'?'evil.example/library/caddy':'caddy')+'@sha256:'+('d'.repeat(64))]}]);process.exit(0)}
if(a[0]==='create'&&a.includes('check-empty')){log('docker');const community=${JSON.stringify(join(value.directory, 'data/community'))},info=fs.existsSync(community)?fs.lstatSync(community):null;fs.appendFileSync(${JSON.stringify(join(value.root, 'community-before-run.jsonl'))},JSON.stringify({exists:!!info,directory:info?.isDirectory(),uid:info?.uid,mode:info?info.mode&0o777:null})+'\\n');fs.writeFileSync(${JSON.stringify(join(value.root, 'empty-proof-create.json'))},JSON.stringify(a));console.log('4'.repeat(64));process.exit(0)}
if(a[0]==='rm'&&a.includes('4'.repeat(64))){log('docker');s.proofRemoved=true;save();process.exit(0)}
if(a[0]==='rm'&&a.includes('5'.repeat(64))){log('docker');if(s.failure==='live-remove')process.exit(46);s.livePresent=false;s.liveRemoved=true;save();process.exit(0)}
if(['context','info','image','create','cp','rm'].includes(a[0])){const r=cp.spawnSync(${JSON.stringify(join(value.bin, 'docker-intake'))},a,{stdio:'inherit'});process.exit(r.status??1)}
log('docker');const oldId=${JSON.stringify(oldId)},caddyId=${JSON.stringify(caddyId)},newId=${JSON.stringify(newId)},data=${JSON.stringify(data)};
if(a[0]==='inspect'){
 const id=a[1],isNew=id===newId||id==='5'.repeat(64);if(id===oldId&&s.sourceRemoved)process.exit(48);out([{Id:id,Image:id===caddyId?(s.failure==='caddy-up-identity'&&s.caddyStarted?'sha256:'+'e'.repeat(64):s.caddyImage):isNew?${JSON.stringify(value.imageId)}:s.sourceImage,
 State:{Running:id===caddyId?s.caddyStarted:isNew?s.started:s.running,OOMKilled:s.failure==='oom',ExitCode:s.failure==='drain'?137:0,Health:{Status:s.failure==='unhealthy'?'unhealthy':'healthy'}},
 Config:{Env:Object.entries({...data,GAME_BUILD_ID:isNew?(s.failure==='up-identity'?'wrong':${JSON.stringify(value.request.sourceSha)}):s.sourceBuild,RELEASE_CHANNEL:'stable'}).map(([k,v])=>k+'='+v),Labels:{'com.docker.compose.project':(s.foreignCaddy&&id===caddyId&&s.caddyStarted)||(s.foreignApp&&isNew)?'foreign':'formal','com.docker.compose.service':id===caddyId?'caddy':'app',...(isNew?{'org.open-agricola.backend-operation':s.foreignOperation?'another-operation':${JSON.stringify(value.request.operationId)}}:{}),...(id==='5'.repeat(64)?{'org.open-agricola.backend-operation':s.failure==='live-foreign'?'foreign':${JSON.stringify(value.request.operationId)},'org.open-agricola.backend-phase':'live-validation'}:{})}}}]);
}else if(a[0]==='run'&&a.includes('--entrypoint')){
 const probed=a[a.indexOf('--entrypoint')+2],source=probed===s.sourceImage;
 if(s.failure==='owner-probe-error')process.exit(51);
 out(source&&s.failure==='owner-source-old'?[]:!source&&s.failure==='owner-target-old'?['directory-database']:['directory-database','counted-live-check']);
}else if(a[0]==='stop'){if(s.failure==='up-app-stop'&&a.at(-1)===newId)process.exit(47);if(a.at(-1)===newId)s.started=false;else if(a.at(-1)===caddyId)s.caddyStarted=false;else s.running=false;save();}
else if(a[0]==='start'&&a.includes('4'.repeat(64))){if(['nonempty','unsupported-empty'].includes(s.failure))process.exit(45);out({formatVersion:1,targetBuildId:${JSON.stringify(value.request.sourceSha)},database:'empty',objects:'empty'});}
else if(a[0]==='start'){s.running=true;save();}
else if(a[0]==='ps'){if(a.includes('--filter')&&s.livePresent)console.log('5'.repeat(64));}
else if(a[0]==='volume'){if(s.failure==='retained-volume'||s.projectVolume)console.log('formal_app-data');}
else if(a[0]==='compose'){
 log('compose-owner',[process.env.APP_UID??'<unset>',process.env.APP_GID??'<unset>']);
 const file=a[a.indexOf('-f')+1];
 if(a.includes('config'))out({name:'formal',services:{app:{image:'mutable:old',build:{context:'.'},environment:{...data,...(s.failure==='data-target'?{S3_BUCKET:'another'}:{})},volumes:[],networks:['default']},caddy:{image:'caddy:mutable',depends_on:['app']}},networks:{default:{name:'formal_default'},dependencies:{external:true,name:'shared_dependencies'}}});
 else if(a.includes('ps'))console.log(file.endsWith('maintenance.compose.json')?(a.at(-1)==='caddy'?(s.caddyStarted||!s.bootstrap?caddyId:''):(s.started||s.sourceRemoved?newId:s.bootstrap?'':oldId)):s.bootstrap?(s.failure==='existing-caddy'&&a.at(-1)==='caddy'?caddyId:''):a.at(-1)==='caddy'?caddyId:oldId);
 else if(a.includes('up')){s.started=true;s.caddyStarted=true;if(s.recreateSource)s.sourceRemoved=true;save();if(['up','up-app-stop'].includes(s.failure))process.exit(42);}
 else if(a.includes('run')){
  if(s.bootstrap){s.projectVolume=true;save();}
  const community=${JSON.stringify(join(value.directory, 'data/community'))},info=fs.existsSync(community)?fs.lstatSync(community):null;fs.appendFileSync(${JSON.stringify(join(value.root, 'community-before-run.jsonl'))},JSON.stringify({exists:!!info,directory:info?.isDirectory(),uid:info?.uid,mode:info?info.mode&0o777:null})+'\\n');
  const config=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(${JSON.stringify(join(value.root, 'observed-compose.json'))},JSON.stringify(config));
  if(a.includes('export')){
   if(['backup','backup-stopped','source-changed'].includes(s.failure)){if(s.failure==='source-changed'){s.sourceImage='sha256:'+'a'.repeat(64);save();}process.exit(43);}
   const destination=a.find(x=>x.startsWith('/backup/.pending-')&&x.endsWith('/capture')),directory=path.join(${JSON.stringify(value.directory)},'backups',destination.slice('/backup/'.length));fs.mkdirSync(directory,{recursive:true});
   if(a.includes('--directory-database')){fs.mkdirSync(path.join(directory,'database'));fs.writeFileSync(path.join(directory,'database','toc.dat'),'fixture toc');fs.writeFileSync(path.join(directory,'archive.json'),JSON.stringify({version:2,sourceBuildId:s.sourceBuild,createdAt:new Date().toISOString(),schema:'public',database:{format:'directory',sha256:'d'.repeat(64),size:11,files:[{name:'toc.dat',sha256:'d'.repeat(64),size:11}]},objects:[]}));}
   else{fs.writeFileSync(path.join(directory,'database.dump'),'real fixture database bytes');fs.writeFileSync(path.join(directory,'archive.json'),JSON.stringify({version:1,sourceBuildId:s.sourceBuild,createdAt:new Date().toISOString(),schema:'public',objects:[]}));}
  }else if(a.includes('ledger-export'))fs.writeFileSync(path.join(${JSON.stringify(value.directory)},'backups/replay-removals.latest.json'),'{"version":1,"batches":[]}');
  else if(a.includes('validate'))out({formatVersion:2,validatedAt:new Date().toISOString(),sourceBuildId:s.sourceBuild,targetBuildId:s.failure==='report-target'?s.sourceBuild:${JSON.stringify(value.request.sourceSha)},roomCount:0,replayCount:0,replayHeadCount:0,replayStepCount:0,replaySegmentCount:0,retainedObjectCount:0,replaySchemaVersions:[]});
  else if(a.includes('check-empty')){if(['nonempty','unsupported-empty'].includes(s.failure))process.exit(45);out({formatVersion:1,targetBuildId:${JSON.stringify(value.request.sourceSha)},database:'empty',objects:'empty'});}
  else if(a.includes('--input-type=module')){if(s.proofUnavailable)process.exit(50);out({barrier:{status:s.proofStatus??'validated',updated_at:s.checkpointAt??Date.now(),report_json:JSON.stringify({roomCount:0,replayCount:0,replayHeadCount:0,replayStepCount:s.badReport?1:0,replaySegmentCount:0,retainedObjectCount:0,replaySchemaVersions:[]})},bad:s.badImports??0,active:s.active??(s.started?1:0),foreign:s.foreign??0});}
  else if(a.includes('check-live')){s.livePresent=true;s.checkpointAt=Date.now();if(a.includes('--counted'))s.counted=true;save();if(['live','live-foreign','live-remove'].includes(s.failure))process.exit(44);if(s.failure==='live-delay')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2000);s.livePresent=false;save();
   if(a.includes('--counted'))out({roomCount:0,replayCount:0,replayHeadCount:0,replayStepCount:s.failure==='owner-live-counts'?1:0,replaySegmentCount:0,retainedObjectCount:0,replaySchemaVersions:[]});}
  else if(!a.includes('cleanup-scratch'))throw Error('Unexpected compose run: '+a.join(' '));
 }else throw Error('Unexpected compose: '+a.join(' '));
}else throw Error('Unexpected docker: '+a.join(' '));
`, { mode: 0o700 })
}

function bindMaintenanceFixture(value: BackendImageFixture, policy: string, statePath: string, callsPath: string, originalEnv: string) {
  const invoke = (expectedSha = value.request.sourceSha, extraEnv: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath,
    [join(policy, 'scripts/release/backend-image-maintenance.ts'), 'maintain', value.requestPath, value.directory, expectedSha, value.request.producerSha],
    { env: dockerFixtureEnvironment({ CI: '', GITHUB_ACTIONS: '', PATH: `${value.bin}:${process.env.PATH}`, ...extraEnv }), encoding: 'utf8', timeout: 30_000 })
  /** Runs maintenance concurrently with a simulated owner machine that answers the published owner request. */
  const invokeWithOwner = (answer: ((request: Record<string, unknown>) => Record<string, unknown>) | null, extraEnv: NodeJS.ProcessEnv = {}) => new Promise<{ status: number | null; stdout: string; stderr: string; request?: Record<string, unknown> }>(done => {
    const child = spawn(process.execPath, [join(policy, 'scripts/release/backend-image-maintenance.ts'), 'maintain', value.requestPath, value.directory, value.request.sourceSha, value.request.producerSha],
      { env: dockerFixtureEnvironment({ CI: '', GITHUB_ACTIONS: '', PATH: `${value.bin}:${process.env.PATH}`, BACKEND_VALIDATION: 'owner', ...extraEnv }) })
    let stdout = '', stderr = '', request: Record<string, unknown> | undefined
    child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.on('data', chunk => { stderr += chunk })
    const watcher = setInterval(() => {
      const path = join(value.stage, 'owner-request.json')
      if (request || !existsSync(path)) return
      request = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
      if (!answer) return
      writeFileSync(join(value.stage, 'owner-report.json.partial'), JSON.stringify(answer(request)), { mode: 0o600 })
      renameSync(join(value.stage, 'owner-report.json.partial'), join(value.stage, 'owner-report.json'))
    }, 50)
    child.once('close', status => { clearInterval(watcher); done({ status, stdout, stderr, request }) })
  })
  const calls = (): { kind: string; args: string[] }[] => existsSync(callsPath) ? readFileSync(callsPath, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
  const operation = (mode: string, authorization?: string, extraEnv: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath,
    [join(policy, 'scripts/release/backend-image-maintenance.ts'), mode, value.requestPath, value.directory, value.request.sourceSha, value.request.producerSha, ...(authorization ? [authorization] : [])],
    { env: dockerFixtureEnvironment({ CI: '', GITHUB_ACTIONS: '', PATH: `${value.bin}:${process.env.PATH}`, ...extraEnv }), encoding: 'utf8', timeout: 30000 })
  const authorize = (extra = {}) => {
    const nonce = randomUUID(), path = join(value.stage, `resume-${nonce}.json`), now = Date.now()
    writeFileSync(path, JSON.stringify({ format: 1, nonce, operationId: value.request.operationId, bindingSha256: backendImageRequestBinding(readBackendImageEvidence(value.requestPath, value.request).request), authorizedAt: now, expiresAt: now + 600000, workMs: 600000, ...extra }), { mode: 0o600 })
    return path
  }
  const mutate = (changes: Record<string, unknown>) => writeFileSync(statePath, JSON.stringify({ ...JSON.parse(readFileSync(statePath, 'utf8')), ...changes }))
  return { ...value, operation, authorize, mutate, sourceBuild, sourceImage, caddyImage, caddyDigest, oldId, originalEnv, invoke, invokeWithOwner, calls,
    current: () => JSON.parse(readFileSync(statePath, 'utf8')),
    compose: () => JSON.parse(readFileSync(join(value.root, 'observed-compose.json'), 'utf8')) }
}

export function nativeCompose(directory: string, explicitEnvFile = false) {
  const { BACKEND_IMAGE: _image, COMPOSE_ENV_FILES: _files, COMPOSE_DISABLE_ENV_FILE: _disabled, CADDY_IMAGE: _caddy, ...env } = dockerFixtureEnvironment()
  return spawnSync('docker', ['compose', ...(explicitEnvFile ? ['--env-file', '.env'] : []), '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'],
    { cwd: directory, env, encoding: 'utf8', timeout: 30_000 })
}
