import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { REQUIRED_EVIDENCE } from '../prerelease/live-acceptance/evidence.mjs'
import { fixtureGeneration as generation, fullAcceptanceFixture } from './_helpers/full-acceptance-fixture'
import { POLICY_STEPS, WINDOW_STEPS } from '../prerelease/live-acceptance/window.mjs'
import { CARRIED_CASES, FAST_SKIPPED_STEPS, assertCarryEligible, FULL_ACCEPTANCE_MAX_AGE_MS, IDENTITY_BOUNDARY_PATHS, boundaryDiff, loadFullAcceptance, rebindDecision } from '../prerelease/live-acceptance/rebind.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const privateRoot = () => { const root = mkdtempSync(join(tmpdir(), 'oa-rebind-')); chmodSync(root, 0o700); roots.push(root); return root }
const sha = (digit: string) => digit.repeat(40)
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

describe('identity boundary', () => {
  it('names only pathspecs that match tracked files, so a rename cannot silently drop coverage', () => {
    for (const pathspec of IDENTITY_BOUNDARY_PATHS) expect(execFileSync('git', ['ls-files', '--', pathspec], { encoding: 'utf8' }).trim(), pathspec).not.toBe('')
  })
  it('hashes the exact boundary patch and lists the changed files in order', () => {
    const calls: string[][] = []
    const git = (args: string[]) => { calls.push(args); return args.includes('--name-only') ? 'server/request-auth.ts\nserver/auth.ts\n' : 'diff --git a/server/auth.ts b/server/auth.ts\n' }
    expect(boundaryDiff(git, sha('a'), sha('b'))).toEqual({ from: sha('a'), to: sha('b'), files: ['server/auth.ts', 'server/request-auth.ts'],
      diffSha256: hash('diff --git a/server/auth.ts b/server/auth.ts\n') })
    expect(calls.every(args => args.includes('--') && args.slice(args.indexOf('--') + 1).join() === IDENTITY_BOUNDARY_PATHS.join())).toBe(true)
    expect(calls[1]).toContain('--full-index')
    expect(() => boundaryDiff(git, 'abc', sha('b'))).toThrow(/full formal SHAs/)
  })
})

it('skips only suite and deletion steps, never the policy phase, and carries only their cases', () => {
  expect(FAST_SKIPPED_STEPS.every(step => WINDOW_STEPS.includes(step))).toBe(true)
  expect(FAST_SKIPPED_STEPS.filter(step => POLICY_STEPS.includes(step) || ['preconditions', 'reverify', 'accounts', 'suite-handoff', 'suite-boundary'].includes(step))).toEqual([])
  expect([...CARRIED_CASES].sort()).toEqual(['continuity', 'formal-account-deletion', 'multihand-cooperation-viewer', 'public-sandbox', 'team-game', 'viewer-firefox', 'viewer-webkit'])
})

describe('full acceptance', () => {
  it('reads archived evidence beside the acceptance by hash and derives its formal build', () => {
    const path = fullAcceptanceFixture(privateRoot())
    const full = loadFullAcceptance(path)
    expect(full).toMatchObject({ path, buildId: sha('c'), image: 'sha256:image', generation, formalBuild: sha('a') })
    expect(Object.keys(full.evidence).sort()).toEqual(REQUIRED_EVIDENCE.filter(item => item !== 'formal-browser-policy').sort())
    expect(full.evidence.viewer.path).toBe(join(path, '../evidence/viewer.json'))
  })
  it('refuses a carried, failed, mixed or changed acceptance', () => {
    expect(() => loadFullAcceptance(fullAcceptanceFixture(privateRoot(), { body: item => ({ item, candidate: sha('c'), generation, formalBuild: sha('a'), passed: true, carriedFrom: {} }) })))
      .toThrow(/last full acceptance/)
    expect(() => loadFullAcceptance(fullAcceptanceFixture(privateRoot(), { body: item => ({ item, candidate: sha('c'), generation, formalBuild: sha('a'), passed: item !== 'viewer' }) })))
      .toThrow(/viewer did not pass/)
    expect(() => loadFullAcceptance(fullAcceptanceFixture(privateRoot(), { body: item => ({ item, candidate: sha('c'), generation, formalBuild: item === 'identity' ? sha('b') : sha('a'), passed: true }) })))
      .toThrow(/one formal build/)
    const path = fullAcceptanceFixture(privateRoot())
    writeFileSync(join(path, '../evidence/http-ws.json'), '{"changed":true}', { mode: 0o600 })
    expect(() => loadFullAcceptance(path)).toThrow(/http-ws is missing or changed/)
  })
})

describe('rebind decision', () => {
  const full = { path: '/x/acceptance.json', sha256: 'a'.repeat(64), buildId: sha('c'), image: 'sha256:image', generation, acceptedAt: 1_000_000, formalBuild: sha('a'), evidence: {} }
  const status = { installed: { buildId: sha('c'), image: 'sha256:image' }, generation }
  const clean = { from: sha('a'), to: sha('b'), files: [] as string[], diffSha256: 'e'.repeat(64) }
  const changed = { ...clean, files: ['server/auth.ts'], diffSha256: 'd'.repeat(64) }
  const now = full.acceptedAt + 60_000

  it('takes the fast path only for the same candidate, image and generation with no boundary change', () => {
    expect(rebindDecision({ full, status, boundary: clean, now })).toMatchObject({ path: 'fast', reasons: [],
      fullAcceptance: { sha256: full.sha256, formalBuild: sha('a') }, boundary: { files: [], acknowledged: false } })
  })
  it('records every reason that forces the full suites', () => {
    expect(rebindDecision({ full: null, status, boundary: null, now }).reasons).toEqual(['no full acceptance is named'])
    expect(rebindDecision({ request: 'full', full, status, boundary: clean, now }).reasons).toEqual(['owner requested a full acceptance'])
    expect(rebindDecision({ full, status, boundary: clean, now: full.acceptedAt + FULL_ACCEPTANCE_MAX_AGE_MS + 1 }).reasons).toEqual(['the last full acceptance is older than seven days'])
    expect(rebindDecision({ full, status: { installed: { buildId: sha('d'), image: 'sha256:other' }, generation: 'other' }, boundary: clean, now }).reasons).toEqual([
      'the installed candidate differs from the last full acceptance', 'the installed image differs from the last full acceptance', 'the data generation differs from the last full acceptance'])
    expect(rebindDecision({ full, status, boundary: changed, now })).toMatchObject({ path: 'full', reasons: ['identity-boundary files changed: server/auth.ts'], boundary: { acknowledged: false } })
  })
  it('accepts only the exact acknowledged boundary diff', () => {
    expect(rebindDecision({ full, status, boundary: changed, acknowledged: 'd'.repeat(64), now })).toMatchObject({ path: 'fast', boundary: { acknowledged: true } })
    expect(rebindDecision({ full, status, boundary: changed, acknowledged: 'e'.repeat(64), now }).path).toBe('full')
  })
})

describe('carry eligibility', () => {
  const status = { installed: { buildId: sha('c'), image: 'sha256:image' }, generation }
  const git = (patch: string) => (args: string[]) => args.includes('--name-only') ? (patch ? 'server/auth.ts\n' : '') : patch
  it('rechecks the window rules wherever evidence is carried', () => {
    const full = loadFullAcceptance(fullAcceptanceFixture(privateRoot(), { acceptedAt: 1_000_000 }))
    expect(assertCarryEligible({ full, status, formalBuild: sha('b'), git: git(''), now: 2_000_000 }).path).toBe('fast')
    expect(() => assertCarryEligible({ full, status, formalBuild: sha('b'), git: git(''), now: 1_000_000 + FULL_ACCEPTANCE_MAX_AGE_MS + 1 })).toThrow(/older than seven days/)
    expect(() => assertCarryEligible({ full, status: { ...status, installed: { ...status.installed, image: 'sha256:other' } }, formalBuild: sha('b'), git: git(''), now: 2_000_000 }))
      .toThrow(/installed image differs/)
    expect(() => assertCarryEligible({ full, status, formalBuild: sha('b'), git: git('PATCH'), now: 2_000_000 })).toThrow(/boundary files changed: server\/auth.ts/)
    expect(assertCarryEligible({ full, status, formalBuild: sha('b'), git: git('PATCH'), acknowledged: hash('PATCH'), now: 2_000_000 }).boundary.acknowledged).toBe(true)
  })
})
