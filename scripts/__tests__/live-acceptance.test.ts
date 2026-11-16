import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bounded, socketCut } from '../prerelease/live-acceptance/browser.mjs'
import { assertNoAccountValues, loadAccounts, privatePath, scrub } from '../prerelease/live-acceptance/context.mjs'
import { REQUIRED_EVIDENCE, acceptanceRecord, bundleEvidence, collectResults } from '../prerelease/live-acceptance/evidence.mjs'

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

describe('acceptance evidence', () => {
  function runDirectory(root: string, name: string, files: Record<string, unknown>) {
    const directory = join(root, name); mkdirSync(directory, { mode: 0o700 })
    for (const [file, value] of Object.entries(files)) writeFileSync(join(directory, file), JSON.stringify(value), { mode: 0o600 })
    return directory
  }
  it('keeps the newest result per case and engine, aggregates pass state and binds the acceptance file', () => {
    const root = privateRoot(), output = join(root, 'evidence'); mkdirSync(output, { mode: 0o700 })
    const first = runDirectory(root, 'run-1', { 'result-handoff-chromium-1.json': { engine: 'chromium', version: '1', results: [{ case: 'handoff', passed: false }] } })
    const second = runDirectory(root, 'run-2', { 'result-handoff-chromium-2.json': { engine: 'chromium', version: '2', results: [{ case: 'handoff', passed: true }] },
      'result-boundary-webkit-3.json': { engine: 'webkit', version: '3', results: [{ case: 'beta-boundary', passed: true }, { case: 'revocation', passed: true }] } })
    const results = collectResults([first, second])
    expect(results.filter(r => r.result.case === 'handoff').map(r => r.run.version)).toEqual(['2'])
    const index = bundleEvidence({ results, output, common: { candidate: 'c' }, accounts, extra: { capacity: { note: 'provisional' } } })
    expect(index.identity.passed).toBe(true)
    expect(index['browser-boundary'].passed).toBe(true)
    expect(index['public-cards'].passed).toBe(false)
    expect(index.capacity.passed).toBe(true)
    expect(JSON.parse(readFileSync(index.identity.path, 'utf8')).results[0].source.path).toContain('run-2')
    const record = acceptanceRecord({ targetId: 'prerelease-main', healthyCycle: 'cycle', index, formalBrowser: { path: '/proof.json', sha256: 'f'.repeat(64) },
      status: { fingerprint: 'fp', generation: 'gen', installed: { buildId: 'b'.repeat(40), image: 'sha256:x' }, operation: { id: 'op' } } })
    expect(Object.keys(record.evidence).sort()).toEqual([...REQUIRED_EVIDENCE].sort())
    expect(record).toMatchObject({ format: 1, channel: 'prerelease', targetId: 'prerelease-main', buildId: 'b'.repeat(40), operationId: 'op', healthyCycle: 'cycle' })
  })
  it('refuses to bundle a result that would leak an account value', () => {
    const root = privateRoot(), output = join(root, 'evidence'); mkdirSync(output, { mode: 0o700 })
    const run = runDirectory(root, 'run', { 'result-handoff-chromium-1.json': { engine: 'chromium', results: [{ case: 'handoff', passed: true, note: 'pre_a_name' }] } })
    expect(() => bundleEvidence({ results: collectResults([run]), output, common: {}, accounts })).toThrow(/would leak/)
  })
})
