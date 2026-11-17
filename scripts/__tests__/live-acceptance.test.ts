import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bounded, retryWithoutResponse, snapshotCut } from '../prerelease/live-acceptance/browser.mjs'
import { assertNoAccountValues, loadAcceptanceConfig, loadAccounts, privatePath, runsInParallel, scrub } from '../prerelease/live-acceptance/context.mjs'
import { REQUIRED_EVIDENCE, SOURCES, acceptanceRecord, bundleEvidence, collectResults } from '../prerelease/live-acceptance/evidence.mjs'
import { loadFullAcceptance } from '../prerelease/live-acceptance/rebind.mjs'
import { PARALLEL_SUITES, REQUIRED_CASES, SUITE_CASES, SUITE_ENGINES, parseCaseSelection, selectCases } from '../prerelease/live-acceptance/suites.mjs'
import { fixtureGeneration, fullAcceptanceFixture } from './_helpers/full-acceptance-fixture'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function privateRoot() { const root = mkdtempSync(join(tmpdir(), 'oa-live-acceptance-')); chmodSync(root, 0o700); roots.push(root); return root }
const accounts = [{ id: 'user-a-identifier', username: 'pre_a_name', password: 'pre-a-password-value', label: 'A' }]

describe('revocation socket cut', () => {
  const snapshot = { pageNow: 10_000, takenAt: 0, ids: [1, 2] }
  it('watches only the sockets the page saw open before the action and times them on the page clock', () => {
    const rows = [{ openedAt: 5_000, closedAt: 9_500, code: 1008 }, { openedAt: 9_000, closedAt: 10_400, code: 1008 }, { openedAt: 9_990, closedAt: 10_900, code: 1008 }]
    expect(snapshotCut(rows, snapshot)).toEqual({ connectedAtStart: 2, closedAfterMs: 900, stillOpen: false, codes: [1008, 1008] })
  })
  it('reports survival only when every watched socket was observed open', () => {
    expect(snapshotCut([{}, { closedAt: null, code: null }, { closedAt: null, code: null }], snapshot)).toMatchObject({ closedAfterMs: null, stillOpen: true })
    expect(snapshotCut([{}, { closedAt: null, code: null }, { closedAt: 10_200, code: 1008 }], snapshot)).toEqual({ connectedAtStart: 2, closedAfterMs: null, stillOpen: false, codes: [null, 1008] })
  })
  it('treats unreadable rows as unobserved, proving neither a close nor survival', () => {
    expect(snapshotCut([], snapshot)).toEqual({ connectedAtStart: 2, closedAfterMs: null, stillOpen: false, codes: [null, null], unobserved: true })
    expect(snapshotCut([{ closedAt: 9_000, code: 1000 }, { closedAt: null, code: null }], snapshot)).toMatchObject({ closedAfterMs: null, stillOpen: false, unobserved: true })
    expect(snapshotCut([], { pageNow: null, ids: [] })).toEqual({ connectedAtStart: 0, closedAfterMs: null, stillOpen: false, codes: [] })
  })
})

describe('setup request retry', () => {
  it('retries once only when no response arrived and records why', async () => {
    const retries: string[] = []
    let calls = 0
    expect(await retryWithoutResponse(async () => { if (++calls === 1) throw new Error('Timeout 15000ms exceeded.\nCall log'); return 200 }, 'formal me', retries)).toBe(200)
    expect(retries).toEqual(['formal me: Timeout 15000ms exceeded.'])
    await expect(retryWithoutResponse(async () => { throw new Error('socket hang up') }, 'formal me', retries)).rejects.toThrow('socket hang up')
    expect(retries).toHaveLength(2)
  })
  it('keeps the first received status, even a failing one', async () => {
    const retries: string[] = []
    let calls = 0
    expect(await retryWithoutResponse(async () => { calls++; return 401 }, 'formal me', retries)).toBe(401)
    expect(calls).toBe(1)
    expect(retries).toEqual([])
  })
})

it('bounds a pending evaluation with its fallback and records the label', async () => {
  const hung: string[] = []
  expect(await bounded(new Promise(() => {}), 20, 'frame state', { accountUi: false }, hung)).toEqual({ accountUi: false })
  expect(await bounded(Promise.resolve(7), 1_000, 'fast', 0, hung)).toBe(7)
  expect(hung).toEqual(['frame state'])
})

describe('private inputs', () => {
  it('accepts only owner-private regular files', () => {
    const root = privateRoot(), file = join(root, 'accounts.json'), link = join(root, 'link.json')
    writeFileSync(file, '{}', { mode: 0o644 })
    expect(() => privatePath(file, 'Accounts')).toThrow(/owner-private/)
    chmodSync(file, 0o600); symlinkSync(file, link)
    expect(privatePath(file, 'Accounts')).toBe(file)
    expect(() => privatePath(link, 'Accounts')).toThrow(/owner-private/)
  })
  it('labels accounts in order and requires the exact count', () => {
    const root = privateRoot(), file = join(root, 'accounts.json')
    writeFileSync(file, JSON.stringify({ accounts: [{ id: 'a', username: 'u', password: 'p' }] }), { mode: 0o600 })
    expect(loadAccounts(file, ['A']).map(a => a.label)).toEqual(['A'])
    expect(() => loadAccounts(file, ['A', 'B'])).toThrow(/exactly 2/)
  })
  it('gives each configured engine its own A–C and runs a suite in parallel only when every engine has them', () => {
    const root = privateRoot(), file = (name: string, value: unknown) => { const path = join(root, name); writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); return path }
    const set = (prefix: string) => ({ accounts: ['A', 'B', 'C'].map(label => ({ id: `${prefix}-${label}`, username: `${prefix}_${label}`, password: `${prefix}-password-${label}` })) })
    const target = file('target.json', { origin: 'https://pre.example.test', formal: { appOrigin: 'https://app.example.test', apiOrigin: 'https://api.example.test' } })
    const config = (extra: Record<string, unknown>) => file(`config-${Object.keys(extra).join('-') || 'base'}-${Math.random()}.json`, { format: 1, targetConfig: target, ssh: 'owner@host',
      candidate: 'c'.repeat(40), formalBuild: 'b'.repeat(40), candidateReceipt: file('receipt.json', { purpose: 'candidate', channel: 'prerelease', sourceSha: 'c'.repeat(40), producerSha: 'd'.repeat(40) }),
      accounts: file('chromium.json', set('chromium')), ownerCookie: file('cookie', '__Host-oa-session=abc'), guardConfig: '/srv/guard.json', outputRoot: root, ...extra })
    mkdirSync(root, { recursive: true })
    const legacy = loadAcceptanceConfig(config({}))
    expect(Object.keys(legacy.engineAccounts)).toEqual(['chromium'])
    expect(runsInParallel(legacy, SUITE_ENGINES.boundary)).toBe(false)
    const ctx = loadAcceptanceConfig(config({ engineAccounts: { firefox: file('firefox.json', set('firefox')), webkit: file('webkit.json', set('webkit')) } }))
    expect(ctx.engineAccounts.webkit.map((account: { label: string }) => account.label)).toEqual(['A', 'B', 'C'])
    expect(ctx.allAccounts).toHaveLength(9)
    expect(runsInParallel(ctx, SUITE_ENGINES.boundary)).toBe(true)
    expect(runsInParallel(ctx, ['webkit'])).toBe(false)
    expect(PARALLEL_SUITES).toEqual(['handoff', 'boundary'])
    expect(() => loadAcceptanceConfig(config({ engineAccounts: { chromium: file('other.json', set('other')) } }))).toThrow(/chromium uses accounts/)
    expect(() => loadAcceptanceConfig(config({ engineAccounts: { firefox: file('dup.json', set('chromium')) } }))).toThrow(/distinct accounts/)
  })
  it('scrubs account values and URL secrets, and refuses evidence that still carries them', () => {
    expect(scrub(accounts, 'login pre_a_name with pre-a-password-value at /x?code=abc&state=def')).toBe('login <A> with <A> at /x?code=<redacted>&state=<redacted>')
    expect(() => assertNoAccountValues(accounts, '{"user":"user-a-identifier"}', 'identity')).toThrow(/would leak/)
    expect(() => assertNoAccountValues(accounts, '{"user":"A"}', 'identity')).not.toThrow()
  })
})

describe('case selection', () => {
  it('keeps every case without --case and validates labels before any remote work', () => {
    expect(parseCaseSelection('boundary', undefined)).toBeNull()
    expect(parseCaseSelection('boundary', 'revocation, beta-boundary')).toEqual(['revocation', 'beta-boundary'])
    expect(() => parseCaseSelection('boundary', 'revoke')).toThrow(/Unknown boundary case revoke/)
    expect(() => parseCaseSelection('boundary', ',')).toThrow(/at least one/)
    expect(() => parseCaseSelection('nope', 'handoff')).toThrow(/Unknown suite nope/)
  })
  it('runs only the selected cases, in plan order, on engines that have them', () => {
    expect(selectCases('boundary', 'webkit', null).map(c => c.label)).toEqual(SUITE_CASES.boundary)
    expect(selectCases('boundary', 'webkit', ['revocation', 'visitor'])).toEqual([{ label: 'visitor', index: 0 }, { label: 'revocation', index: 3 }])
    expect(selectCases('viewer', 'firefox', ['viewer-webkit'])).toEqual([])
    expect(selectCases('viewer', 'webkit', ['viewer-webkit'])).toEqual([{ label: 'viewer-webkit', index: 0 }])
  })
})

describe('acceptance evidence', () => {
  function runDirectory(root: string, name: string, files: Record<string, unknown>) {
    const directory = join(root, name); mkdirSync(directory, { mode: 0o700 })
    for (const [file, value] of Object.entries(files)) writeFileSync(join(directory, file), JSON.stringify(value), { mode: 0o600 })
    return directory
  }
  // One passing result per required (case, engine) pair, except those `failed` lists.
  const fullRun = (root: string, name: string, { failed = [] as string[], skip = [] as string[] } = {}) => runDirectory(root, name, Object.fromEntries(REQUIRED_CASES
    .filter(pair => !skip.includes(`${pair.case}:${pair.engine}`))
    .map((pair, index) => [`result-${pair.case}-${pair.engine}-${index}.json`, { engine: pair.engine, version: name, results: [{ case: pair.case, passed: !failed.includes(`${pair.case}:${pair.engine}`) }] }])))
  const rerun = (root: string, name: string, engine: string, results: Array<{ case: string; passed: boolean }>) =>
    runDirectory(root, name, { [`result-boundary-${engine}-1.json`]: { engine, version: name, cases: results.map(r => r.case), results } })
  const bundle = (root: string, runs: string[], extra = {}) => {
    const output = join(root, 'evidence'); mkdirSync(output, { mode: 0o700 })
    return bundleEvidence({ results: collectResults(runs), output, common: { candidate: 'c' }, accounts, extra })
  }
  const sourceOf = (index: Record<string, { path: string }>, item: string, testCase: string, engine: string) => JSON.parse(readFileSync(index[item].path, 'utf8'))
    .results.find((row: { case: string; engine: string }) => row.case === testCase && row.engine === engine).source.path as string

  it('keeps the newest result per case and engine, aggregates pass state and binds the acceptance file', () => {
    const root = privateRoot()
    const first = fullRun(root, 'run-1', { failed: ['handoff:chromium'] })
    const second = runDirectory(root, 'run-2', { 'result-handoff-chromium-2.json': { engine: 'chromium', version: '2', results: [{ case: 'handoff', passed: true }] } })
    const results = collectResults([first, second])
    expect(results.filter(r => r.result.case === 'handoff' && r.engine === 'chromium').map(r => r.run.version)).toEqual(['2'])
    const index = bundleEvidence({ results, output: (mkdirSync(join(root, 'evidence'), { mode: 0o700 }), join(root, 'evidence')), common: { candidate: 'c' }, accounts, extra: { capacity: { note: 'provisional' } } })
    expect(Object.entries(index).filter(([, entry]) => !entry.passed).map(([item]) => item)).toEqual(['formal-unaffected'])
    expect(sourceOf(index, 'identity', 'handoff', 'chromium')).toContain('run-2')
    const record = acceptanceRecord({ targetId: 'prerelease-main', healthyCycle: 'cycle', index, formalBrowser: { path: '/proof.json', sha256: 'f'.repeat(64) },
      status: { fingerprint: 'fp', generation: 'gen', installed: { buildId: 'b'.repeat(40), image: 'sha256:x' }, operation: { id: 'op' } } })
    expect(Object.keys(record.evidence).sort()).toEqual([...REQUIRED_EVIDENCE].sort())
    expect(record).toMatchObject({ format: 1, channel: 'prerelease', targetId: 'prerelease-main', buildId: 'b'.repeat(40), operationId: 'op', healthyCycle: 'cycle' })
  })
  it('lets a later single-case rerun replace only its own failed case', () => {
    const root = privateRoot()
    const full = fullRun(root, 'run-1', { failed: ['revocation:webkit'] })
    const index = bundle(root, [full, rerun(root, 'run-2', 'webkit', [{ case: 'revocation', passed: true }])])
    expect(index['beta-access'].passed).toBe(true)
    expect(index['http-ws'].passed).toBe(true)
    expect(sourceOf(index, 'beta-access', 'revocation', 'webkit')).toContain('run-2')
    expect(sourceOf(index, 'http-ws', 'visitor', 'webkit')).toContain('run-1')
  })
  it('blocks when the newest single-case rerun failed after an earlier pass', () => {
    const root = privateRoot()
    const index = bundle(root, [fullRun(root, 'run-1'), rerun(root, 'run-2', 'webkit', [{ case: 'revocation', passed: false }])])
    expect(index['beta-access'].passed).toBe(false)
    expect(index['http-ws'].passed).toBe(true)
  })
  it('blocks an item when a required case never ran on a required engine, even with owner notes', () => {
    const root = privateRoot()
    const index = bundle(root, [fullRun(root, 'run-1', { skip: ['visitor:firefox', 'formal-account-deletion:chromium'] })], { 'deletion-audit': { passed: true, note: 'rows checked' } })
    expect(index['http-ws'].passed).toBe(false)
    expect(JSON.parse(readFileSync(index['http-ws'].path, 'utf8')).missing).toEqual([{ case: 'visitor', engine: 'firefox' }])
    expect(index['deletion-audit'].passed).toBe(false)
    expect(index['browser-boundary'].passed).toBe(true)
  })
  it('blocks passed cases whose own maintenance run could not prove the public origin stayed closed', () => {
    const leaky = (root: string) => runDirectory(root, 'run-2', { 'result-boundary-webkit-2.json': { engine: 'webkit', version: '2', mode: 'maintenance', publicStill503: false,
      cases: ['beta-boundary', 'revocation'], results: [{ case: 'beta-boundary', passed: true }, { case: 'revocation', passed: true }] } })
    const root = privateRoot()
    const index = bundle(root, [fullRun(root, 'run-1'), leaky(root)])
    expect(index['browser-boundary'].passed).toBe(false)
    expect(index['beta-access'].passed).toBe(false)
    expect(JSON.parse(readFileSync(index['browser-boundary'].path, 'utf8')).results.find((row: { engine: string }) => row.engine === 'webkit').publicClosed).toBe(false)
    // A closed-origin rerun restores only its own case; the other case from the leaky run still blocks.
    const later = privateRoot()
    const rerunIndex = bundle(later, [fullRun(later, 'run-1'), leaky(later), runDirectory(later, 'run-3', { 'result-boundary-webkit-3.json': { engine: 'webkit', version: '3',
      mode: 'maintenance', publicStill503: true, cases: ['beta-boundary'], results: [{ case: 'beta-boundary', passed: true }] } })])
    expect(rerunIndex['browser-boundary'].passed).toBe(true)
    expect(rerunIndex['beta-access'].passed).toBe(false)
  })
  describe('fast rebind carry', () => {
    // A fast window runs handoff and boundary only; every other case comes from the last full acceptance.
    const fastRun = (root: string, { failed = [] as string[] } = {}) => fullRun(root, 'fast-run', { failed,
      skip: REQUIRED_CASES.filter(pair => !['handoff', 'visitor', 'ordinary', 'beta-boundary', 'revocation'].includes(pair.case)).map(pair => `${pair.case}:${pair.engine}`) })
    const carryBundle = (root: string, run: string, carry: ReturnType<typeof loadFullAcceptance>, common = { candidate: 'c'.repeat(40), generation: fixtureGeneration }) => {
      const output = join(root, 'evidence'); mkdirSync(output, { mode: 0o700 })
      return bundleEvidence({ results: collectResults([run]), output, common, accounts, extra: { capacity: { passed: true }, 'formal-unaffected': { passed: true } }, carry })
    }
    const body = (index: Record<string, { path: string }>, item: string) => JSON.parse(readFileSync(index[item].path, 'utf8'))

    it('measures handoff and boundary items fresh and carries the rest with their source hash', () => {
      const root = privateRoot(), carry = loadFullAcceptance(fullAcceptanceFixture(root)), index = carryBundle(root, fastRun(root), carry)
      expect(Object.entries(index).filter(([, entry]) => !entry.passed)).toEqual([])
      expect(body(index, 'identity').carriedFrom).toBeUndefined()
      expect(body(index, 'browser-boundary').carriedFrom).toBeUndefined()
      const viewer = body(index, 'viewer'), httpWs = body(index, 'http-ws')
      expect(viewer).toMatchObject({ results: [], carriedFrom: { acceptanceSha256: carry.sha256, formalBuild: 'a'.repeat(40), evidence: { path: carry.evidence.viewer.path, sha256: carry.evidence.viewer.sha256 } },
        carried: carry.evidence.viewer.body })
      // Mixed items keep their fresh rows and carry only the cases this window skipped.
      expect(httpWs.carriedCases).toEqual([{ case: 'team-game', engine: 'chromium' }])
      expect(httpWs.results.map((row: { case: string }) => row.case)).toContain('visitor')
      expect(body(index, 'beta-access').carriedCases.map((pair: { case: string }) => pair.case).sort()).toEqual(['formal-account-deletion', 'multihand-cooperation-viewer'])
    })
    it('never carries handoff or boundary cases: without fresh results those items block', () => {
      const root = privateRoot(), carry = loadFullAcceptance(fullAcceptanceFixture(root)), empty = runDirectory(root, 'empty', {})
      const index = carryBundle(root, empty, carry)
      expect(Object.entries(index).filter(([, entry]) => !entry.passed).map(([item]) => item).sort()).toEqual(['beta-access', 'browser-boundary', 'http-ws', 'identity'])
      expect(body(index, 'identity')).toMatchObject({ passed: false, missing: SUITE_ENGINES.handoff.map(engine => ({ case: 'handoff', engine })) })
      expect(body(index, 'identity').carriedFrom).toBeUndefined()
      expect(body(index, 'http-ws').missing.map((pair: { case: string }) => pair.case)).not.toContain('team-game')
      expect(body(index, 'viewer').passed).toBe(true)
    })
    it('still fails on a fresh failure, a failed carried item or another candidate', () => {
      const root = privateRoot(), carry = loadFullAcceptance(fullAcceptanceFixture(root))
      expect(carryBundle(root, fastRun(root, { failed: ['revocation:webkit'] }), carry)['beta-access'].passed).toBe(false)
      const other = privateRoot()
      expect(() => carryBundle(other, fastRun(other), carry, { candidate: 'd'.repeat(40), generation: fixtureGeneration })).toThrow(/another candidate or generation/)
      const failed = privateRoot(), stale = loadFullAcceptance(fullAcceptanceFixture(failed))
      stale.evidence.viewer = { ...stale.evidence.viewer, body: { ...stale.evidence.viewer.body, passed: false } }
      expect(carryBundle(failed, fastRun(failed), stale).viewer.passed).toBe(false)
    })
  })
  it('refuses to bundle a result that would leak an account value', () => {
    const root = privateRoot(), output = join(root, 'evidence'); mkdirSync(output, { mode: 0o700 })
    const run = runDirectory(root, 'run', { 'result-handoff-chromium-1.json': { engine: 'chromium', results: [{ case: 'handoff', passed: true, note: 'pre_a_name' }] } })
    expect(() => bundleEvidence({ results: collectResults([run]), output, common: {}, accounts })).toThrow(/would leak/)
  })
})

it('records every suite case under a label the evidence mapping reads, so a retried pass replaces the failure', () => {
  const referenced = new Set(Object.values(SOURCES).flat())
  const labels = Object.entries(SUITE_CASES).filter(([suite]) => suite !== 'readback').flatMap(([, cases]) => cases)
  expect(labels.filter(label => !referenced.has(label))).toEqual([])
})
