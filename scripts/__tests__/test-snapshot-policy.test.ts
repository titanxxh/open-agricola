import { expect, it } from 'vitest'
import { normalizingSnapshotViolations } from '../test-snapshot-policy.mjs'

const inspect = (source: string) => normalizingSnapshotViolations(source, 'server/__tests__/observation.test.ts')

it('rejects the historical response-copy mistake and an aliased function value', () => {
  const source = `import { cloneState as copy } from '../../shared/session/state-bootstrap'
function ok(r) { return { ...r, state: copy(r.state), interaction: structuredClone(r.interaction) } }
const anotherCopy = copy
`
  expect(inspect(source).map(issue => issue.helper)).toEqual(['cloneState', 'cloneState'])
  expect(inspect(source)[0].message).toContain('use captureStateWithHistory')
})

it.each(['cloneState', 'cloneStateWithHistory', 'normalizeState'])(
  'rejects namespace observations through %s', helper => {
    const source = `import * as bootstrap from '../../shared/session/state-bootstrap.ts'
const snapshot = bootstrap.${helper}(response.state)
const another = bootstrap['${helper}'](response.state)
`
    expect(inspect(source).map(issue => issue.helper)).toEqual([helper, helper])
  },
)

it('allows normalization at explicit restore operations', () => {
  const source = `import { cloneState } from '../../shared/session/state-bootstrap'
import { GameSession } from '../game/authoritative-session'
const restored = new GameSession({ state: cloneState(pending.state), sessionCursor: cursor })
session.loadState(cloneState(state))
`
  expect(inspect(source)).toEqual([])
})

it('rejects a snapshot hidden in a restore callback', () => {
  const source = `import { cloneState } from '../../shared/session/state-bootstrap'
import { GameSession } from '../game/authoritative-session'
new GameSession({ configure: () => cloneState(response.state) })
`
  expect(inspect(source).map(issue => issue.helper)).toEqual(['cloneState'])
})

it('allows pure observations and distinguishes a shadowed local function', () => {
  const source = `import { cloneState } from '../../shared/session/state-bootstrap'
import { captureStateWithHistory } from '../../shared/session/history-streams'
const snapshot = captureStateWithHistory(response.state)
function own(cloneState) { return cloneState(response.state) }
`
  expect(inspect(source)).toEqual([])
})

it('rejects escaping namespace and shorthand function values', () => {
  const namespace = `import * as bootstrap from '../../shared/session/state-bootstrap'
const { cloneState: copy } = bootstrap
const observed = copy(response.state)
const helperName = 'cloneState'
const indexedCopy = bootstrap[helperName]
`
  expect(inspect(namespace).map(issue => issue.helper)).toEqual(['state-bootstrap namespace', 'state-bootstrap namespace'])
  const shorthand = `import { cloneState } from '../../shared/session/state-bootstrap'
const functions = { cloneState }
const observed = functions.cloneState(response.state)
`
  expect(inspect(shorthand).map(issue => issue.helper)).toEqual(['cloneState'])
})

it('recognizes an aliased Session constructor without exempting unrelated constructors', () => {
  const source = `import { cloneState } from '../../shared/session/state-bootstrap'
import { GameSession as Session } from '../game/authoritative-session'
new Session({ state: cloneState(pending.state) })
new Unrelated({ state: cloneState(response.state) })
`
  expect(inspect(source).map(issue => issue.helper)).toEqual(['cloneState'])
})
