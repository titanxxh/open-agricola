// @covers scripts/release/backend-image.ts
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { backendImageDeployment, followBackendOperation } from '../release/backend-image'

vi.mock('../release/backend-candidate.ts', () => ({ backendCandidate: (_cwd: string, refs: string[]) => refs[0] }))

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(state = 'accepted', otherSource = false, resumedState = 'accepted', resumedPatch: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'oa-backend-owner-status-')); roots.push(root)
  const bin = join(root, 'bin'); mkdirSync(bin)
  const source = 'a'.repeat(40), producer = 'b'.repeat(40), operation = '12345678-1234-1234-1234-123456789abc', calls = join(root, 'calls.jsonl')
  const status = { kind: 'backend-image-operation', operationId: operation, sourceSha: otherSource ? 'c'.repeat(40) : source, producerSha: producer,
    bindingSha256: 'd'.repeat(64), state, phase: 'accepted', nextAction: state === 'running' ? 'wait' : 'none', validatorExitCode: null }
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nconst a=process.argv.slice(2);if(a.includes('rev-parse'))console.log(${JSON.stringify(producer)});else if(!a.includes('status'))process.exit(2);\n`, { mode: 0o700 })
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');const status=${JSON.stringify(status)};if(process.argv.at(-1)?.includes("'resume'"))Object.assign(status,{state:${JSON.stringify(resumedState)}},${JSON.stringify(resumedPatch)});console.log(JSON.stringify(status));\n`, { mode: 0o700 })
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}\nthrow Error('Status must not require GitHub or credentials');\n`, { mode: 0o700 })
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
  const output: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(value => { output.push(String(value)); return true })
  return { root, source, producer, operation, output, calls: () => readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
}

it('prints standard read-only backend status without provider credentials or image inputs', async () => {
  const value = fixture()
  await backendImageDeployment(value.root, ['status', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])
  expect(JSON.parse(value.output.join(''))).toMatchObject({ kind: 'backend-image-operation', sourceSha: value.source, producerSha: value.producer, state: 'accepted', validatorExitCode: null })
  expect(value.calls()).toHaveLength(1)
  expect(value.calls()[0].at(-1)).toContain("'status'")
  expect(value.calls()[0]).toEqual(expect.arrayContaining(['ServerAliveInterval=15', 'ServerAliveCountMax=8']))
  expect(value.calls()[0].at(-1)).not.toMatch(/scp|writeFile|maintain|resume-/)
})

it('does not authorize a second continuation while the original operation is running', async () => {
  const value = fixture('running')
  await expect(backendImageDeployment(value.root, ['resume', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])).rejects.toThrow('running')
  expect(value.calls()).toHaveLength(1)
})

it.each(['running', 'resumable', 'blocked', 'unknown'])('rejects a successful SSH response when the raced continuation still reports %s', async state => {
  const value = fixture('resumable', false, state)
  await expect(backendImageDeployment(value.root, ['resume', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])).rejects.toThrow('acceptance was not confirmed')
  expect(value.calls()).toHaveLength(3)
  expect(value.output).toEqual([])
})

it.each(['operationId', 'sourceSha', 'producerSha', 'bindingSha256'])('rejects an accepted response whose %s changed during continuation', async field => {
  const value = fixture('resumable', false, 'accepted', { [field]: 'f'.repeat(field === 'bindingSha256' ? 64 : 40) })
  await expect(backendImageDeployment(value.root, ['resume', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])).rejects.toThrow('another operation')
  expect(value.calls()).toHaveLength(3)
  expect(value.output).toEqual([])
})

it('reports successful resume only after matching native accepted status', async () => {
  const value = fixture('resumable')
  await backendImageDeployment(value.root, ['resume', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])
  expect(JSON.parse(value.output.join(''))).toMatchObject({ state: 'accepted', operationId: value.operation })
  expect(value.calls()).toHaveLength(3)
})

it('rejects remote status for a different fixed source before issuing continuation authorization', async () => {
  const value = fixture('accepted', true)
  await expect(backendImageDeployment(value.root, ['resume', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])).rejects.toThrow('another operation')
  expect(value.calls()).toHaveLength(1)
})

it('rejects arbitrary operation paths and ambiguous owner target syntax', async () => {
  const value = fixture()
  await expect(backendImageDeployment(value.root, ['status', 'owner@example.test', value.source, '/srv/formal', '--operation-id', '../another'])).rejects.toThrow('Usage:')
  expect(value.output).toEqual([])
})

/** Each SSH call takes the next scripted reply: a status object, or { exit } for a dropped connection. */
function followFixture(replies: Array<Record<string, unknown>>) {
  const root = mkdtempSync(join(tmpdir(), 'oa-backend-follow-')); roots.push(root)
  const bin = join(root, 'bin'); mkdirSync(bin)
  const source = 'a'.repeat(40), producer = 'b'.repeat(40), operation = '12345678-1234-1234-1234-123456789abc', calls = join(root, 'calls.jsonl'), queue = join(root, 'queue.json')
  const base = { kind: 'backend-image-operation', operationId: operation, sourceSha: source, producerSha: producer, bindingSha256: 'd'.repeat(64), phase: 'accepted', validatorExitCode: null }
  writeFileSync(queue, JSON.stringify(replies.map(reply => 'exit' in reply ? reply : { ...base, ...reply })))
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nconst a=process.argv.slice(2);if(a.includes('rev-parse'))console.log(${JSON.stringify(producer)});else if(!a.includes('status'))process.exit(2);\n`, { mode: 0o700 })
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}\nconst fs=require('node:fs');const command=process.argv.at(-1);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(command)+'\\n');
if(command.includes("'-e'")){fs.readFileSync(0);process.exit(0)}
const q=JSON.parse(fs.readFileSync(${JSON.stringify(queue)},'utf8'));const next=q.shift();fs.writeFileSync(${JSON.stringify(queue)},JSON.stringify(q));
if(!next||next.exit){process.stderr.write('Connection to host closed by remote host.\\n');process.exit(next?.exit??255)}console.log(JSON.stringify(next))\n`, { mode: 0o700 })
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
  return { root, target: { host: 'owner@example.test', sourceSha: source, directory: '/srv/formal', operationId: operation }, calls: () => readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
}

it('follows a dropped maintenance session until the backend reports acceptance', async () => {
  const value = followFixture([{ state: 'running', nextAction: 'wait' }, { exit: 255 }, { exit: 255 }, { state: 'running', nextAction: 'wait' }, { state: 'accepted', nextAction: 'none' }])
  const output = await followBackendOperation(value.root, value.target, { pollMs: 1, deadlineMs: 10_000 })
  expect(JSON.parse(output)).toMatchObject({ state: 'accepted', operationId: value.target.operationId })
  expect(value.calls()).toHaveLength(5)
  expect(value.calls().every(command => command.includes("'status'"))).toBe(true)
})

it('continues a resumable operation after the connection returns and requires native acceptance', async () => {
  const value = followFixture([{ state: 'resumable', nextAction: 'resume' }, { state: 'accepted', nextAction: 'none' }])
  const output = await followBackendOperation(value.root, value.target, { pollMs: 1, deadlineMs: 10_000 })
  expect(JSON.parse(output)).toMatchObject({ state: 'accepted' })
  expect(value.calls().map(command => command.includes("'resume'") ? 'resume' : command.includes("'-e'") ? 'authorize' : 'status')).toEqual(['status', 'authorize', 'resume'])
})

it.each(['blocked', 'unknown'])('stops following when the backend reports %s and names the status command', async state => {
  const value = followFixture([{ state, nextAction: 'inspect' }])
  await expect(followBackendOperation(value.root, value.target, { pollMs: 1, deadlineMs: 10_000 })).rejects.toThrow(/deploy-backend\.sh status owner@example\.test/)
})

it('gives up with the status command when the backend stays unreachable past the deadline', async () => {
  const value = followFixture(Array.from({ length: 50 }, () => ({ exit: 255 })))
  await expect(followBackendOperation(value.root, value.target, { pollMs: 1, deadlineMs: 30 })).rejects.toThrow(/unreachable.*deploy-backend\.sh status/s)
})

it('starts the deploy-backend.sh entry on plain Node without a TypeScript resolver', () => {
  // deploy-backend.sh runs `node scripts/release/backend-image.ts`; storage tools load only in child processes.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_OPTIONS'))
  const result = spawnSync(process.execPath, ['scripts/release/backend-image.ts', 'status'], { cwd: resolve(import.meta.dirname, '../..'), env, encoding: 'utf8', timeout: 30_000 })
  expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
  expect(result.stderr).toContain('Usage: deploy-backend.sh status|resume')
})
