import { expect, it } from 'vitest'
import path from 'node:path'
import ts from 'typescript'
import { normalizingSnapshotViolations } from '../test-snapshot-policy.mjs'

const inspect = (source: string) => inspectProgram(source)

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
const session = new GameSession(42)
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

const inspectProgram = (source: string, helpers: Record<string, string> = {}) => {
  const root = path.resolve('/snapshot-policy-fixture')
  const filename = path.join(root, 'server/__tests__/observation.test.ts')
  const files = new Map(Object.entries({
    'shared/session/state-bootstrap.ts': ['cloneState', 'cloneStateWithHistory', 'normalizeState', 'createInitialState'].map(name => `export const ${name} = <T>(state: T): T => state`).join(';'),
    'shared/session/session-core.ts': 'export class GameCore { constructor(..._args: unknown[]) {} loadState(state: unknown) { return state } }',
    'server/game/authoritative-session.ts': "import { GameCore } from '../../shared/session/session-core'; export class GameSession extends GameCore {}",
    'server/__tests__/_helpers/normalization-subject.ts': 'export function normalizationSubject<A extends unknown[], R>(subject: (...args: A) => R, ...args: A): R { return subject(...args) }',
    ...helpers,
    'server/__tests__/observation.test.ts': source,
  }).map(([file, text]) => [path.join(root, file), text]))
  const options = { target: ts.ScriptTarget.ES2023, lib: ['lib.es2023.d.ts'], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler }
  const host = ts.createCompilerHost(options, true)
  const originalGet = host.getSourceFile.bind(host)
  const originalRead = host.readFile.bind(host)
  const originalExists = host.fileExists.bind(host)
  const originalDirectory = host.directoryExists?.bind(host)
  host.getCurrentDirectory = () => root
  host.directoryExists = directory => [...files.keys()].some(file => file.startsWith(path.resolve(directory) + path.sep)) || originalDirectory?.(directory) === true
  host.realpath = file => path.resolve(file)
  host.fileExists = file => files.has(path.resolve(file)) || originalExists(file)
  host.readFile = file => files.get(path.resolve(file)) ?? originalRead(file)
  host.getSourceFile = (file, language, ...rest) => {
    const text = files.get(path.resolve(file))
    return text === undefined ? originalGet(file, language, ...rest) : ts.createSourceFile(file, text, language, true)
  }
  const program = ts.createProgram([...files.keys()], options, host)
  return normalizingSnapshotViolations(source, filename, program)
}

it('rejects an unrelated loadState while allowing an actual Session instance restore', () => {
  const source = `import { cloneState } from '../../shared/session/state-bootstrap'
import { GameSession as Session } from '../game/authoritative-session'
const session = new Session()
session.loadState(cloneState({ value: 1 }))
const recorder = { loadState(value: unknown) { return value } }
recorder.loadState(cloneState({ value: 2 }))
`
  expect(inspectProgram(source).map(issue => issue.helper)).toEqual(['cloneState'])
})

it('traces a normalizing observation through a transitive helper re-export', () => {
  const source = `import { copy } from './_helpers/barrel'
const observation = copy({ value: 1 })
`
  const helpers = {
    'server/__tests__/_helpers/barrel.ts': "export { copied as copy } from './normalizer'",
    'server/__tests__/_helpers/normalizer.ts': "export { cloneState as copied } from '../../../shared/session/state-bootstrap'",
  }
  expect(inspectProgram(source, helpers).map(issue => issue.helper)).toEqual(['cloneState'])
})

it('allows an explicit normalization subject but rejects a normalizing observation in its arguments', () => {
  const imports = `import { cloneState, normalizeState } from '../../shared/session/state-bootstrap'
import { normalizationSubject as subject } from './_helpers/normalization-subject'
`
  expect(inspectProgram(imports + 'const restored = subject(normalizeState, { value: 1 })')).toEqual([])
  expect(inspectProgram(imports + 'const restored = subject(normalizeState, cloneState({ value: 1 }))').map(issue => issue.helper)).toEqual(['cloneState'])
})

it('does not grant restore or subject exemptions to unknown receivers or shadowed functions', () => {
  const source = `import { cloneState, normalizeState } from '../../shared/session/state-bootstrap'
import { GameSession } from '../game/authoritative-session'
declare const recorder: any
recorder.loadState(cloneState({ value: 1 }))
function observation(normalizationSubject: (fn: typeof normalizeState, value: object) => object) {
  return normalizationSubject(normalizeState, { value: 2 })
}
class Recorder extends GameSession { loadState(state: unknown) { return state } }
new Recorder().loadState(cloneState({ value: 3 }))
`
  expect(inspectProgram(source).map(issue => issue.helper)).toEqual(['cloneState', 'normalizeState', 'cloneState'])
})

it('rejects a normalizing namespace obtained through a dynamic import', () => {
  const source = `async function observe(r: { state: { value: number } }) {
  const { cloneState: copy } = await import('../../shared/session/state-bootstrap')
  return { ...r, state: copy(r.state) }
}`
  expect(inspectProgram(source).map(issue => issue.helper)).toEqual(['state-bootstrap namespace'])
  expect(inspectProgram("async function fixture() { return (await import('../../shared/session/state-bootstrap')).createInitialState({ value: 1 }) }")).toEqual([])
})
