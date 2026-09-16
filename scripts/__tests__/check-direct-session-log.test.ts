import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findDirectSessionLogViolations,
  findStaleDirectSessionLogExceptions,
} from '../check-direct-session-log'

const SCAN_ROOTS = ['shared', 'server', 'scripts']

const createRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'direct-session-log-'))
  for (const dir of SCAN_ROOTS) mkdirSync(path.join(root, dir))
  return root
}

const writeFixture = (root: string, rel: string, content: string): void => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
}

describe('check-direct-session-log', () => {
  it.each(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'])('reports the same forbidden write in .%s sources', (ext) => {
    const root = createRoot()
    writeFixture(root, `shared/cards/A/A001_Bad.${ext}`, [
      'export function bad(state) {',
      "  state.log.push({ key: 'log.bad' })",
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({
        file: `shared/cards/A/A001_Bad.${ext}`,
        line: 2,
        kind: 'state-log-write',
      }),
    ])
  })

  it.each(SCAN_ROOTS)('fails instead of passing when scan root %s is missing', (dir) => {
    const root = createRoot()
    rmSync(path.join(root, dir), { recursive: true })

    expect(() => findDirectSessionLogViolations(root)).toThrow(`missing scan root: ${dir}`)
  })

  it('fails on sources that cannot be parsed', () => {
    const root = createRoot()
    writeFixture(root, 'shared/broken.ts', 'export const =')

    expect(() => findDirectSessionLogViolations(root)).toThrow('shared/broken.ts')
  })

  it('fails on symlinked sources instead of skipping them', () => {
    const root = createRoot()
    symlinkSync(path.join(root, 'elsewhere.ts'), path.join(root, 'shared/linked.ts'))

    expect(() => findDirectSessionLogViolations(root)).toThrow('source symlink')
  })

  it('fails when a scan root is a symlink instead of following it', () => {
    const root = createRoot()
    rmSync(path.join(root, 'server'), { recursive: true })
    mkdirSync(path.join(root, 'elsewhere'))
    symlinkSync(path.join(root, 'elsewhere'), path.join(root, 'server'))

    expect(() => findDirectSessionLogViolations(root)).toThrow('scan root symlink requires explicit ownership: server')
  })

  it.each(['coverage', 'dist', '.build', 'test-results', 'playwright-report'])('scans nested %s directories that git does not ignore', (dir) => {
    const root = createRoot()
    writeFixture(root, `server/${dir}/report.ts`, [
      'export function bad(state) {',
      "  state.log.push({ key: 'log.bad' })",
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({
        file: `server/${dir}/report.ts`,
        line: 2,
        kind: 'state-log-write',
      }),
    ])
  })

  it('tracks require, import-equals and dynamic import bindings like ESM imports', () => {
    const root = createRoot()
    writeFixture(root, 'server/bad.cjs', [
      "const Events = require('../shared/events')",
      "const { prependDerivedLogEntries: writeLogs } = require('../shared/events/log-cache')",
      "const { LogStore: Store } = require('../shared/engine')",
      "const Engine = require('../shared/engine')",
      'function bad(state, entries) {',
      '  Events.prependDerivedLogEntries(state, entries)',
      '  writeLogs(state, entries)',
      '  new Store()',
      '  new Engine.LogStore()',
      '}',
      'module.exports = { bad }',
    ].join('\n'))
    writeFixture(root, 'server/bad.cts', [
      "import Events = require('../shared/events')",
      "import Engine = require('../shared/engine')",
      'export function bad(state: any, entries: any[]) {',
      '  Events.prependDerivedLogEntries(state, entries)',
      '  new Engine.LogStore()',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/bad-dynamic.mts', [
      "const { prependDerivedLogEntries } = await import('../shared/events/log-cache')",
      "const { LogStore: DynamicStore } = await import('../shared/engine')",
      'export function bad(state: any, entries: any[]) {',
      '  prependDerivedLogEntries(state, entries)',
      '  new DynamicStore()',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/bad-nested.cjs', [
      'function bad(state, entries) {',
      "  const Events = require('../shared/events')",
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/bad-dynamic.mts', line: 4, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/bad-dynamic.mts', line: 5, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/bad-nested.cjs', line: 3, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/bad.cjs', line: 6, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/bad.cjs', line: 7, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/bad.cjs', line: 8, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/bad.cjs', line: 9, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/bad.cts', line: 4, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/bad.cts', line: 5, kind: 'log-store-constructor' }),
    ])
  })

  it('tracks member access on require and dynamic import results as named bindings', () => {
    const root = createRoot()
    writeFixture(root, 'server/bad-members.cjs', [
      "const Store = require('../shared/engine').LogStore",
      "const writeLogs = require('../shared/events').prependDerivedLogEntries",
      "const bracketWrite = require('../shared/events/log-cache')['prependDerivedLogEntries']",
      'function bad(state, entries) {',
      '  new Store()',
      '  writeLogs(state, entries)',
      '  bracketWrite(state, entries)',
      '}',
      'module.exports = { bad }',
    ].join('\n'))
    writeFixture(root, 'server/bad-members.mts', [
      "const DynamicStore = (await import('../shared/engine')).LogStore",
      "const dynamicWrite = (await import('../shared/events/log-cache')).prependDerivedLogEntries",
      'let reassigned: any',
      "reassigned = require('../shared/events').prependDerivedLogEntries",
      'export function bad(state: any, entries: any[]) {',
      '  new DynamicStore()',
      '  dynamicWrite(state, entries)',
      '  reassigned(state, entries)',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/bad-members.cjs', line: 5, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/bad-members.cjs', line: 6, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/bad-members.cjs', line: 7, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/bad-members.mts', line: 6, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/bad-members.mts', line: 7, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/bad-members.mts', line: 8, kind: 'log-cache-writer-call' }),
    ])
  })

  it('keeps module bindings lexically scoped so shadowing parameters are not reported', () => {
    const root = createRoot()
    writeFixture(root, 'server/scoped.cjs', [
      'function writer(state, entries) {',
      "  const Events = require('../shared/events')",
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
      'function unrelated(Events, state, entries) {',
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
      "const Engine = require('../shared/engine')",
      'function shadowed(Engine) {',
      '  return new Engine.LogStore()',
      '}',
      'function inherits() {',
      '  return new Engine.LogStore()',
      '}',
      'module.exports = { writer, unrelated, shadowed, inherits }',
    ].join('\n'))
    writeFixture(root, 'server/scoped-esm.ts', [
      "import * as Engine from '../shared/engine'",
      "import { prependDerivedLogEntries } from '../shared/events/log-cache'",
      'export function shadowed(Engine: any, prependDerivedLogEntries: (state: any, entries: any[]) => void, state: any, entries: any[]) {',
      '  prependDerivedLogEntries(state, entries)',
      '  return new Engine.LogStore()',
      '}',
      'export function inherits(state: any, entries: any[]) {',
      '  prependDerivedLogEntries(state, entries)',
      '  return new Engine.LogStore()',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/scoped-esm.ts', line: 8, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/scoped-esm.ts', line: 9, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/scoped.cjs', line: 3, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/scoped.cjs', line: 13, kind: 'log-store-constructor' }),
    ])
  })

  it('resolves module bindings declared after the closures that use them', () => {
    const root = createRoot()
    writeFixture(root, 'server/hoisted.cjs', [
      'function bad(s, e) {',
      '  Events.prependDerivedLogEntries(s, e)',
      '  return new Engine.LogStore()',
      '}',
      'function outer(s, e) {',
      '  const run = () => Later.prependDerivedLogEntries(s, e)',
      "  const Later = require('../shared/events/log-cache')",
      '  return run',
      '}',
      "const Events = require('../shared/events')",
      "const Engine = require('../shared/engine')",
      'module.exports = { bad, outer }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/hoisted.cjs', line: 2, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/hoisted.cjs', line: 3, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/hoisted.cjs', line: 6, kind: 'log-cache-writer-call' }),
    ])
  })

  it('only treats engine modules as LogStore sources', () => {
    const root = createRoot()
    writeFixture(root, 'server/unrelated.cjs', [
      "const Database = require('unrelated-database')",
      "const { LogStore: OtherStore } = require('some-logging-lib')",
      'function ok() {',
      '  return [new Database.LogStore(), new OtherStore()]',
      '}',
      'module.exports = { ok }',
    ].join('\n'))
    writeFixture(root, 'server/unrelated-esm.ts', [
      "import * as Other from '../shared/other'",
      "import { LogStore as LibStore } from 'some-logging-lib'",
      "import * as Engine from '../shared/engine/log-store'",
      'export function mixed() {',
      '  return [new Other.LogStore(), new LibStore(), new Engine.LogStore()]',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/unrelated-esm.ts', line: 5, kind: 'log-store-constructor' }),
    ])
  })

  it('recognises log-cache and engine modules with any supported source suffix', () => {
    const root = createRoot()
    writeFixture(root, 'server/suffixed.mjs', [
      "import { prependDerivedLogEntries } from '../shared/events/log-cache.js'",
      "import * as Events from '../shared/events/index.mjs'",
      'export function bad(state, entries) {',
      '  prependDerivedLogEntries(state, entries)',
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/suffixed.cts', [
      "import Engine = require('../shared/engine/index.cjs')",
      "import Store = require('../shared/engine/log-store.mts')",
      'export function bad() {',
      '  return [new Engine.LogStore(), new Store.LogStore()]',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/suffixed.cts', line: 4, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/suffixed.cts', line: 4, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/suffixed.mjs', line: 4, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/suffixed.mjs', line: 5, kind: 'log-cache-writer-call' }),
    ])
  })

  it('lets later local declarations shadow module bindings inside earlier closures', () => {
    const root = createRoot()
    writeFixture(root, 'server/late-shadow.ts', [
      "import * as Events from '../shared/events'",
      "import { LogStore } from '../shared/engine'",
      'export function ok(state: any, entries: any[], localEvents: any, LocalStore: any) {',
      '  {',
      '    const invoke = () => [Events.prependDerivedLogEntries(state, entries), new LogStore()]',
      '    const Events = localEvents',
      '    class LogStore extends LocalStore {}',
      '    return invoke()',
      '  }',
      '}',
      'export function bad(state: any, entries: any[]) {',
      '  const invoke = () => Events.prependDerivedLogEntries(state, entries)',
      '  return invoke()',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/late-shadow.ts', line: 12, kind: 'log-cache-writer-call' }),
    ])
  })

  it('isolates catch and loop bindings from the enclosing scope', () => {
    const root = createRoot()
    writeFixture(root, 'server/catch-loop.cjs', [
      "const Events = require('../shared/events')",
      "const Engine = require('../shared/engine')",
      'function bad(state, entries, list) {',
      '  try { work() } catch (Events) { consume(Events) }',
      '  for (const Engine of list) consume(Engine)',
      '  Events.prependDerivedLogEntries(state, entries)',
      '  return new Engine.LogStore()',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/catch-loop.cjs', line: 6, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/catch-loop.cjs', line: 7, kind: 'log-store-constructor' }),
    ])
  })

  it('propagates provenance through namespace aliases', () => {
    const root = createRoot()
    writeFixture(root, 'server/namespace-alias.cjs', [
      "const Events = require('../shared/events')",
      'const E = Events',
      "const Engine = require('../shared/engine')",
      'let E2',
      'E2 = Engine',
      'function bad(state, entries) {',
      '  E.prependDerivedLogEntries(state, entries)',
      '  return new E2.LogStore()',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/namespace-alias.cjs', line: 7, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/namespace-alias.cjs', line: 8, kind: 'log-store-constructor' }),
    ])
  })

  it('ignores external packages whose names end like repository modules', () => {
    const root = createRoot()
    writeFixture(root, 'server/vendor.ts', [
      "import { LogStore as ExternalStore } from '@vendor/engine'",
      "import * as VendorEngine from 'vendor-engine/log-store'",
      "import * as VendorEvents from '@vendor/shared/events'",
      "import { prependDerivedLogEntries as vendorWrite } from 'vendor/log-cache'",
      'export function ok(state: any, entries: any[]) {',
      '  vendorWrite(state, entries)',
      '  VendorEvents.prependDerivedLogEntries(state, entries)',
      '  return [new ExternalStore(), new VendorEngine.LogStore()]',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([])
  })

  it('keeps provenance alive across conditional reassignment', () => {
    const root = createRoot()
    writeFixture(root, 'server/conditional.cjs', [
      "let Events = require('../shared/events')",
      "let Store = require('../shared/engine').LogStore",
      'function bad(state, entries, useStub, stub) {',
      '  if (useStub) Events = stub',
      '  Store = useStub ? stub : Store',
      '  Events.prependDerivedLogEntries(state, entries)',
      '  return new Store()',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/conditional.cjs', line: 6, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/conditional.cjs', line: 7, kind: 'log-store-constructor' }),
    ])
  })

  it('hoists aliases derived from module namespaces for earlier closures', () => {
    const root = createRoot()
    writeFixture(root, 'server/hoisted-alias.ts', [
      "import * as Events from '../shared/events'",
      "import * as Engine from '../shared/engine'",
      'export function bad(state: any, entries: any[]) {',
      '  const run = () => [write(state, entries), new Store(), other(state, entries)]',
      '  const write = Events.prependDerivedLogEntries',
      '  const Store = Engine.LogStore',
      '  const { prependDerivedLogEntries: other } = Events',
      '  return run()',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/hoisted-alias.ts', line: 4, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/hoisted-alias.ts', line: 4, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/hoisted-alias.ts', line: 4, kind: 'log-cache-writer-call' }),
    ])
  })

  it('forks a lexical scope for switch case blocks', () => {
    const root = createRoot()
    writeFixture(root, 'server/switch.cjs', [
      "const Events = require('../shared/events')",
      'function bad(state, entries, mode, stub) {',
      '  switch (mode) {',
      '    case 1:',
      '      const Events = stub',
      '      consume(Events)',
      '      break',
      '  }',
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/switch.cjs', line: 9, kind: 'log-cache-writer-call' }),
    ])
  })

  it('ignores a shadowed require binding but follows createRequire', () => {
    const root = createRoot()
    writeFixture(root, 'server/shadowed-require.cjs', [
      'function ok(require, state, entries) {',
      "  const Events = require('../shared/events')",
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
      'module.exports = { ok }',
    ].join('\n'))
    writeFixture(root, 'server/created-require.mjs', [
      "import { createRequire } from 'node:module'",
      'const require = createRequire(import.meta.url)',
      "const Events = require('../shared/events')",
      'export function bad(state, entries) {',
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/created-require.mjs', line: 5, kind: 'log-cache-writer-call' }),
    ])
  })

  it('binds destructuring assignments from module requests', () => {
    const root = createRoot()
    writeFixture(root, 'server/destructure-assign.mts', [
      'let write: any',
      'let Store: any',
      ";({ prependDerivedLogEntries: write } = require('../shared/events'))",
      ";({ LogStore: Store } = await import('../shared/engine'))",
      'export function bad(state: any, entries: any[]) {',
      '  write(state, entries)',
      '  return new Store()',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/destructure-assign.mts', line: 6, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/destructure-assign.mts', line: 7, kind: 'log-store-constructor' }),
    ])
  })

  it('recognises inline module-request receivers without a binding', () => {
    const root = createRoot()
    writeFixture(root, 'server/inline.cjs', [
      'function bad(state, entries) {',
      "  require('../shared/events').prependDerivedLogEntries(state, entries)",
      "  return new (require('../shared/engine').LogStore)()",
      '}',
      'async function badDynamic(state, entries) {',
      "  ;(await import('../shared/events')).prependDerivedLogEntries(state, entries)",
      "  return new ((await import('../shared/engine')).LogStore)()",
      '}',
      'module.exports = { bad, badDynamic }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/inline.cjs', line: 2, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/inline.cjs', line: 3, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/inline.cjs', line: 6, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/inline.cjs', line: 7, kind: 'log-store-constructor' }),
    ])
  })

  it('hoists var provenance to the enclosing function scope', () => {
    const root = createRoot()
    writeFixture(root, 'server/var-hoist.cjs', [
      'function bad(state, entries, enabled) {',
      '  if (enabled) {',
      "    var Events = require('../shared/events')",
      "    for (;;) { var { LogStore: Store } = require('../shared/engine'); break }",
      '  }',
      '  Events.prependDerivedLogEntries(state, entries)',
      '  return new Store()',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/var-hoist.cjs', line: 6, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/var-hoist.cjs', line: 7, kind: 'log-store-constructor' }),
    ])
  })

  it('classifies relative imports by their resolved repository path', () => {
    const root = createRoot()
    writeFixture(root, 'server/vendor-relative.ts', [
      "import * as VendorEngine from './vendor/engine'",
      "import { LogStore as VendorStore } from '../server/vendor/engine/log-store'",
      "import { prependDerivedLogEntries as vendorWrite } from './vendor/log-cache'",
      "import * as VendorEvents from './vendor/shared/events'",
      "import * as RealEngine from '../shared/engine'",
      'export function mixed(state: any, entries: any[]) {',
      '  vendorWrite(state, entries)',
      '  VendorEvents.prependDerivedLogEntries(state, entries)',
      '  return [new VendorEngine.LogStore(), new VendorStore(), new RealEngine.LogStore()]',
      '}',
    ].join('\n'))
    writeFixture(root, 'shared/cards/A/A002_Deep.ts', [
      "import { prependDerivedLogEntries } from '../../events/log-cache'",
      "import * as Engine from '../../engine/index.ts'",
      'export function bad(state: any, entries: any[]) {',
      '  prependDerivedLogEntries(state, entries)',
      '  return new Engine.LogStore()',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'shared/cards/A/A002_Deep.ts', line: 4, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'shared/cards/A/A002_Deep.ts', line: 5, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/vendor-relative.ts', line: 9, kind: 'log-store-constructor' }),
    ])
  })

  it('isolates TypeScript namespace blocks from the file scope', () => {
    const root = createRoot()
    writeFixture(root, 'server/namespace-block.ts', [
      "import * as Events from '../shared/events'",
      'namespace Local {',
      '  const Events = { prependDerivedLogEntries: (..._args: unknown[]) => undefined }',
      '  export const run = (state: any, entries: any[]) => Events.prependDerivedLogEntries(state, entries)',
      '}',
      'export function bad(state: any, entries: any[]) {',
      '  Local.run(state, entries)',
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/namespace-block.ts', line: 8, kind: 'log-cache-writer-call' }),
    ])
  })

  it('merges provenance assigned to outer bindings inside branches', () => {
    const root = createRoot()
    writeFixture(root, 'server/branch-assign.cjs', [
      'function bad(state, entries, real, stub) {',
      '  let Events = stub',
      '  let Store = stub',
      '  if (real) {',
      "    Events = require('../shared/events')",
      "    ;({ LogStore: Store } = require('../shared/engine'))",
      '  }',
      '  Events.prependDerivedLogEntries(state, entries)',
      '  return new Store()',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/branch-assign.cjs', line: 8, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/branch-assign.cjs', line: 9, kind: 'log-store-constructor' }),
    ])
  })

  it('tracks createRequire by its node:module provenance', () => {
    const root = createRoot()
    writeFixture(root, 'server/require-factory.mjs', [
      "import { createRequire as makeRequire } from 'node:module'",
      "import * as NodeModule from 'module'",
      'const load = makeRequire(import.meta.url)',
      'const load2 = NodeModule.createRequire(import.meta.url)',
      "const Events = load('../shared/events')",
      "const { LogStore: Store } = load2('../shared/engine')",
      'export function bad(state, entries) {',
      '  Events.prependDerivedLogEntries(state, entries)',
      '  return new Store()',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/fake-factory.mjs', [
      "import { createRequire } from './vendor'",
      'const load = createRequire()',
      "const Events = load('../shared/events')",
      'export function ok(state, entries) {',
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/require-factory.mjs', line: 8, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/require-factory.mjs', line: 9, kind: 'log-store-constructor' }),
    ])
  })

  it('hoists ESM imports ahead of derived aliases regardless of textual order', () => {
    const root = createRoot()
    writeFixture(root, 'server/late-import.ts', [
      'export function bad(state: any, entries: any[]) {',
      '  const run = () => write(state, entries)',
      '  return run()',
      '}',
      'const write = Events.prependDerivedLogEntries',
      "import * as Events from '../shared/events'",
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/late-import.ts', line: 2, kind: 'log-cache-writer-call' }),
    ])
  })

  it('recognises comma-wrapped transpiled calls and defaulted destructuring targets', () => {
    const root = createRoot()
    writeFixture(root, 'server/transpiled.cjs', [
      '"use strict"',
      "const events_1 = require('../shared/events')",
      "const engine_1 = require('../shared/engine')",
      'let write, Store',
      ";({ prependDerivedLogEntries: write = fallback } = require('../shared/events'))",
      ";({ LogStore: Store = fallback } = require('../shared/engine'))",
      'function bad(state, entries) {',
      '  ;(0, events_1.prependDerivedLogEntries)(state, entries)',
      '  write(state, entries)',
      '  return [new (0, engine_1.LogStore)(), new Store()]',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/transpiled.cjs', line: 8, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/transpiled.cjs', line: 9, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/transpiled.cjs', line: 10, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/transpiled.cjs', line: 10, kind: 'log-store-constructor' }),
    ])
  })

  it('hoists var declarations from loop heads and follows factory and helper aliases', () => {
    const root = createRoot()
    writeFixture(root, 'server/loop-var.cjs', [
      'function bad(state, entries) {',
      "  for (var Events = require('../shared/events'), i = 0; i < 1; i++) consume(i)",
      "  for (var j = 0, Engine = require('../shared/engine'); j < 1; j++) consume(Engine)",
      '  Events.prependDerivedLogEntries(state, entries)',
      '  return new Engine.LogStore()',
      '}',
      'module.exports = { bad }',
    ].join('\n'))
    writeFixture(root, 'server/factory-alias.mjs', [
      "import { createRequire } from 'node:module'",
      'const factory = createRequire',
      'const load = factory(import.meta.url)',
      'const loader = load',
      "const Events = loader('../shared/events')",
      'export function bad(state, entries) {',
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))
    writeFixture(root, 'server/interop.cjs', [
      '"use strict"',
      "const events_1 = __importStar(require('../shared/events'))",
      "const engine_1 = __importDefault(require('../shared/engine'))",
      "const log_cache_1 = __toESM(require('../shared/events/log-cache'))",
      'function bad(state, entries) {',
      '  events_1.prependDerivedLogEntries(state, entries)',
      '  log_cache_1.prependDerivedLogEntries(state, entries)',
      '  return new engine_1.LogStore()',
      '}',
      'module.exports = { bad }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/factory-alias.mjs', line: 7, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/interop.cjs', line: 6, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/interop.cjs', line: 7, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/interop.cjs', line: 8, kind: 'log-store-constructor' }),
      expect.objectContaining({ file: 'server/loop-var.cjs', line: 4, kind: 'log-cache-writer-call' }),
      expect.objectContaining({ file: 'server/loop-var.cjs', line: 5, kind: 'log-store-constructor' }),
    ])
  })

  it('shadows the name of a named function expression inside its own body', () => {
    const root = createRoot()
    writeFixture(root, 'server/named-function.mjs', [
      "import * as Events from '../shared/events'",
      'export const run = function Events(state, entries) {',
      '  return Events.prependDerivedLogEntries(state, entries)',
      '}',
      'run.prependDerivedLogEntries = () => undefined',
      'export function bad(state, entries) {',
      '  Events.prependDerivedLogEntries(state, entries)',
      '}',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/named-function.mjs', line: 7, kind: 'log-cache-writer-call' }),
    ])
  })

  it.each([
    'server/cache.test.cjs',
    'server/cache.spec.mts',
    'server/cache.test.jsx',
    'server/nested/__tests__/cache.mjs',
  ])('exempts %s from constructor and writer checks like a .test.ts fixture', (file) => {
    const root = createRoot()
    writeFixture(root, file, [
      "const { LogStore } = require('../shared/engine')",
      "const { prependDerivedLogEntries } = require('../shared/events/log-cache')",
      'const store = new LogStore()',
      'prependDerivedLogEntries({ log: [] }, [])',
      'module.exports = { store }',
    ].join('\n'))

    expect(findDirectSessionLogViolations(root)).toEqual([])
  })

  it('reports stale exceptions until every excepted file and function exists', () => {
    const root = createRoot()

    expect(findStaleDirectSessionLogExceptions(root)).toEqual(expect.arrayContaining([
      'stale direct session log exception: scripts/check-direct-session-log.ts',
      'stale direct session log exception: shared/session/session-core.ts',
      'stale direct session log exception: shared/engine/engine.ts#flushEventTransaction',
      'stale direct session log exception: shared/events/append.ts#appendImmediateEvents',
      'stale direct session log exception: shared/events/log-cache.ts#prependDerivedLogEntries',
    ]))

    writeFixture(root, 'scripts/check-direct-session-log.ts', 'export {}')
    writeFixture(root, 'scripts/__tests__/check-direct-session-log.test.ts', 'export {}')
    writeFixture(root, 'shared/session/session-core.ts', 'export class GameCore { private flushEngineLog() {} }')
    writeFixture(root, 'shared/engine/engine.ts', 'export class Engine { flushEventTransaction() {} }')
    writeFixture(root, 'shared/engine/engine-proceed.ts', 'const appendDerivedLogsForEventOnlyResult = () => {}')
    writeFixture(root, 'shared/engine/engine-resolve.ts', 'function appendDerivedLogsForEventOnlyResult() {}')
    writeFixture(root, 'shared/events/append.ts', 'export function appendImmediateEvents() {}')
    writeFixture(root, 'shared/events/log-cache.ts', 'export const other = () => {}')

    expect(findStaleDirectSessionLogExceptions(root)).toEqual([
      'stale direct session log exception: shared/events/log-cache.ts#prependDerivedLogEntries',
    ])

    writeFixture(root, 'shared/events/log-cache.ts', 'export const prependDerivedLogEntries = () => {}')

    expect(findStaleDirectSessionLogExceptions(root)).toEqual([])
  })

  it('has no stale exceptions in this repository', () => {
    expect(findStaleDirectSessionLogExceptions(path.resolve(import.meta.dirname, '../..'))).toEqual([])
  })

  it('reports forbidden runtime state.log mutation with file and line', () => {
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

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
    const root = createRoot()
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
      '  private engineLog = new LogStore()',
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

    expect(findDirectSessionLogViolations(root)).toEqual([])
  })

  it('allows appending from nearest mapper output in allowed functions', () => {
    const root = createRoot()
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
    const root = createRoot()
    writeFixture(root, 'shared/events/log-cache.ts', [
      'export const prependDerivedLogEntries = (state: any, entries: any[]) => {',
      '  state.log.unshift(entries[0])',
      '}',
      'export const bad = (state: any, entry: any) => {',
      '  state.log.unshift(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/events/log-cache.ts',
        line: 5,
        kind: 'state-log-write',
      }),
    ]))
  })

  it('reports state.log mutation on variables inferred from state normalizers', () => {
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

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
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      'export const bad = (int: any, entry: any) => {',
      '  int.log.append(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 2,
        kind: 'log-store-append',
      }),
    ]))
  })

  it('rejects direct and aliased LogStore append calls', () => {
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

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
    const root = createRoot()
    writeFixture(root, 'shared/session/bad-destructure.ts', [
      'export function bad(int: any, entry: any) {',
      '  const { log: sink } = int',
      '  sink.append(entry)',
      '  let reassigned',
      '  ;({ log: reassigned } = int)',
      '  reassigned.append(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

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
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

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
    const root = createRoot()
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
    ])
  })

  it('rejects forbidden LogStore constructors outside session core', () => {
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

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
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 7,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects bad append after same-name call expression', () => {
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 4,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append when argument is not mapper output', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[], entry: any) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  int.log.append(entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 4,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append when mapper entry is mixed with fallback', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[], entry: any) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  int.log.append(entries[0] ?? entry)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 4,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after mapper entry alias mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  const entry = entries[0]!',
      '  entry.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after typed mapper entry alias mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  const entry: LogEntry = entries[0]!',
      '  entry.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after destructured mapper entry alias mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  const [entry] = entries',
      '  entry.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after nested mapper entry mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  entries[0]!.args.bad = 1',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after Object.assign mapper entry mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  Object.assign(entries[0]!, { key: "log.bad" })',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after call-chain mapper entry mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  entries.at(0)!.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after mapper output mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[], entry: any) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  entries[0] = entry',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after mapper output alias mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[], entry: any) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  const alias = entries',
      '  alias[0] = entry',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 6,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects allowed function append after mapper entry mutation', () => {
    const root = createRoot()
    writeFixture(root, 'shared/engine/engine-proceed.ts', [
      "import { eventsToLogEntries } from '../events/log-mapper'",
      'const appendDerivedLogsForEventOnlyResult = (int: any, committed: any[]) => {',
      '  const entries = eventsToLogEntries(committed, {})',
      '  entries[0]!.key = "log.bad"',
      '  int.log.append(entries[0]!)',
      '}',
    ].join('\n'))

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/engine/engine-proceed.ts',
        line: 5,
        kind: 'log-store-append',
      }),
    ])
  })

  it('rejects arbitrary derived log cache writer callsites', () => {
    const root = createRoot()
    writeFixture(root, 'shared/cards/A/A001_Bad.ts', [
      "import { prependDerivedLogEntries } from '../../events/log-cache'",
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

    const violations = findDirectSessionLogViolations(root)

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
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/session/session-core.ts',
        line: 9,
        kind: 'log-cache-writer-call',
      }),
    ])
  })

  it('rejects session flush cache writer after nested derived entry mutation', () => {
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/session/session-core.ts',
        line: 9,
        kind: 'log-cache-writer-call',
      }),
    ])
  })

  it('rejects session flush cache writer after source entries mutation', () => {
    const root = createRoot()
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

    const violations = findDirectSessionLogViolations(root)

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'shared/session/session-core.ts',
        line: 9,
        kind: 'log-cache-writer-call',
      }),
    ])
  })

  it('does not report its own script or fixture strings during repo scan', () => {
    const root = createRoot()
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
    const root = createRoot()
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
