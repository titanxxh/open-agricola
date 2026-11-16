import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bounded, socketCut } from '../prerelease/live-acceptance/browser.mjs'
import { assertNoAccountValues, loadAccounts, privatePath, scrub } from '../prerelease/live-acceptance/context.mjs'
import { REQUIRED_EVIDENCE, SOURCES, acceptanceRecord, bundleEvidence, collectResults } from '../prerelease/live-acceptance/evidence.mjs'
import { REQUIRED_CASES, SUITE_CASES, parseCaseSelection, selectCases } from '../prerelease/live-acceptance/suites.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function privateRoot() { const root = mkdtempSync(join(tmpdir(), 'oa-live-acceptance-')); chmodSync(root, 0o700); roots.push(root); return root }
const accounts = [{ id: 'user-a-identifier', username: 'pre_a_name', password: 'pre-a-password-value', label: 'A' }]

describe('revocation socket cut', () => {
  const t0 = 10_000
  it('counts sockets live at t0, including one opened at t0, and reports when the last closed', () => {
    expect(socketCut([{ openedAt: 9_000, closedAt: 10_400 }, { openedAt: 10_000, closedAt: 10_900 }, { openedAt: 5_000, closedAt: 9_500 }], t0))
      .toEqual({ connectedAtStart: 2, closedAfterMs: 900 })
  })
  it('stays open while any live socket remains and ignores sockets of a replaced document', () => {
    expect(socketCut([{ openedAt: 9_000, closedAt: null }, { openedAt: 9_500, closedAt: 10_200 }], t0)).toEqual({ connectedAtStart: 2, closedAfterMs: null })
    expect(socketCut([{ openedAt: 3_000, closedAt: null, documentEndedAt: 8_000 }, { openedAt: 9_500, closedAt: 10_300 }], t0)).toEqual({ connectedAtStart: 1, closedAfterMs: 300 })
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
