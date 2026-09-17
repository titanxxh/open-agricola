import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findDirectSessionLogViolations } from '../check-direct-session-log'

const writeFixture = (root: string, rel: string, content: string): void => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
}

const fixtureRoots: string[] = []
afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const createRepoFixture = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'direct-session-log-'))
  fixtureRoots.push(root)
  writeFixture(root, 'server/index.ts', 'export {}')
  writeFixture(root, 'scripts/index.ts', 'export {}')
  writeFixture(root, 'shared/events/log-cache.ts', [
    'export const prependDerivedLogEntries = (state: any, entries: any[]) => {',
    '  for (let index = entries.length - 1; index >= 0; index -= 1) {',
    '    state.log.unshift(entries[index]!)',
    '  }',
    '}',
  ].join('\n'))
  writeFixture(root, 'shared/events/append.ts', [
    "import { eventsToLogEntries } from './log-mapper'",
    "import { prependDerivedLogEntries } from './log-cache'",
    'export function appendImmediateEvents(state: any, committed: any[]) {',
    '  const entries: LogEntry[] = eventsToLogEntries(committed, {})',
    '  prependDerivedLogEntries(state, entries)',
    '}',
  ].join('\n'))
  writeFixture(root, 'shared/session/session-core.ts', [
    "import { LogStore } from '../engine/index.ts'",
    "import { prependDerivedLogEntries } from '../events/log-cache.ts'",
    'export class GameCore {',
    '  private engineLog: any',
    '  constructor() { this.engineLog = new LogStore() }',
    '  private flushEngineLog() {',
    '    const entries = this.engineLog.all()',
    "    const toAdd = entries.filter((e) => e.key !== 'log.action')",
    '    prependDerivedLogEntries(this.state, toAdd)',
    '  }',
    '}',
  ].join('\n'))
  writeFixture(root, 'shared/engine/engine.ts', [
    "import { eventsToLogEntries } from '../events/log-mapper'",
    'export class Engine {',
    '  flushEventTransaction(context: any = {}) {',
    '    const entries: LogEntry[] = eventsToLogEntries(committed, {})',
    '    for (let index = entries.length - 1; index >= 0; index -= 1) {',
    '      this.log.append(entries[index]!)',
    '    }',
    '  }',
    '}',
  ].join('\n'))
  writeFixture(root, 'shared/engine/engine-proceed.ts', [
    "import { eventsToLogEntries } from '../events/log-mapper'",
    'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
    '  const entries: LogEntry[] = eventsToLogEntries(committed, {})',
    '  for (let index = entries.length - 1; index >= 0; index -= 1) {',
    '    int.log.append(entries[index]!)',
    '  }',
    '}',
  ].join('\n'))
  writeFixture(root, 'shared/engine/engine-resolve.ts', [
    "import { eventsToLogEntries } from '../events/log-mapper'",
    'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
    '  const entries: LogEntry[] = eventsToLogEntries(committed, {})',
    '  for (let index = entries.length - 1; index >= 0; index -= 1) {',
    '    int.log.append(entries[index]!)',
    '  }',
    '}',
  ].join('\n'))

  return root
}

describe('check-direct-session-log', () => {
  it.each(['ts', 'tsx', 'mts', 'mtsx', 'cts', 'ctsx', 'js', 'jsx', 'mjs', 'mjsx', 'cjs', 'cjsx'])(
    'rejects direct writes in .%s sources', (extension) => {
      const root = createRepoFixture()
      writeFixture(root, `server/bad.${extension}`, 'state.log.push(entry)')
      expect(findDirectSessionLogViolations(root)).toEqual([
        expect.objectContaining({ file: `server/bad.${extension}`, line: 1, kind: 'state-log-write' }),
      ])
    },
  )

  it.each(['jsx', 'tsx', 'mjsx', 'mtsx', 'cjsx', 'ctsx'])('parses .%s JSX and visits embedded writes', (extension) => {
    const root = createRepoFixture()
    writeFixture(root, `server/view.${extension}`, 'export const view = <div>{state.log.length}</div>')
    expect(findDirectSessionLogViolations(root)).toEqual([])
    writeFixture(root, `server/view.${extension}`, 'export const view = <div>{state.log.push(entry)}</div>')
    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: `server/view.${extension}`, kind: 'state-log-write' }),
    ])
  })

  it.each(['shared', 'server', 'scripts'])('rejects missing or empty required root %s', (directory) => {
    const root = createRepoFixture()
    rmSync(path.join(root, directory), { recursive: true })
    expect(() => findDirectSessionLogViolations(root)).toThrow()
    mkdirSync(path.join(root, directory))
    writeFixture(root, `${directory}/README.md`, 'No sources')
    expect(() => findDirectSessionLogViolations(root)).toThrow(`empty required source root: ${directory}`)
  })

  it.each(['server/broken.ts', 'server/broken.mjs', 'scripts/check-direct-session-log.ts'])(
    'rejects unparseable source even in excluded files: %s', (file) => {
      const root = createRepoFixture()
      writeFixture(root, file, 'export function bad( {')
      expect(() => findDirectSessionLogViolations(root)).toThrow(file)
    },
  )

  it.each(['file', 'directory', 'root'])('rejects source %s symlinks', (kind) => {
    const root = createRepoFixture()
    if (kind === 'root') {
      renameSync(path.join(root, 'server'), path.join(root, 'server-target'))
      symlinkSync(path.join(root, 'server-target'), path.join(root, 'server'))
    } else {
      symlinkSync(path.join(root, kind === 'file' ? 'server/index.ts' : 'server'), path.join(root, 'shared/linked'))
    }
    expect(() => findDirectSessionLogViolations(root)).toThrow('source symlink')
  })

  it.each([
    ['shared/session/session-core.ts', 'constructor', 'this.engineLog = new LogStore()'],
    ['shared/session/session-core.ts', 'flushEngineLog', 'prependDerivedLogEntries(this.state, toAdd)'],
    ['shared/events/log-cache.ts', 'prependDerivedLogEntries', 'state.log.unshift(entries[index]!)'],
    ['shared/events/append.ts', 'appendImmediateEvents', 'prependDerivedLogEntries(state, entries)'],
    ['shared/engine/engine.ts', 'flushEventTransaction', 'this.log.append(entries[index]!)'],
    ['shared/engine/engine-proceed.ts', 'appendDerivedLogsForEventOnlyResult', 'int.log.append(entries[index]!)'],
    ['shared/engine/engine-resolve.ts', 'appendDerivedLogsForEventOnlyResult', 'int.log.append(entries[index]!)'],
  ])('rejects stale exemption %s:%s', (file, functionName, operation) => {
    const root = createRepoFixture()
    const full = path.join(root, file)
    const original = readFileSync(full, 'utf8')
    for (const replacement of [original.replace(operation, ''), original.replace(functionName, 'renamed')]) {
      writeFileSync(full, replacement)
      expect(findDirectSessionLogViolations(root)).toContainEqual(expect.objectContaining({
        file, kind: 'stale-exemption', text: expect.stringContaining(`${functionName}: no matching`),
      }))
    }
    rmSync(full)
    expect(findDirectSessionLogViolations(root)).toContainEqual(expect.objectContaining({
      file, kind: 'stale-exemption', text: expect.stringContaining(`${functionName}: no matching`),
    }))
  })

  it('does not count an illegal append as a used exemption', () => {
    const root = createRepoFixture()
    const file = 'shared/engine/engine-proceed.ts'
    writeFixture(root, file, 'const appendDerivedLogsForEventOnlyResult = (int: any) => { int.log.append(entry) }')
    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file, kind: 'log-store-append' }),
      expect.objectContaining({ file, kind: 'stale-exemption' }),
    ])
  })

  it('rejects sibling constructors in the session module', () => {
    const root = createRepoFixture()
    const file = 'shared/session/session-core.ts'
    writeFixture(root, file, `${readFileSync(path.join(root, file), 'utf8')}\nconst other = new LogStore()`)
    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file, kind: 'log-store-constructor' }),
    ])
  })

  it.each(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'])('preserves general .test.%s exemptions', (extension) => {
    const root = createRepoFixture()
    writeFixture(root, `server/cache.test.${extension}`, [
      "import { prependDerivedLogEntries } from '../shared/events/log-cache'",
      'const log = new LogStore()',
      'prependDerivedLogEntries(state, entries)',
    ].join('\n'))
    expect(findDirectSessionLogViolations(root)).toEqual([])
  })

  it('reports forbidden runtime state.log mutation with file and line', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/cards/A/A001_Bad.ts', [
      'export function bad(state: any) {',
      "  state.log.unshift({ key: 'log.bad' })",
      '  state.log[0] = { key: "log.badIndex" }',
      '  state.log.length = 0',
      '  state.log.pop()',
      '  state.log.reverse()',
      '}',
    ].join('\n'))
    writeFixture(root, 'shared/session/bad.ts', [
      'export class Bad {',
      '  state: any',
      '  bad() {',
      "    this.state.log.push({ key: 'log.bad' })",
      '  }',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/bad.ts', [
      'export function bad(session: any, gameState: any, ctx: GameState, raw: GameState, restored: GameState, entries: any[]) {',
      '  session.state.log = entries',
      '  gameState.log.push({ key: "log.badAlias" })',
      '  ctx.log.reverse()',
      '  raw.log.push({ key: "log.badRaw" })',
      '  restored.log.push({ key: "log.badRestored" })',
      '  state["log"].push({ key: "log.badBracket" })',
      '  ;(state.log).push({ key: "log.badParen" })',
      '  state.log?.push({ key: "log.badOptional" })',
      '  state.log[0] += entries[0]',
      '  delete state.log[0]',
      '  state.log ||= []',
      '  state.log[0]!.key = "log.changed"',
      '  state.log[0]!.args.count++',
      '  Object.assign(state.log, { 0: entries[0], length: 1 })',
      '  ;(state as GameState).log.push(entries[0])',
      '  state!.log.push(entries[0])',
      '  const log = state.log',
      '  log.unshift(entries[0])',
      '  const { log: stateLog } = state',
      '  stateLog.push(entries[0])',
      '  const { players, log: laterLog } = state',
      '  laterLog.unshift(entries[0])',
      '  Object.assign(state, { log: entries })',
      '  state.log.at(0)!.key = "log.changedAgain"',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/cards/A/A001_Bad.ts',
        line: 2,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'shared/cards/A/A001_Bad.ts',
        line: 3,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'shared/cards/A/A001_Bad.ts',
        line: 4,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'shared/cards/A/A001_Bad.ts',
        line: 5,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'shared/cards/A/A001_Bad.ts',
        line: 6,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 4,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 2,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 3,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 4,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 5,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 6,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 7,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 8,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 9,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 10,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 11,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 12,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 13,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 14,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 15,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 16,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 17,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 19,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 21,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 23,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 24,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 25,
        kind: 'state-log-write',
      }),
    ]))
  })

  it('allows mapper-derived cache writer and engine append sites', () => {
    const root = createRepoFixture()

    expect(findDirectSessionLogViolations(root)).toEqual([])
  })

  it('allows appending from nearest mapper output in allowed functions', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, first: any[], second: any[]) => {',
      '  const earlier = eventsToLogEntries(first, {})',
      '  const entries = eventsToLogEntries(second, {})',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([])
  })

  it('rejects sibling state.log writers in log-cache module', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/events/log-cache.ts', [
      'export const prependDerivedLogEntries = (state: any, entries: any[]) => {',
      '  state.log.unshift(entries[0])',
      '}',
      'export const bad = (state: any, entry: any) => {',
      '  state.log.unshift(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/events/log-cache.ts',
        line: 5,
        kind: 'state-log-write',
      }),
    ]))
  })

  it('reports state.log mutation on variables inferred from state normalizers', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/session/bad-restore.ts', [
      'export function bad(rawWithoutCursor: unknown, raw: any) {',
      '  const restored = rebuildActiveModifiers(normalizeState(rawWithoutCursor as unknown as GameState))',
      '  restored.log.push({ key: "log.badRestored" })',
      '  const rawState = normalizeState(raw as GameState)',
      '  rawState.log[0]!.args.bad = 1',
      '  const created = createInitialState()',
      '  created.log ||= []',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/session/bad-restore.ts',
        line: 3,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'shared/session/bad-restore.ts',
        line: 5,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'shared/session/bad-restore.ts',
        line: 7,
        kind: 'state-log-write',
      }),
    ]))
  })

  it('rejects engine log append without local mapper derivation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      'export const bad = (int: any, entry: any) => {',
      '  int.log.append(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 2,
        kind: 'log-store-append',
      }),
    ]))
  })

  it('rejects direct and aliased LogStore append calls', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/session/bad.ts', [
      'export class Bad {',
      '  private engineLog: any',
      '  bad(int: any, entry: any) {',
      '    this.engineLog.append(entry)',
      '    const log = int.log',
      '    log.append(entry)',
      '    let sink',
      '    sink = int.log',
      '    sink.append(entry)',
      '    int.log?.append(entry)',
      '    int["log"].append(entry)',
      '    const params = { log: new URLSearchParams() }',
      '    params.log.append("room", "dev2")',
      '  }',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 4,
        kind: 'log-store-append',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 6,
        kind: 'log-store-append',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 9,
        kind: 'log-store-append',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 10,
        kind: 'log-store-append',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 11,
        kind: 'log-store-append',
      }),
    ]))
  })

  it('rejects destructured LogStore append aliases', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/session/bad-destructure.ts', [
      'export function bad(int: any, entry: any) {',
      '  const { log: sink } = int',
      '  sink.append(entry)',
      '  let reassigned',
      '  ;({ log: reassigned } = int)',
      '  reassigned.append(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/session/bad-destructure.ts',
        line: 3,
        kind: 'log-store-append',
      }),
      expect.objectContaining({
        file: 'shared/session/bad-destructure.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ]))
  })

  it('reports state.log aliases created by assignment and computed destructuring', () => {
    const root = createRepoFixture()
    writeFixture(root, 'server/bad-alias.ts', [
      'export function bad(state: any, entry: any) {',
      '  let log: any[] = []',
      '  log = state.log',
      '  log.push(entry)',
      '  let assigned: any[] = []',
      '  ;({ log: assigned } = state)',
      '  assigned.push(entry)',
      "  const { ['log']: computed } = state",
      '  computed.push(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'server/bad-alias.ts',
        line: 4,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad-alias.ts',
        line: 7,
        kind: 'state-log-write',
      }),
      expect.objectContaining({
        file: 'server/bad-alias.ts',
        line: 9,
        kind: 'state-log-write',
      }),
    ]))
  })

  it('rejects obsolete completion-query log constructors and direct appends', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine.ts', [
      'export class Engine {',
      '  canComplete() {',
      '    const log = new LogStore()',
      '    this.log.append(entry)',
      '  }',
      '  other() { return new LogStore() }',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ line: 3, kind: 'log-store-constructor' }),
      expect.objectContaining({ line: 4, kind: 'log-store-append' }),
      expect.objectContaining({ line: 6, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'shared/engine/engine.ts', kind: 'stale-exemption' }),
    ])
  })

  it('rejects forbidden LogStore constructors outside session core', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/session/bad.ts', [
      "import { LogStore } from '../engine'",
      "import * as Engine from '../engine'",
      'export function bad() {',
      '  const Store = Engine.LogStore',
      '  const { LogStore: OtherStore } = Engine',
      '  let AssignedStore: any',
      '  ;({ LogStore: AssignedStore } = Engine)',
      '  new (LogStore)()',
      '  new Store()',
      '  new OtherStore()',
      '  new AssignedStore()',
      '  return new Engine.LogStore()',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 8,
        kind: 'log-store-constructor',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 9,
        kind: 'log-store-constructor',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 10,
        kind: 'log-store-constructor',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 11,
        kind: 'log-store-constructor',
      }),
      expect.objectContaining({
        file: 'shared/session/bad.ts',
        line: 12,
        kind: 'log-store-constructor',
      }),
    ]))
  })

  it('rejects sibling bad append even when the file has an allowed append function', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  int.log.append(entries[0]!)',
      '}',
      'const bad = (int: any, entry: any) => {',
      '  int.log.append(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 7,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects bad append after same-name call expression', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'appendDerivedLogsForEventOnlyResult(int, committed)',
      '{',
      '  int.log.append(entry)',
      '}',
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 4,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append when argument is not mapper output', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[], entry: any) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  int.log.append(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 4,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append when mapper entry is mixed with fallback', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[], entry: any) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  int.log.append(entries[0] ?? entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 4,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after mapper entry alias mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  const entry = entries[0]!',
      '  entry.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after typed mapper entry alias mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  const entry: LogEntry = entries[0]!',
      '  entry.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after destructured mapper entry alias mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  const [entry] = entries',
      '  entry.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after nested mapper entry mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  entries[0]!.args.bad = 1',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after Object.assign mapper entry mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  Object.assign(entries[0]!, { key: "log.bad" })',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after call-chain mapper entry mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  entries.at(0)!.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after mapper output mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[], entry: any) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  entries[0] = entry',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after mapper output alias mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[], entry: any) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  const alias = entries',
      '  alias[0] = entry',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after mapper entry mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  entries[0]!.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects arbitrary derived log cache writer callsites', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/cards/A/A001_Bad.ts', [
      "import { prependDerivedLogEntries } from '../../../events/log-cache'",
      'export function bad(state: any, entries: any[]) {',
      '  prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/bad.ts', [
      "import { prependDerivedLogEntries as writeLogs } from '../shared/events/log-cache'",
      'export function bad(state: any, entries: any[]) {',
      '  writeLogs(state, entries)',
      '  let writer',
      '  writer = writeLogs',
      '  writer(state, entries)',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/bad-namespace.ts', [
      "import * as logCache from '../shared/events/log-cache'",
      'export function bad(state: any, entries: any[]) {',
      '  logCache["prependDerivedLogEntries"](state, entries)',
      '  const writeLogs = logCache.prependDerivedLogEntries',
      '  writeLogs(state, entries)',
      '  const { prependDerivedLogEntries: destructuredWrite } = logCache',
      '  destructuredWrite(state, entries)',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/bad-barrel.ts', [
      "import { prependDerivedLogEntries } from '../shared/events'",
      'export function bad(state: any, entries: any[]) {',
      '  prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/cards/A/A001_Bad.ts',
        line: 3,
        kind: 'log-cache-writer-call',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 3,
        kind: 'log-cache-writer-call',
      }),
      expect.objectContaining({
        file: 'server/bad.ts',
        line: 6,
        kind: 'log-cache-writer-call',
      }),
      expect.objectContaining({
        file: 'server/bad-namespace.ts',
        line: 3,
        kind: 'log-cache-writer-call',
      }),
      expect.objectContaining({
        file: 'server/bad-namespace.ts',
        line: 5,
        kind: 'log-cache-writer-call',
      }),
      expect.objectContaining({
        file: 'server/bad-namespace.ts',
        line: 7,
        kind: 'log-cache-writer-call',
      }),
      expect.objectContaining({
        file: 'server/bad-barrel.ts',
        line: 3,
        kind: 'log-cache-writer-call',
      }),
    ]))
  })

  it('rejects session flush cache writer after derived entries mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/session/session-core.ts', [
      "import { prependDerivedLogEntries } from '../events/log-cache.ts'",
      'export class GameCore {',
      '  private engineLog: any',
      '  state: any',
      '  private flushEngineLog() {',
      '    const entries = this.engineLog.all()',
      "    const toAdd = entries.filter((e) => e.key !== 'log.action')",
      '    toAdd.push({ key: "log.bad" })',
      '    prependDerivedLogEntries(this.state, toAdd)',
      '  }',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/session/session-core.ts',
        line: 9,
        kind: 'log-cache-writer-call',
      }),
    ])
  })

  it('rejects session flush cache writer after nested derived entry mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/session/session-core.ts', [
      "import { prependDerivedLogEntries } from '../events/log-cache.ts'",
      'export class GameCore {',
      '  private engineLog: any',
      '  state: any',
      '  private flushEngineLog() {',
      '    const entries = this.engineLog.all()',
      "    const toAdd = entries.filter((e) => e.key !== 'log.action')",
      '    toAdd[0]!.args.bad = 1',
      '    prependDerivedLogEntries(this.state, toAdd)',
      '  }',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/session/session-core.ts',
        line: 9,
        kind: 'log-cache-writer-call',
      }),
    ])
  })

  it('rejects session flush cache writer after source entries mutation', () => {
    const root = createRepoFixture()
    writeFixture(root, 'shared/session/session-core.ts', [
      "import { prependDerivedLogEntries } from '../events/log-cache.ts'",
      'export class GameCore {',
      '  private engineLog: any',
      '  state: any',
      '  private flushEngineLog() {',
      '    const entries = this.engineLog.all()',
      "    const toAdd = entries.filter((e) => e.key !== 'log.action')",
      '    Object.assign(entries[0]!, { key: "log.bad" })',
      '    prependDerivedLogEntries(this.state, toAdd)',
      '  }',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root).filter(v => v.kind !== 'stale-exemption')

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/session/session-core.ts',
        line: 9,
        kind: 'log-cache-writer-call',
      }),
    ])
  })

  it('does not report its own script or fixture strings during repo scan', () => {
    const root = createRepoFixture()
    writeFixture(root, 'scripts/check-direct-session-log.ts', [
      "const sample = 'state.log.unshift('",
      "const append = '.log.append('",
    ].join('\n'))
    writeFixture(root, 'scripts/__tests__/check-direct-session-log.test.ts', [
      "const fixture = 'this.state.log.unshift('",
      "const append = 'int.log.append(entry)'",
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([])
  })

  it('does not report strings, local declarations, unrelated append calls, or shadowed aliases', () => {
    const root = createRepoFixture()
    writeFixture(root, 'server/misc-events.ts', [
      "import { prependDerivedLogEntries } from '../shared/misc/events'",
      'export function unrelated(state: any, entries: any[]) {',
      '  prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/false-positive.ts', [
      'const sample = "state.log.push("',
      'export function prependDerivedLogEntries(state: any, entries: any[]) {',
      '  return [state, entries]',
      '}',
      'export function search(params: URLSearchParams) {',
      '  params.append("room", "dev2")',
      '  const req = { log: new URLSearchParams() }',
      '  req.log.append("room", "dev2")',
      '}',
      'export function unrelatedContext(context: { log: string[] }) {',
      '  context.log.push("ok")',
      '}',
      'export function stateAlias(state: GameState) {',
      '  const log = state.log',
      '}',
      'export function unrelated(log: string[]) {',
      '  log.push("ok")',
      '}',
      'export function typedCtx(ctx: GameState) {',
      '  return ctx.players.length',
      '}',
      'export function unrelatedCtx(ctx: { log: string[] }) {',
      '  ctx.log.push("ok")',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([])
  })
})
