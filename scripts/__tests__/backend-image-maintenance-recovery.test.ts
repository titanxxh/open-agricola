import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { backendImageMaintenanceFixture as fixture, removeBackendImageMaintenanceRoots } from './_helpers/backend-image-maintenance-fixture'

// These integration cases launch multiple helper processes; low-core CI needs a file-local test budget.
vi.setConfig({ testTimeout: 15_000 })

afterEach(removeBackendImageMaintenanceRoots)

it('reports running without inspecting or stopping a live validator', () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: '', livePresent: true })
  const result = value.operation('status')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'running', nextAction: 'wait', reason: 'validator-still-present' })
  const callsBefore = value.calls().length
  expect(value.operation('resume', value.authorize()).status).not.toBe(0)
  expect(value.calls().slice(callsBefore).some(call => call.args.includes('up') || call.args[0] === 'stop' || call.args[0] === 'rm')).toBe(false)
})

it('does not create a missing maintenance lock while reporting read-only status', () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  const lock = join(value.directory, 'backups/.maintenance.lock'); rmSync(lock)
  const result = value.operation('status')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'unknown', reason: 'operation-lock-missing' })
  expect(existsSync(lock)).toBe(false)
})

it('reports unknown for unavailable native checkpoint evidence and never starts an application', () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: '', proofUnavailable: true })
  const result = value.operation('status')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'unknown', reason: 'native-evidence-unavailable-or-invalid' })
  expect(value.operation('resume', value.authorize()).status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('up'))).toBe(false)
})

it('reports running while another actor holds the original maintenance lock', async () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  const holder = spawn(value.realFlock, ['-x', join(value.directory, 'backups/.maintenance.lock'), process.execPath, '-e', "process.stdout.write('held');process.stdin.resume()"], { stdio: ['pipe', 'pipe', 'pipe'] })
  await new Promise<void>((resolve, reject) => { holder.stdout.once('data', () => resolve()); holder.once('error', reject) })
  try {
    const before = value.calls().length, status = value.operation('status')
    expect(status.status, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toMatchObject({ state: 'running', nextAction: 'wait' })
    expect(value.calls()).toHaveLength(before)
    const resume = value.operation('resume', value.authorize())
    expect(resume.status).toBe(75)
    expect(JSON.parse(resume.stdout)).toMatchObject({ state: 'running', nextAction: 'wait' })
    expect(resume.stderr).toContain('did not run')
    expect(value.calls()).toHaveLength(before)
  } finally { holder.stdin.end(); await new Promise<void>(resolve => holder.once('exit', () => resolve())) }
}, 15_000)

it('drains only the unaccepted target when continuation startup fails and never restarts old', () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: 'up' })
  const result = value.operation('resume', value.authorize())
  expect(result.status).not.toBe(0)
  expect(value.current()).toMatchObject({ running: false, started: false })
  expect(value.calls().some(call => call.args[0] === 'start')).toBe(false)
  expect(value.calls().some(call => call.args[0] === 'stop' && call.args.at(-1) === '3'.repeat(64))).toBe(true)
})

it('resumes a stopped exact target after real Compose recreation removed the original source container', () => {
  const value = fixture('up'); value.mutate({ recreateSource: true })
  expect(value.invoke().status).not.toBe(0)
  expect(value.current()).toMatchObject({ sourceRemoved: true, started: false, running: false })
  const afterFailure = value.calls().length
  value.mutate({ failure: '' })
  const status = value.operation('status')
  expect(status.status, status.stderr).toBe(0)
  expect(JSON.parse(status.stdout)).toMatchObject({ state: 'resumable', phase: 'starting', validatorExitCode: 0 })
  const result = value.operation('resume', value.authorize())
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'accepted', validatorExitCode: 0 })
  expect(value.calls().slice(afterFailure).some(call => call.args[0] === 'inspect' && call.args[1] === value.oldId)).toBe(false)
  expect(value.calls().filter(call => call.args.includes('check-live'))).toHaveLength(1)
  expect(value.calls().filter(call => call.args.includes('export'))).toHaveLength(1)
  expect(value.calls().filter(call => call.args.includes('up'))).toHaveLength(2)
  expect(value.calls().some(call => call.args[0] === 'start' && call.args.includes(value.oldId))).toBe(false)
})

it.each(['oom', 'foreign project', 'foreign operation'])('rejects a stopped recreated target with %s instead of treating it as an accepted native target', failure => {
  const value = fixture('up'); value.mutate({ recreateSource: true })
  expect(value.invoke().status).not.toBe(0)
  value.mutate(failure === 'oom' ? { failure: 'oom' } : failure === 'foreign project' ? { failure: '', foreignApp: true } : { failure: '', foreignOperation: true })
  const result = value.operation('status')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout).state).toBe('blocked')
  expect(value.operation('resume', value.authorize()).status).not.toBe(0)
  expect(value.calls().filter(call => call.args.includes('up'))).toHaveLength(1)
})

it('finishes an interrupted startup when the exact target app is healthy but retained Caddy is stopped', () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: '', started: true, caddyStarted: false })
  const result = value.operation('resume', value.authorize())
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout).state).toBe('accepted')
  expect(value.current()).toMatchObject({ started: true, caddyStarted: true })
  expect(value.calls().filter(call => call.args.includes('up'))).toHaveLength(1)
  expect(value.calls().filter(call => call.args.includes('check-live'))).toHaveLength(1)
})

it('drains bootstrap app and owned Caddy within the finite cleanup budget after continuation failure', () => {
  const value = fixture('live', true); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: 'up' })
  const preload = join(value.root, 'resume-cleanup-budget.mjs'), observed = join(value.root, 'resume-stop-timeouts.jsonl')
  writeFileSync(preload, `import cp from 'node:child_process';import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
const exec=cp.execFileSync;cp.execFileSync=(command,args,options)=>{if(command==='docker'&&args?.[0]==='stop')fs.appendFileSync(${JSON.stringify(observed)},JSON.stringify({args,timeout:options.timeout})+'\\n');return exec(command,args,options)};syncBuiltinESMExports();`)
  const result = value.operation('resume', value.authorize(), { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` })
  expect(result.status).not.toBe(0)
  expect(value.current()).toMatchObject({ started: false, caddyStarted: false })
  const stops: { args: string[]; timeout: number }[] = readFileSync(observed, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(stops.map(call => call.args.at(-1))).toEqual(['3'.repeat(64), '2'.repeat(64)])
  expect(stops.every(call => call.args[2] === '90' && Number.isInteger(call.timeout) && call.timeout >= 100000 && call.timeout <= 300000)).toBe(true)
  expect(value.calls().some(call => call.args[0] === 'start' && call.args.includes(value.oldId))).toBe(false)
})

it('refuses foreign bootstrap Caddy during continuation cleanup while still draining owned app', () => {
  const value = fixture('live', true); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: 'up', foreignCaddy: true })
  const result = value.operation('resume', value.authorize())
  expect(result.status).not.toBe(0)
  expect(value.current()).toMatchObject({ started: false, caddyStarted: true })
  expect(value.calls().some(call => call.args[0] === 'stop' && call.args.at(-1) === '2'.repeat(64))).toBe(false)
})

it('attempts owned bootstrap Caddy drain even when unaccepted app drain fails', () => {
  const value = fixture('live', true); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: 'up-app-stop' })
  const result = value.operation('resume', value.authorize())
  expect(result.status).not.toBe(0)
  expect(value.current()).toMatchObject({ started: true, caddyStarted: false })
  expect(value.calls().some(call => call.args[0] === 'start' && call.args.includes(value.oldId))).toBe(false)
})

it('can observe an accepted operation after normal backup rotation without replaying maintenance', () => {
  const value = fixture(); expect(value.invoke().status).toBe(0)
  const stem = `pre-${value.request.sourceSha.slice(0, 12)}-${value.request.operationId}`
  for (const file of [`${stem}.manifest.json`, `${stem}.tgz`, `env-${stem}`]) rmSync(join(value.directory, 'backups', file))
  const result = value.operation('resume', value.authorize())
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout).state).toBe('accepted')
  expect(value.calls().filter(call => call.args.includes('up'))).toHaveLength(1)
})
