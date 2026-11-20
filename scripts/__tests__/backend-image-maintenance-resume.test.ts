import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { backendImageMaintenanceFixture as fixture, removeBackendImageMaintenanceRoots } from './_helpers/backend-image-maintenance-fixture'
import { readBackendImageEvidence } from '../release/backend-image-receiver'
import { validateBackendResumeAuthorization } from '../release/backend-image-progress'

// These integration cases launch multiple helper processes; low-core CI needs a file-local test budget.
vi.setConfig({ testTimeout: 15_000 })

afterEach(removeBackendImageMaintenanceRoots)

it('observes accepted operations without changing the request, admission or progress and resumes idempotently', () => {
  const value = fixture(), first = value.invoke()
  expect(first.status, first.stderr).toBe(0)
  const files = [value.requestPath, join(value.stage, 'maintenance-admission.json'), join(value.stage, 'maintenance-progress.json')]
  const before = files.map(file => readFileSync(file, 'utf8'))
  const status = value.operation('status')
  expect(status.status, status.stderr).toBe(0)
  expect(JSON.parse(status.stdout)).toMatchObject({ kind: 'backend-image-operation', state: 'accepted', phase: 'accepted', validatorExitCode: 0 })
  expect(files.map(file => readFileSync(file, 'utf8'))).toEqual(before)
  const commandsBefore = value.calls().filter(call => call.args.includes('up') || call.args.includes('check-live') || call.args.includes('export')).length
  const result = value.operation('resume', value.authorize())
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout).state).toBe('accepted')
  expect(value.calls().filter(call => call.args.includes('up') || call.args.includes('check-live') || call.args.includes('export'))).toHaveLength(commandsBefore)
  expect(files.slice(0, 2).map(file => readFileSync(file, 'utf8'))).toEqual(before.slice(0, 2))
})

it('resumes the same operation from committed validation when the validator exit was lost', () => {
  const value = fixture('live'), first = value.invoke()
  expect(first.status).not.toBe(0)
  const request = readFileSync(value.requestPath, 'utf8'), admission = readFileSync(join(value.stage, 'maintenance-admission.json'), 'utf8')
  value.mutate({ failure: '' })
  const status = value.operation('status')
  expect(status.status, status.stderr).toBe(0)
  expect(JSON.parse(status.stdout)).toMatchObject({ state: 'resumable', phase: 'validating', validatorExitCode: null })
  const result = value.operation('resume', value.authorize())
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'accepted', validatorExitCode: null })
  expect(value.calls().filter(call => call.args.includes('check-live'))).toHaveLength(1)
  expect(value.calls().filter(call => call.args.includes('export'))).toHaveLength(1)
  expect(value.calls().filter(call => call.args.includes('up'))).toHaveLength(1)
  expect(value.calls().some(call => call.args[0] === 'start')).toBe(false)
  expect(readFileSync(value.requestPath, 'utf8')).toBe(request)
  expect(readFileSync(join(value.stage, 'maintenance-admission.json'), 'utf8')).toBe(admission)
  const query = value.calls().find(call => call.args.includes('--input-type=module'))?.args.find(arg => arg.includes('REPEATABLE READ READ ONLY'))
  expect(query).toContain('db.transaction(')
  expect(query).not.toMatch(/UPDATE|INSERT|DELETE/)
  expect(result.stdout).not.toContain('private-fixture')
}, 15_000)

it('uses fresh continuation authority after original work expiry without rewriting the original request or admission', () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: '' })
  const original = [value.requestPath, join(value.stage, 'maintenance-admission.json')].map(file => readFileSync(file, 'utf8'))
  const preload = join(value.root, 'resume-clock.mjs')
  writeFileSync(preload, 'const now=Date.now;Date.now=()=>now()+3600000;')
  const env = { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` }
  // One clock read: two reads can straddle a millisecond and stretch the lease past the 600000 ms work limit.
  const shifted = Date.now() + 3600000, authorization = value.authorize({ authorizedAt: shifted, expiresAt: shifted + 600000 })
  const result = value.operation('resume', authorization, env)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'accepted', validatorExitCode: null })
  expect([value.requestPath, join(value.stage, 'maintenance-admission.json')].map(file => readFileSync(file, 'utf8'))).toEqual(original)
  expect(value.calls().filter(call => call.args.includes('check-live'))).toHaveLength(1)
})

it.each([
  ['old checkpoint', { checkpointAt: 1 }],
  ['incomplete checkpoint', { proofStatus: 'importing' }],
  ['changed validation report', { badReport: true }],
  ['failed import', { badImports: 1 }],
  ['foreign writer', { active: 1, foreign: 1 }],
  ['unproven live writer', { active: 1 }],
] as const)('blocks continuation with %s before starting any application', (_name, changes) => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: '', ...changes })
  const status = value.operation('status')
  expect(status.status, status.stderr).toBe(0)
  expect(JSON.parse(status.stdout).state).toBe('blocked')
  expect(value.operation('resume', value.authorize()).status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('up') || call.args[0] === 'start')).toBe(false)
  expect(value.current().running).toBe(false)
})

it('accepts a small owner clock lead without extending the continuation work budget', () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: '' })
  const now = Date.now(), authorization = value.authorize({ authorizedAt: now + 10000, expiresAt: now + 610000 })
  const request = readBackendImageEvidence(value.requestPath, value.request).request
  const result = value.operation('resume', authorization)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'accepted', validatorExitCode: null })
  expect(validateBackendResumeAuthorization(authorization, request)).toBeLessThanOrEqual(600000)
}, 15_000)

it.each([
  ['future outside clock tolerance', 120000, 600000],
  ['overlong lease', 0, 600001],
] as const)('rejects continuation authority with %s before any startup', (_failure, offset, lease) => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  const now = Date.now(), result = value.operation('resume', value.authorize({ authorizedAt: now + offset, expiresAt: now + offset + lease }))
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('up'))).toBe(false)
}, 15_000)

it.each(['expired', 'foreign'] as const)('rejects %s continuation authorization without changing admission', failure => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: '' })
  const admission = readFileSync(join(value.stage, 'maintenance-admission.json'), 'utf8')
  const auth = value.authorize(failure === 'expired' ? { authorizedAt: Date.now() - 10000, expiresAt: Date.now() - 1 } : { bindingSha256: 'f'.repeat(64) })
  expect(value.operation('resume', auth).status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('up'))).toBe(false)
  expect(readFileSync(join(value.stage, 'maintenance-admission.json'), 'utf8')).toBe(admission)
})

it('rejects changed staged producer files rather than trusting the journal', () => {
  const value = fixture('live'); expect(value.invoke().status).not.toBe(0)
  writeFileSync(join(value.stage, 'policy/package.json'), '{"changed":true}')
  const result = value.operation('status')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'blocked', reason: 'staged-producer-changed' })
  expect(value.calls().some(call => call.args.includes('up'))).toBe(false)
})

it('preserves the explicit empty-storage boundary while resuming bootstrap', () => {
  const value = fixture('live', true); expect(value.invoke().status).not.toBe(0)
  value.mutate({ failure: '' })
  const result = value.operation('resume', value.authorize())
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'accepted', validatorExitCode: null })
  expect(value.calls().filter(call => call.args.includes('check-empty'))).toHaveLength(1)
  expect(value.calls().some(call => call.args.includes('export'))).toBe(false)
})
