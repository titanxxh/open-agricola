import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { dockerFixtureEnvironment } from './_helpers/docker-fixture-environment'
import { createBackendImageFixture } from './_helpers/backend-image-fixture'

const repository = resolve(import.meta.dirname, '../..'), roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(failure = '', bootstrap = false) {
  const value = createBackendImageFixture(); roots.push(value.root)
  const caddyDigest = `caddy@sha256:${'d'.repeat(64)}`
  if (bootstrap) writeFileSync(value.requestPath, JSON.stringify({ ...value.request, installation: { kind: 'bootstrap', caddyImage: caddyDigest } }))
  const imported = value.invoke()
  if (imported.status !== 0) throw new Error(imported.stderr)
  const policy = join(value.stage, 'policy')
  mkdirSync(join(policy, 'scripts'), { recursive: true })
  for (const name of ['ci', 'release']) cpSync(join(repository, 'scripts', name), join(policy, 'scripts', name), { recursive: true })
  for (const name of ['image-intake.ts', 'backup-storage.sh', 'backup-process.sh', 'backup-files.mjs']) cpSync(join(repository, 'scripts', name), join(policy, 'scripts', name))
  writeFileSync(join(policy, 'package.json'), '{"type":"module"}')
  mkdirSync(join(value.directory, 'data'))
  cpSync(join(repository, 'docker-compose.prod.yml'), join(value.directory, 'docker-compose.prod.yml'))
  writeFileSync(join(value.directory, 'data/dependencies.compose.env'), 'DATABASE_URL=private-fixture\n')
  writeFileSync(join(value.directory, 'data/postgres-cutover.validated'), '')
  const oldId = '1'.repeat(64), caddyId = '2'.repeat(64), newId = '3'.repeat(64), sourceBuild = '7'.repeat(40), sourceImage = `sha256:${'8'.repeat(64)}`, caddyImage = `sha256:${'9'.repeat(64)}`
  const originalEnv = `# owner configuration\nACCOUNT_REGISTRATION_POLICY=invite_only\nPUBLIC_API_BASE=https://api.example.test\nPRIVATE_SENTINEL='keep exactly this value'\n${bootstrap ? '' : `BACKEND_IMAGE=${sourceImage}\nCADDY_IMAGE=${caddyImage}\n`}`
  writeFileSync(join(value.directory, '.env'), originalEnv)
  const data = { DATABASE_URL: 'postgres://private-fixture/formal', S3_ENDPOINT: 'http://objects:9000', S3_BUCKET: 'formal', S3_PREFIX: '', S3_REGION: 'fixture', S3_FORCE_PATH_STYLE: 'true', S3_ACCESS_KEY_ID: 'private-fixture-key', S3_SECRET_ACCESS_KEY: 'private-fixture-secret' }
  const state = { failure, bootstrap: bootstrap || failure === 'missing-app', caddyStarted: !bootstrap, projectVolume: false, proofRemoved: false, head: sourceBuild, running: failure !== 'backup-stopped', started: false, sourceBuild, sourceImage, caddyImage }
  const statePath = join(value.root, 'maintenance.json'), callsPath = join(value.root, 'maintenance-calls.jsonl')
  writeFileSync(statePath, JSON.stringify(state))
  const prefix = `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');const a=process.argv.slice(2),file=${JSON.stringify(statePath)},s=JSON.parse(fs.readFileSync(file,'utf8'));
const log=(kind,args=a)=>fs.appendFileSync(${JSON.stringify(callsPath)},JSON.stringify({kind,args})+'\\n');const save=()=>fs.writeFileSync(file,JSON.stringify(s));const out=x=>console.log(JSON.stringify(x));
`
  writeFileSync(join(value.bin, 'git'), prefix + `log('git');
if(a[0]==='status')process.exit(0);if(a[0]==='fetch')process.exit(0);
if(a[0]==='rev-parse')console.log(a[1].startsWith('FETCH_HEAD')?(s.failure==='fetch'?'f'.repeat(40):${JSON.stringify(value.request.sourceSha)}):s.head);
else if(a[0]==='checkout'){s.head=s.failure==='checkout'?'f'.repeat(40):a[2];save();}else throw Error('Unexpected git');
`, { mode: 0o700 })
  renameSync(join(value.bin, 'docker'), join(value.bin, 'docker-intake'))
  writeFileSync(join(value.bin, 'docker'), prefix + `
if(a[0]==='image'&&a.at(-1).startsWith('caddy@sha256:')){log('docker');out([{Id:s.caddyImage,Os:'linux',Architecture:s.failure==='caddy-architecture'?'arm64':'amd64',RepoDigests:s.failure==='caddy-digest'?[]:[(s.failure==='caddy-canonical'?'docker.io/library/caddy':s.failure==='caddy-foreign'?'evil.example/library/caddy':'caddy')+'@sha256:'+('d'.repeat(64))]}]);process.exit(0)}
if(a[0]==='create'&&a.includes('check-empty')){log('docker');const community=${JSON.stringify(join(value.directory, 'data/community'))},info=fs.existsSync(community)?fs.lstatSync(community):null;fs.appendFileSync(${JSON.stringify(join(value.root, 'community-before-run.jsonl'))},JSON.stringify({exists:!!info,directory:info?.isDirectory(),uid:info?.uid,mode:info?info.mode&0o777:null})+'\\n');fs.writeFileSync(${JSON.stringify(join(value.root, 'empty-proof-create.json'))},JSON.stringify(a));console.log('4'.repeat(64));process.exit(0)}
if(a[0]==='rm'&&a.includes('4'.repeat(64))){log('docker');s.proofRemoved=true;save();process.exit(0)}
if(['context','info','image','create','cp','rm'].includes(a[0])){const r=cp.spawnSync(${JSON.stringify(join(value.bin, 'docker-intake'))},a,{stdio:'inherit'});process.exit(r.status??1)}
log('docker');const oldId=${JSON.stringify(oldId)},caddyId=${JSON.stringify(caddyId)},newId=${JSON.stringify(newId)},data=${JSON.stringify(data)};
if(a[0]==='inspect'){
 const id=a[1],isNew=id===newId;out([{Id:id,Image:id===caddyId?(s.failure==='caddy-up-identity'&&s.caddyStarted?'sha256:'+'e'.repeat(64):s.caddyImage):isNew?${JSON.stringify(value.imageId)}:s.sourceImage,
 State:{Running:id===caddyId?s.caddyStarted:isNew?s.started:s.running,OOMKilled:s.failure==='oom',ExitCode:s.failure==='drain'?137:0},
 Config:{Env:Object.entries({...data,GAME_BUILD_ID:isNew?(s.failure==='up-identity'?'wrong':${JSON.stringify(value.request.sourceSha)}):s.sourceBuild,RELEASE_CHANNEL:'stable'}).map(([k,v])=>k+'='+v),Labels:{'com.docker.compose.project':'formal','com.docker.compose.service':id===caddyId?'caddy':'app'}}}]);
}else if(a[0]==='stop'){if(s.failure==='up-app-stop'&&a.at(-1)===newId)process.exit(47);if(a.at(-1)===newId)s.started=false;else if(a.at(-1)===caddyId)s.caddyStarted=false;else s.running=false;save();}
else if(a[0]==='start'&&a.includes('4'.repeat(64))){if(['nonempty','unsupported-empty'].includes(s.failure))process.exit(45);out({formatVersion:1,targetBuildId:${JSON.stringify(value.request.sourceSha)},database:'empty',objects:'empty'});}
else if(a[0]==='start'){s.running=true;save();}
else if(a[0]==='ps'){}
else if(a[0]==='volume'){if(s.failure==='retained-volume'||s.projectVolume)console.log('formal_app-data');}
else if(a[0]==='compose'){
 log('compose-owner',[process.env.APP_UID??'<unset>',process.env.APP_GID??'<unset>']);
 const file=a[a.indexOf('-f')+1];
 if(a.includes('config'))out({name:'formal',services:{app:{image:'mutable:old',build:{context:'.'},environment:{...data,...(s.failure==='data-target'?{S3_BUCKET:'another'}:{})},volumes:[],networks:['default']},caddy:{image:'caddy:mutable',depends_on:['app']}},networks:{default:{name:'formal_default'},dependencies:{external:true,name:'shared_dependencies'}}});
 else if(a.includes('ps'))console.log(file.endsWith('maintenance.compose.json')?(a.at(-1)==='caddy'?caddyId:newId):s.bootstrap?(s.failure==='existing-caddy'&&a.at(-1)==='caddy'?caddyId:''):a.at(-1)==='caddy'?caddyId:oldId);
 else if(a.includes('up')){s.started=true;s.caddyStarted=true;save();if(['up','up-app-stop'].includes(s.failure))process.exit(42);}
 else if(a.includes('run')){
  if(s.bootstrap){s.projectVolume=true;save();}
  const community=${JSON.stringify(join(value.directory, 'data/community'))},info=fs.existsSync(community)?fs.lstatSync(community):null;fs.appendFileSync(${JSON.stringify(join(value.root, 'community-before-run.jsonl'))},JSON.stringify({exists:!!info,directory:info?.isDirectory(),uid:info?.uid,mode:info?info.mode&0o777:null})+'\\n');
  const config=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(${JSON.stringify(join(value.root, 'observed-compose.json'))},JSON.stringify(config));
  if(a.includes('export')){
   if(['backup','backup-stopped','source-changed'].includes(s.failure)){if(s.failure==='source-changed'){s.sourceImage='sha256:'+'a'.repeat(64);save();}process.exit(43);}
   const destination=a.find(x=>x.startsWith('/backup/.pending-')&&x.endsWith('/capture')),directory=path.join(${JSON.stringify(value.directory)},'backups',destination.slice('/backup/'.length));fs.mkdirSync(directory,{recursive:true});
   fs.writeFileSync(path.join(directory,'database.dump'),'real fixture database bytes');fs.writeFileSync(path.join(directory,'archive.json'),JSON.stringify({version:1,sourceBuildId:s.sourceBuild,createdAt:new Date().toISOString(),schema:'public',objects:[]}));
  }else if(a.includes('ledger-export'))fs.writeFileSync(path.join(${JSON.stringify(value.directory)},'backups/replay-removals.latest.json'),'{"version":1,"batches":[]}');
  else if(a.includes('validate'))out({formatVersion:2,validatedAt:new Date().toISOString(),sourceBuildId:s.sourceBuild,targetBuildId:s.failure==='report-target'?s.sourceBuild:${JSON.stringify(value.request.sourceSha)}});
  else if(a.includes('check-empty')){if(['nonempty','unsupported-empty'].includes(s.failure))process.exit(45);out({formatVersion:1,targetBuildId:${JSON.stringify(value.request.sourceSha)},database:'empty',objects:'empty'});}
  else if(a.includes('check-live')){if(s.failure==='live')process.exit(44);}
  else if(!a.includes('cleanup-scratch'))throw Error('Unexpected compose run: '+a.join(' '));
 }else throw Error('Unexpected compose: '+a.join(' '));
}else throw Error('Unexpected docker: '+a.join(' '));
`, { mode: 0o700 })
  const invoke = (expectedSha = value.request.sourceSha, extraEnv: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath,
    [join(policy, 'scripts/release/backend-image-maintenance.ts'), 'maintain', value.requestPath, value.directory, expectedSha, value.request.producerSha],
    { env: dockerFixtureEnvironment({ CI: '', GITHUB_ACTIONS: '', PATH: `${value.bin}:${process.env.PATH}`, ...extraEnv }), encoding: 'utf8', timeout: 30_000 })
  const calls = (): { kind: string; args: string[] }[] => existsSync(callsPath) ? readFileSync(callsPath, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
  return { ...value, sourceBuild, sourceImage, caddyImage, caddyDigest, oldId, originalEnv, invoke, calls,
    current: () => JSON.parse(readFileSync(statePath, 'utf8')),
    compose: () => JSON.parse(readFileSync(join(value.root, 'observed-compose.json'), 'utf8')) }
}

it('delivers an imported immutable image with source capture, target restore validation and no host build', () => {
  const value = fixture(), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(readFileSync(join(value.directory, 'data/deployed-build-id'), 'utf8')).toBe(value.request.sourceSha + '\n')
  const config = value.compose()
  expect(config.services.app.image).toBe(value.imageId)
  expect(config.services.app.environment.GAME_BUILD_ID).toBe(value.request.sourceSha)
  expect(config.services.capture.image).toBe(value.sourceImage)
  expect(config.services.capture.environment.GAME_BUILD_ID).toBe(value.sourceBuild)
  expect(Object.values(config.services).some(service => Object.hasOwn(Object(service), 'build'))).toBe(false)
  const calls = value.calls(), commands = calls.map(call => call.args.join(' '))
  expect(calls.some(call => call.args.some(argument => ['build', 'install', 'pull'].includes(argument)))).toBe(false)
  const index = (text: string) => commands.findIndex(command => command.includes(text))
  expect(index('stop --time 90')).toBeLessThan(index(' export '))
  expect(index(' export ')).toBeLessThan(index(' validate '))
  expect(index(' validate ')).toBeLessThan(index('check-live'))
  expect(index('check-live')).toBeLessThan(index(' up '))
  expect(calls.find(call => call.kind === 'docker' && call.args.includes('up'))?.args).toContain('--remove-orphans')
  expect(commands.find(command => command.includes(' export '))).toContain(' capture ')
  expect(commands.find(command => command.includes(' validate '))).toContain(' app ')
  const manifest = JSON.parse(readFileSync(join(value.directory, 'backups', `pre-${value.request.sourceSha.slice(0, 12)}-${value.request.operationId}.manifest.json`), 'utf8'))
  expect(manifest.sourceBuildId).toBe(value.sourceBuild)
  expect(manifest.targetBuildId).toBe(value.request.sourceSha)
  expect(manifest.archiveSizeBytes).toBeGreaterThan(0)
  expect(result.stdout).toContain(`Current build: ${value.request.sourceSha}`)
  expect(result.stdout + result.stderr).not.toContain('private-fixture-secret')
})

it('passes the deployment owner UID and GID to Compose despite inherited user overrides', () => {
  const value = fixture(), result = value.invoke(value.request.sourceSha, { APP_UID: '424242', APP_GID: '424243' })
  expect(result.status, result.stderr).toBe(0)
  const owners = value.calls().filter(call => call.kind === 'compose-owner')
  expect(owners.length).toBeGreaterThan(0)
  expect(new Set(owners.map(call => call.args.join(':'))))
    .toEqual(new Set([`${process.getuid?.()}:${process.getgid?.()}`]))
})

it.each(['fetch', 'checkout', 'data-target', 'oom'])('rejects %s mismatch before stopping the retained application', failure => {
  const value = fixture(failure), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args[0] === 'stop')).toBe(false)
  expect(existsSync(join(value.directory, 'data/deployed-build-id'))).toBe(false)
})

it('rejects another owner target before native Docker or source commands', () => {
  const value = fixture(), result = value.invoke('b'.repeat(40))
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('differs from the owner target')
  expect(value.calls()).toEqual([])
})

it('restarts only the exact source after a pre-migration backup failure', () => {
  const value = fixture('backup'), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().filter(call => call.args[0] === 'start')).toEqual([{ kind: 'docker', args: ['start', value.oldId] }])
  expect(value.current().running).toBe(true)
  expect(value.calls().some(call => call.args.includes('check-live'))).toBe(false)
})

it('requires the sealed backup to identify both retained source and fixed restore target before live migration', () => {
  const value = fixture('report-target'), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-live'))).toBe(false)
  expect(value.calls().filter(call => call.args[0] === 'start')).toEqual([{ kind: 'docker', args: ['start', value.oldId] }])
})

it('does not inherit unrelated backup service, environment or image overrides', () => {
  const value = fixture(), result = value.invoke(value.request.sourceSha, { BACKUP_ENVIRONMENT: 'prerelease-other', BACKUP_SOURCE_IMAGE: value.sourceImage, BACKUP_COMPOSE_PROJECT: 'another-project' })
  expect(result.status, result.stderr).toBe(0)
  expect(value.calls().some(call => call.args.includes('another-project') || call.args.filter(arg => arg === '-f').length > 1)).toBe(false)
})

it.each(['drain', 'live', 'up', 'up-identity', 'backup-stopped', 'source-changed'])('keeps maintenance after %s instead of restarting the old executable', failure => {
  const value = fixture(failure), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args[0] === 'start')).toBe(false)
  expect(value.current().started).toBe(false)
})

function nativeCompose(directory: string, explicitEnvFile = false) {
  const { BACKEND_IMAGE: _image, COMPOSE_ENV_FILES: _files, COMPOSE_DISABLE_ENV_FILE: _disabled, CADDY_IMAGE: _caddy, ...env } = dockerFixtureEnvironment()
  return spawnSync('docker', ['compose', ...(explicitEnvFile ? ['--env-file', '.env'] : []), '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'],
    { cwd: directory, env, encoding: 'utf8', timeout: 30_000 })
}

it('pins subsequent documented Compose run/up to the installed image with default and explicit .env selection', () => {
  const value = fixture(), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  for (const explicitEnvFile of [false, true]) {
    const config = nativeCompose(value.directory, explicitEnvFile)
    expect(config.status, config.stderr).toBe(0)
    expect(JSON.parse(config.stdout).services.app.image).toBe(value.imageId)
  }
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv.replace(value.sourceImage, value.imageId))
  expect(statSync(join(value.directory, '.env')).mode & 0o777).toBe(0o600)
  expect(JSON.parse(readFileSync(join(value.directory, 'data/deployed-image.json'), 'utf8')).nativeImageId).toBe(value.imageId)
})

it('rejects ordinary Compose maintenance without the installed image binding instead of selecting a legacy tag', () => {
  const value = fixture()
  writeFileSync(join(value.directory, '.env'), value.originalEnv.replace(`BACKEND_IMAGE=${value.sourceImage}\n`, ''))
  const result = nativeCompose(value.directory)
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('BACKEND_IMAGE')
})

it.each(['fetch', 'backup', 'report-target'])('preserves the previous binding for %s before live migration', failure => {
  const value = fixture(failure)
  expect(value.invoke().status).not.toBe(0)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv)
})

it.each(['live', 'up', 'up-identity'])('disables ordinary Compose after %s without restoring an old executable on migrated data', failure => {
  const value = fixture(failure)
  expect(value.invoke().status).not.toBe(0)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv.replace(value.sourceImage, ''))
  expect(nativeCompose(value.directory).status).not.toBe(0)
})

it.each(['duplicate', 'quoted', 'tag', 'symlink'])('rejects %s installed-image configuration before source changes', form => {
  const value = fixture(), path = join(value.directory, '.env')
  if (form === 'symlink') { renameSync(path, path + '.outside'); symlinkSync(path + '.outside', path) }
  else writeFileSync(path, form === 'duplicate' ? value.originalEnv + `BACKEND_IMAGE=${value.sourceImage}\n`
    : value.originalEnv.replace(value.sourceImage, form === 'tag' ? 'open-agricola:backend' : `"${value.sourceImage}"`))
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.kind === 'git')).toBe(false)
})

it('initializes the binding for an existing deployment that predates fixed image delivery', () => {
  const value = fixture(), before = value.originalEnv.replace(`BACKEND_IMAGE=${value.sourceImage}\n`, '')
  writeFileSync(join(value.directory, '.env'), before)
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(before + `BACKEND_IMAGE=${value.imageId}\n`)
  expect(JSON.parse(nativeCompose(value.directory).stdout).services.app.image).toBe(value.imageId)
})

it('rejects an installed selector that conflicts with the retained native application before stopping it', () => {
  const value = fixture()
  writeFileSync(join(value.directory, '.env'), value.originalEnv.replace(value.sourceImage, `sha256:${'e'.repeat(64)}`))
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args[0] === 'stop' || call.args[0] === 'checkout')).toBe(false)
})

it('bootstraps explicitly proven empty storage with a preloaded immutable Caddy and no invented source backup', () => {
  const value = fixture('', true), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  const commands = value.calls().map(call => call.args.join(' '))
  expect(commands.some(command => command.includes(' export ') || command.includes(' validate ') || command.startsWith('stop'))).toBe(false)
  expect(commands.findIndex(command => command.includes('check-empty'))).toBeLessThan(commands.findIndex(command => command.includes('check-live')))
  expect(commands.findIndex(command => command.includes('check-live'))).toBeLessThan(commands.findIndex(command => command.includes(' up ')))
  const config = value.compose()
  expect(config.services.capture).toBeUndefined()
  expect(config.services.caddy.image).toBe(value.caddyImage)
  const native = nativeCompose(value.directory)
  expect(native.status, native.stderr).toBe(0)
  expect(JSON.parse(native.stdout).services.app.image).toBe(value.imageId)
  expect(JSON.parse(native.stdout).services.caddy.image).toBe(value.caddyImage)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv + `BACKEND_IMAGE=${value.imageId}\nCADDY_IMAGE=${value.caddyImage}\n`)
})

it.each(['nonempty', 'unsupported-empty', 'caddy-digest', 'caddy-architecture', 'existing-caddy', 'retained-volume', 'caddy-foreign'])('rejects bootstrap %s before initializing or starting a stack', failure => {
  const value = fixture(failure, true), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
  expect(existsSync(join(value.directory, 'data/deployed-image.json'))).toBe(false)
})

it.each(['deployed', 'ledger', 'backup', 'legacy', 'sqlite', 'local-ledger'])('rejects local %s history even without application containers', history => {
  const value = fixture('', true)
  const file = { deployed: 'data/deployed-build-id', ledger: 'backups/replay-removals.latest.json', backup: 'backups/pre-old.tgz', legacy: 'legacy-data/database.sqlite', sqlite: 'data/open-agricola.db', 'local-ledger': 'data/replay-removals.jsonl' }[history]
  if (!file) throw new Error('Missing fixture path')
  mkdirSync(resolve(value.directory, file, '..'), { recursive: true })
  writeFileSync(join(value.directory, file), 'retained')
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-empty') || call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
})

it.each(['up-identity', 'caddy-up-identity', 'up'])('keeps an unaccepted bootstrap closed and drains both newly started services after %s', failure => {
  const value = fixture(failure, true)
  expect(value.invoke().status).not.toBe(0)
  expect(value.current().started).toBe(false)
  expect(value.current().caddyStarted).toBe(false)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv + 'BACKEND_IMAGE=\nCADDY_IMAGE=\n')
  expect(nativeCompose(value.directory).status).not.toBe(0)
})

it('does not infer bootstrap permission from a missing retained application', () => {
  const value = fixture('missing-app'), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-empty') || call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
})

it('refuses prior Caddy selector evidence in explicit bootstrap mode', () => {
  const value = fixture('', true)
  writeFileSync(join(value.directory, '.env'), value.originalEnv + `CADDY_IMAGE=${value.caddyImage}\n`)
  expect(value.invoke().status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-empty'))).toBe(false)
})

it('rejects ambiguous Caddy selectors before source mutation', () => {
  const value = fixture()
  writeFileSync(join(value.directory, '.env'), value.originalEnv + `CADDY_IMAGE=${value.caddyImage}\n`)
  expect(value.invoke().status).not.toBe(0)
  expect(value.calls().some(call => call.kind === 'git')).toBe(false)
})

it('still attempts Caddy stop when an unaccepted bootstrap application cannot be drained', () => {
  const value = fixture('up-app-stop', true), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('application drain could not be confirmed')
  expect(value.current().started).toBe(true)
  expect(value.current().caddyStarted).toBe(false)
  expect(value.calls().filter(call => call.args[0] === 'stop').map(call => call.args.at(-1))).toEqual(['3'.repeat(64), '2'.repeat(64)])
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv + 'BACKEND_IMAGE=\nCADDY_IMAGE=\n')
})

it('prepares owner-owned public community storage before the first bootstrap tool even with private umask', () => {
  const value = fixture('', true), community = join(value.directory, 'data/community'), preload = join(value.root, 'private-umask.mjs')
  expect(existsSync(community)).toBe(false)
  writeFileSync(preload, 'process.umask(0o077)')
  const result = value.invoke(value.request.sourceSha, { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` })
  expect(result.status, result.stderr).toBe(0)
  const observations = readFileSync(join(value.root, 'community-before-run.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(observations[0]).toEqual({ exists: true, directory: true, uid: process.getuid?.(), mode: 0o755 })
  expect(statSync(community).uid).toBe(process.getuid?.())
  expect(statSync(community).mode & 0o777).toBe(0o755)
})

it('preserves existing owner community bytes and permissions during an upgrade', () => {
  const value = fixture(), community = join(value.directory, 'data/community')
  mkdirSync(community, { mode: 0o700 })
  writeFileSync(join(community, 'whats-new.json'), 'preserve owner publication')
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(statSync(community).mode & 0o777).toBe(0o700)
  expect(readFileSync(join(community, 'whats-new.json'), 'utf8')).toBe('preserve owner publication')
})

it.each(['file', 'symlink', 'unwritable'])('refuses unsafe %s community storage before stopping or migrating', kind => {
  const value = fixture(), community = join(value.directory, 'data/community')
  if (kind === 'file') writeFileSync(community, 'keep owner bytes')
  else if (kind === 'symlink') { mkdirSync(join(value.root, 'outside-community')); symlinkSync(join(value.root, 'outside-community'), community) }
  else { mkdirSync(community); chmodSync(community, 0o500) }
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args[0] === 'stop' || call.args.includes('check-empty') || call.args.includes('check-live'))).toBe(false)
  if (kind === 'file') expect(readFileSync(community, 'utf8')).toBe('keep owner bytes')
  if (kind === 'unwritable') expect(statSync(community).mode & 0o777).toBe(0o500)
})

it('accepts the Docker Hub canonical spelling of the same preloaded Caddy digest', () => {
  const value = fixture('caddy-canonical', true), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(value.compose().services.caddy.image).toBe(value.caddyImage)
})

it('failed readonly empty proof creates no project volume and removes only its own transient container', () => {
  const value = fixture('nonempty', true), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.current().projectVolume).toBe(false)
  expect(value.current().proofRemoved).toBe(true)
  const args: string[] = JSON.parse(readFileSync(join(value.root, 'empty-proof-create.json'), 'utf8'))
  expect(args).toEqual(expect.arrayContaining(['--read-only', '--network', 'shared_dependencies', '--memory', '384m', '--memory-swap', '384m', '--cpus', '1', '--pids-limit', '64']))
  expect(args.some(arg => ['--volume', '-v', '--mount', '--publish'].includes(arg))).toBe(false)
  expect(value.calls().some(call => call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
  expect(value.calls().filter(call => call.args[0] === 'rm' && call.args.includes('4'.repeat(64))).map(call => call.args)).toEqual([['rm', '-f', '-v', '4'.repeat(64)]])
})

it('keeps the native maintenance timeout monotonic and integral when the server wall clock rolls back during work', () => {
  const value = fixture(), now = Date.now(), clock = join(value.root, 'maintenance-clock'), observed = join(value.root, 'backup-timeout'), preload = join(value.root, 'maintenance-clock.mjs')
  writeFileSync(clock, String(now))
  writeFileSync(preload, `import fs from 'node:fs';import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
const read=fs.readFileSync,rename=fs.renameSync,stat=fs.lstatSync,exec=cp.execFileSync;Date.now=()=>Number(read(${JSON.stringify(clock)},'utf8'));
fs.renameSync=(from,to)=>{const result=rename(from,to);if(String(to).endsWith('/maintenance-admission.json')){const value=JSON.parse(read(to,'utf8'));if(value.phase==='running')fs.writeFileSync(${JSON.stringify(clock)},String(value.startedAt+39*60000));}return result};
fs.lstatSync=(path,...args)=>{const result=stat(path,...args);if(String(path)===${JSON.stringify(join(value.directory, 'data/community'))})fs.writeFileSync(${JSON.stringify(clock)},${JSON.stringify(String(now))});return result};
cp.execFileSync=(command,args,options)=>{if(command==='bash'&&args?.[0]?.endsWith('/backup-storage.sh'))fs.writeFileSync(${JSON.stringify(observed)},JSON.stringify({timeout:options.timeout}));return exec(command,args,options)};syncBuiltinESMExports();`)
  const result = value.invoke(value.request.sourceSha, { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` })
  expect(result.status, result.stderr).toBe(0)
  const timeout = JSON.parse(readFileSync(observed, 'utf8')).timeout
  expect(Number.isInteger(timeout)).toBe(true)
  expect(timeout).toBeGreaterThan(0)
  expect(timeout).toBeLessThanOrEqual(60_000)
  expect(readFileSync(clock, 'utf8')).toBe(String(now))
})

it.each([
  ['initial Docker pin', 1, 500, 900],
  ['verification Docker pin', 2, 2000, 2400],
  ['frontend inspection', 6, 2000, 2400],
  ['inspection cleanup', 7, 2000, 2400],
])('bounds %s by the remaining maintenance deadline before any source mutation', (_name, delayedCall, remainingMs, delayMs) => {
  const value = fixture(), clock = join(value.root, 'entry-clock'), observed = join(value.root, 'entry-docker.jsonl')
  const counter = join(value.root, 'entry-count'), entered = join(value.root, 'entry-delayed'), completed = join(value.root, 'entry-completed')
  const preload = join(value.root, 'entry-clock.mjs'), dockerPath = join(value.bin, 'docker'), original = readFileSync(dockerPath, 'utf8'), newline = original.indexOf('\n')
  writeFileSync(clock, String(Date.now()))
  const delay = `const delayFs=require('node:fs'),counter=${JSON.stringify(counter)};const count=(delayFs.existsSync(counter)?Number(delayFs.readFileSync(counter,'utf8')):0)+1;delayFs.writeFileSync(counter,String(count));if(count===${delayedCall}){delayFs.writeFileSync(${JSON.stringify(entered)},'started');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${delayMs});delayFs.writeFileSync(${JSON.stringify(completed)},'finished');}\n`
  writeFileSync(dockerPath, original.slice(0, newline + 1) + delay + original.slice(newline + 1))
  writeFileSync(preload, `import fs from 'node:fs';import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
const read=fs.readFileSync,rename=fs.renameSync,exec=cp.execFileSync;Date.now=()=>Number(read(${JSON.stringify(clock)},'utf8'));
fs.renameSync=(from,to)=>{const result=rename(from,to);if(String(to).endsWith('/maintenance-admission.json')){const value=JSON.parse(read(to,'utf8'));if(value.phase==='running')fs.writeFileSync(${JSON.stringify(clock)},String(value.workDeadline-${remainingMs}));}return result};
cp.execFileSync=(command,args,options)=>{if(command==='docker')fs.appendFileSync(${JSON.stringify(observed)},JSON.stringify({args,timeout:options.timeout})+'\\n');return exec(command,args,options)};syncBuiltinESMExports();`)
  const result = value.invoke(value.request.sourceSha, { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` })
  expect(result.status).not.toBe(0)
  expect(existsSync(entered)).toBe(true)
  expect(existsSync(completed)).toBe(false)
  const calls: { args: string[]; timeout: number }[] = readFileSync(observed, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(calls).toHaveLength(delayedCall)
  expect(calls.every(call => Number.isInteger(call.timeout) && call.timeout > 0 && call.timeout <= remainingMs)).toBe(true)
  if (delayedCall >= 6) {
    const create = calls.find(call => call.args[0] === 'create')?.args
    if (!create) throw new Error('Inspection container creation was not observed')
    const name = create[create.indexOf('--name') + 1]
    expect(result.stderr).toContain(`inspection cleanup could not be confirmed for ${name}`)
  }
  expect(value.current().running).toBe(true)
  expect(value.calls().some(call => call.args[0] === 'stop' || call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv)
})
