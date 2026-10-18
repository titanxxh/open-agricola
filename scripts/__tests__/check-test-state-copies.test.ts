import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findTestStateCopyViolations } from '../check-test-state-copies'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const exemptFiles = [
  'shared/session/__tests__/state-clone.test.ts',
  'shared/session/__tests__/state-normalize-stats.test.ts',
  'shared/session/__tests__/fence-segments-normalize.test.ts',
  'shared/session/__tests__/starting-food.test.ts',
  'shared/session/__tests__/event-state.test.ts',
  'server/__tests__/state-clone-preview-session.test.ts',
  'server/__tests__/player-count-action-spaces.test.ts',
]

const write = (root: string, file: string, content: string): void => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), content)
}

/** A repository where every exemption is still used, plus the given test files. */
const repository = (files: Record<string, string>): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'test-state-copies-'))
  roots.push(root)
  for (const directory of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests']) write(root, `${directory}/index.ts`, 'export {}\n')
  for (const file of exemptFiles) write(root, file, "import { normalizeState } from '../state-bootstrap'\nnormalizeState(raw)\n")
  for (const [file, content] of Object.entries(files)) write(root, file, content)
  return root
}

describe('check-test-state-copies', () => {
  it('reports a normalizing copy of an observed response', () => {
    const root = repository({
      'server/__tests__/observed.test.ts': [
        "import { cloneState as copy } from '../../shared/session/state-bootstrap'",
        'const snapshot = (response: any) => ({ ...response, state: copy(response.state) })',
      ].join('\n'),
      'shared/__tests__/namespace.test.ts': [
        "import * as bootstrap from '../session/state-bootstrap'",
        'const copies = states.map(bootstrap.cloneStateWithHistory)',
        'const { cloneState, normalizeState: normalize } = bootstrap',
        'const copy = cloneState(response.state)',
        'const repaired = normalize(raw)',
      ].join('\n'),
    })

    expect(findTestStateCopyViolations(root).map(({ file, line, kind }) => ({ file, line, kind }))).toEqual([
      { file: 'shared/__tests__/namespace.test.ts', line: 2, kind: 'normalizing-copy' },
      { file: 'shared/__tests__/namespace.test.ts', line: 4, kind: 'normalizing-copy' },
      { file: 'shared/__tests__/namespace.test.ts', line: 5, kind: 'normalizing-copy' },
      { file: 'server/__tests__/observed.test.ts', line: 2, kind: 'normalizing-copy' },
    ])
  })

  it('accepts pure copies, GameSession restore input and non-test code', () => {
    const root = repository({
      'server/__tests__/pure.test.ts': [
        "import { captureStateWithHistory } from '../../shared/session/history-streams'",
        "import { cloneState } from '../../shared/session/state-bootstrap'",
        'const snapshot = (response: any) => ({ ...response, state: captureStateWithHistory(response.state) })',
        'const restored = new GameSession({ state: cloneState(session.state), sessionCursor })',
        'const other = { cloneState: true }',
      ].join('\n'),
      'server/game/copy.ts': "import { cloneState } from '../../shared/session/state-bootstrap'\nexport const copy = cloneState\n",
    })

    expect(findTestStateCopyViolations(root)).toEqual([])
  })

  it('reports a restore-shaped call outside the GameSession state option', () => {
    const root = repository({
      'server/__tests__/restore.test.ts': [
        "import { cloneState } from '../../shared/session/state-bootstrap'",
        'const restored = new GameSession({ seed: cloneState(session.state) })',
        'const loaded = load({ state: cloneState(session.state) })',
      ].join('\n'),
    })

    expect(findTestStateCopyViolations(root).map(({ line, kind }) => ({ line, kind }))).toEqual([
      { line: 2, kind: 'normalizing-copy' },
      { line: 3, kind: 'normalizing-copy' },
    ])
  })

  it('reports an exemption that no longer uses a normalizing helper', () => {
    const root = repository({ 'shared/session/__tests__/state-clone.test.ts': 'export {}\n' })

    expect(findTestStateCopyViolations(root)).toEqual([
      expect.objectContaining({ file: 'shared/session/__tests__/state-clone.test.ts', kind: 'stale-exemption' }),
    ])
  })
})
