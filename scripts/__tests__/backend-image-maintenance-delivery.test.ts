import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { backendImageMaintenanceFixture as fixture, removeBackendImageMaintenanceRoots } from './_helpers/backend-image-maintenance-fixture'

// These integration cases launch multiple helper processes; low-core CI needs a file-local test budget.
vi.setConfig({ testTimeout: 15_000 })

afterEach(removeBackendImageMaintenanceRoots)

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
  expect(commands.find(command => command.includes('check-live'))).toContain('-e STORAGE_VALIDATION_CONCURRENCY=auto')
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

it('removes only the accepted operation archive after successful maintenance and retains its audit records', () => {
  const value = fixture()
  const other = join(value.directory, 'backups', '.backend-image-other')
  mkdirSync(other, { mode: 0o700 })
  writeFileSync(join(other, 'image.tar'), 'other operation archive')
  const before = ['request.json', 'image.json', 'intake-admission.json'].map(name => ({ name, bytes: readFileSync(join(value.stage, name)) }))
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(existsSync(value.archivePath)).toBe(false)
  for (const { name, bytes } of before) expect(readFileSync(join(value.stage, name))).toEqual(bytes)
  expect(existsSync(join(value.stage, 'source.json'))).toBe(true)
  expect(existsSync(join(value.stage, 'maintenance.compose.json'))).toBe(true)
  expect(existsSync(join(value.stage, 'maintenance-admission.json'))).toBe(true)
  expect(readFileSync(join(other, 'image.tar'), 'utf8')).toBe('other operation archive')
  expect(readFileSync(join(value.directory, 'data/deployed-build-id'), 'utf8')).toBe(value.request.sourceSha + '\n')
})

it.each(['backup', 'live', 'up-identity'])('preserves the uploaded archive and diagnostic records after %s failure', failure => {
  const value = fixture(failure), bytes = readFileSync(value.archivePath), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(readFileSync(value.archivePath)).toEqual(bytes)
  expect(existsSync(value.requestPath)).toBe(true)
  expect(existsSync(join(value.stage, 'image.json'))).toBe(true)
})

it('reports archive cleanup failure after acceptance without recursively deleting evidence or stopping the accepted app', () => {
  const value = fixture()
  rmSync(value.archivePath)
  mkdirSync(value.archivePath)
  writeFileSync(join(value.archivePath, 'diagnostic.txt'), 'retain unexpected archive path')
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Backend deployment accepted, but its uploaded image archive could not be removed')
  expect(value.current().started).toBe(true)
  expect(readFileSync(join(value.directory, 'data/deployed-build-id'), 'utf8')).toBe(value.request.sourceSha + '\n')
  expect(readFileSync(join(value.archivePath, 'diagnostic.txt'), 'utf8')).toBe('retain unexpected archive path')
  expect(existsSync(join(value.stage, 'image.json'))).toBe(true)
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

it('gives the named live validator the bounded remaining work budget rather than two minutes', () => {
  const value = fixture(), observed = join(value.root, 'live-timeout.json'), preload = join(value.root, 'live-timeout.mjs')
  writeFileSync(preload, `import fs from 'node:fs';import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
const exec=cp.execFileSync;cp.execFileSync=(command,args,options)=>{if(command==='docker'&&args?.includes('check-live'))fs.writeFileSync(${JSON.stringify(observed)},JSON.stringify({timeout:options.timeout,args}));return exec(command,args,options)};syncBuiltinESMExports();`)
  const result = value.invoke(value.request.sourceSha, { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` })
  expect(result.status, result.stderr).toBe(0)
  const live: { timeout: number; args: string[] } = JSON.parse(readFileSync(observed, 'utf8'))
  expect(live.timeout).toBeGreaterThan(120_000)
  expect(live.timeout).toBeLessThanOrEqual(30 * 60_000)
  expect(live.args[live.args.indexOf('--name') + 1]).toBe(`oa-formal-live-${value.request.operationId}`)
  expect(live.args).toContain(`org.open-agricola.backend-operation=${value.request.operationId}`)
  expect(live.args).toContain('org.open-agricola.backend-phase=live-validation')
  const deadline = Number(live.args.find(arg => arg.startsWith('BACKUP_DEADLINE_EPOCH_MS='))?.split('=')[1])
  expect(deadline).toBeGreaterThan(Date.now())
  expect(deadline).toBeLessThanOrEqual(Date.now() + 30 * 60_000)
})

it('removes only its native owned live-validation container after an actual command timeout', () => {
  const value = fixture('live-delay'), preload = join(value.root, 'live-timeout.mjs')
  writeFileSync(preload, `import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
const exec=cp.execFileSync;cp.execFileSync=(command,args,options)=>exec(command,args,command==='docker'&&args?.includes('check-live')?{...options,timeout:250}:options);syncBuiltinESMExports();`)
  const result = value.invoke(value.request.sourceSha, { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` })
  expect(result.status).not.toBe(0)
  expect(value.current()).toMatchObject({ livePresent: false, liveRemoved: true, running: false, started: false })
  expect(value.calls().filter(call => call.args[0] === 'rm' && call.args.includes('-f')).map(call => call.args)).toContainEqual(['rm', '-f', '-v', '5'.repeat(64)])
  expect(value.calls().some(call => call.args[0] === 'start' || call.args.includes('up'))).toBe(false)
})

it.each(['live-foreign', 'live-remove'])('fails closed when %s prevents exact live-validator cleanup', failure => {
  const value = fixture(failure), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Live target validation failed and its owned container cleanup could not be confirmed')
  expect(value.current()).toMatchObject({ livePresent: true, liveRemoved: false, running: false, started: false })
  if (failure === 'live-foreign') expect(value.calls().some(call => call.args[0] === 'rm' && call.args.includes('5'.repeat(64)))).toBe(false)
  expect(value.calls().some(call => call.args[0] === 'start' || call.args.includes('up'))).toBe(false)
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
