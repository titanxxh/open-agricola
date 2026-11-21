import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { historicalStableSnapshot, LEGACY_STABLE_CUTOFF, parseGitHubJsonLines } from '../ci/candidate-admission'
import { createLegacyStableOrigin, legacyStableHistory } from './_helpers/legacy-stable-history'

const temporary: string[] = []
let historyRoot = '', historyOrigin = ''
beforeAll(() => {
  historyRoot = mkdtempSync(join(tmpdir(), 'candidate-public-history-'))
  historyOrigin = createLegacyStableOrigin(join(historyRoot, 'origin.git'))
  expect(legacyStableHistory.cutoff).toBe(LEGACY_STABLE_CUTOFF)
})
afterAll(() => { if (historyRoot) rmSync(historyRoot, { recursive: true, force: true }) })
afterEach(() => { for (const cwd of temporary.splice(0)) rmSync(cwd, { recursive: true, force: true }) })

it('reads paginated compact JSON lines without requiring modern gh --slurp', () => {
  expect(parseGitHubJsonLines('{"id":1,"name":"first\\nstep"}\n{"id":2}\n')).toEqual([
    { id: 1, name: 'first\nstep' }, { id: 2 },
  ])
})

describe('historical stable Git ancestry', () => {
  const { older, newer } = legacyStableHistory
  function shallow(...commits: string[]) {
    const root = mkdtempSync(join(tmpdir(), 'candidate-history-'))
    temporary.push(root)
    const origin = historyOrigin, cwd = join(root, 'checkout')
    execFileSync('git', ['init', '-b', 'main', cwd], { stdio: 'ignore' })
    const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    git('config', `url.file://${origin}.insteadOf`, 'https://github.com/titanxxh/open-agricola.git')
    for (const commit of commits) git('fetch', '--no-tags', '--depth=1', `file://${origin}`, commit)
    expect(git('rev-parse', '--is-shallow-repository')).toBe('true')
    return { cwd, git }
  }
  it('fetches the missing fixed cutoff before accepting that exact historical source', () => {
    const value = shallow(older)
    expect(spawnSync('git', ['cat-file', '-e', LEGACY_STABLE_CUTOFF], { cwd: value.cwd, stdio: 'ignore' }).status).not.toBe(0)
    expect(historicalStableSnapshot(value.cwd, LEGACY_STABLE_CUTOFF)).toBe(true)
  }, 30_000)
  it('fills cutoff ancestry when both cutoff and older source are shallow boundaries', () => {
    const value = shallow(LEGACY_STABLE_CUTOFF, older)
    expect(spawnSync('git', ['merge-base', '--is-ancestor', older, LEGACY_STABLE_CUTOFF], { cwd: value.cwd, stdio: 'ignore' }).status).toBe(1)
    expect(historicalStableSnapshot(value.cwd, older)).toBe(true)
  }, 30_000)
  it('keeps a newer source outside the fixed historical range', () => {
    const value = shallow(LEGACY_STABLE_CUTOFF, newer)
    expect(historicalStableSnapshot(value.cwd, newer)).toBe(false)
  }, 30_000)
  it('reports a broken Git graph instead of silently classifying a historical source', () => {
    const value = shallow(LEGACY_STABLE_CUTOFF)
    writeFileSync(join(value.cwd, '.git/shallow'), 'invalid shallow boundary\n')
    expect(() => historicalStableSnapshot(value.cwd, LEGACY_STABLE_CUTOFF)).toThrow()
  })
})
