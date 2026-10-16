import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findTestRuleEnvironmentViolations } from '../check-test-rule-environments'

const roots: string[] = []
const write = (root: string, file: string, source: string): void => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, source)
}
const fixture = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-rule-environment-'))
  roots.push(root)
  for (const directory of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests']) write(root, `${directory}/index.ts`, 'export {}')
  return root
}
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })))

describe('test rule environment gate', () => {
  it.each([
    "import { installOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'; installOfficialCardRegistry()",
    "import { installOfficialCardRegistry as install } from '../../shared/cards/__tests__/card-environment'; install()",
    "import * as rules from '../../shared/cards/__tests__/card-environment'; rules.installOfficialCardRegistry()",
    "import * as rules from '../../shared/cards/__tests__/card-environment'; rules['installOfficialCardRegistry']()",
    "import * as rules from '../../shared/cards/__tests__/card-environment'; const { installOfficialCardRegistry: install } = rules; install()",
  ])('rejects blanket official fixtures in server tests including imported aliases', source => {
    const root = fixture()
    write(root, 'server/__tests__/future-session.test.ts', source)
    expect(findTestRuleEnvironmentViolations(root)).toEqual([
      expect.objectContaining({ file: 'server/__tests__/future-session.test.ts', kind: 'session-global-official-fixture' }),
    ])
  })

  it.each([
    "import { GameSession as Session } from '../../server/game/authoritative-session'; new Session()",
    "import * as sessions from '../../server/game/authoritative-session'; const S = sessions.GameSession; new S()",
    "import { createWorkSession as game } from '../../server/__tests__/_helpers/session-fixtures'; game()",
    "import * as sessions from '../../server/__tests__/_helpers/session-fixtures'; sessions.createOpeningSession()",
  ])('rejects shared Session-mixed tests while discovering their runtime use', session => {
    const root = fixture()
    write(root, 'shared/__tests__/mixed.test.ts', `${session}; import { installOfficialCardRegistry as install } from './card-environment'; install()`)
    expect(findTestRuleEnvironmentViolations(root)).toEqual([
      expect.objectContaining({ file: 'shared/__tests__/mixed.test.ts', kind: 'session-global-official-fixture' }),
    ])
  })

  it('keeps pure shared unit fixtures and type-only Session references legal', () => {
    const root = fixture()
    write(root, 'shared/__tests__/unit.test.ts', `
      import type { GameSession } from '../../server/game/authoritative-session'
      import { installOfficialCardRegistry } from './card-environment'
      installOfficialCardRegistry()
      beforeEach(() => setActiveCardRegistry(createOfficialCardRegistry()))
    `)
    expect(findTestRuleEnvironmentViolations(root)).toEqual([])
  })

  it('keeps synchronous owner queries and explicit wrong-registry scopes legal', () => {
    const root = fixture()
    write(root, 'server/__tests__/owner.test.ts', `
      import { createWorkSession } from './_helpers/session-fixtures'
      import { withActiveRegistry } from '../../shared/cards/active-registry'
      const session = createWorkSession()
      const answer = session.withCtx(() => queryRules(session.state))
      withActiveRegistry(wrongRegistry, () => session.getPastureCapacities())
      beforeEach(() => setActiveCardRegistry(null))
      beforeAll(() => setActiveCardRegistry((null)))
    `)
    expect(findTestRuleEnvironmentViolations(root)).toEqual([])
  })

  it.each(['beforeEach', 'beforeAll'])('rejects non-null %s registry publication through aliases', hook => {
    const root = fixture()
    write(root, 'server/__tests__/publisher.test.ts', `
      import { ${hook} as setup } from 'vitest'
      import * as env from '../../shared/cards/active-registry'
      const publish = env.setActiveCardRegistry
      const prepare = () => publish(new CardRegistry())
      setup(prepare)
    `)
    expect(findTestRuleEnvironmentViolations(root)).toEqual([
      expect.objectContaining({ kind: 'session-before-hook-registry-publication' }),
    ])
  })

  it.each([
    'session.withCtx(async () => await query())',
    "import { withActiveRegistry as scope } from './active-registry'; scope(registry, async () => query())",
    'const read = async () => query(); const alias = read; session.withCtx(alias)',
    'async function read() { return query() }; session.withCtx(read)',
  ])('rejects asynchronous temporary registry scope callbacks', source => {
    const root = fixture()
    write(root, 'shared/__tests__/async.test.ts', source)
    expect(findTestRuleEnvironmentViolations(root)).toEqual([
      expect.objectContaining({ kind: 'async-rule-scope' }),
    ])
  })

  it('discovers a newly added bad test rather than relying on an audited-file list', () => {
    const root = fixture()
    expect(findTestRuleEnvironmentViolations(root)).toEqual([])
    write(root, 'client/__tests__/new-feature.test.tsx', `
      import { createWorkSession } from '../../server/__tests__/_helpers/session-fixtures'
      import * as env from '../../shared/cards/__tests__/card-environment'
      env.installOfficialCardRegistry()
      const session = createWorkSession()
    `)
    expect(findTestRuleEnvironmentViolations(root)).toEqual([
      expect.objectContaining({ file: 'client/__tests__/new-feature.test.tsx', kind: 'session-global-official-fixture' }),
    ])
  })

  it('fails on missing source roots and syntax errors', () => {
    const root = fixture()
    fs.rmSync(path.join(root, 'server'), { recursive: true })
    expect(() => findTestRuleEnvironmentViolations(root)).toThrow('missing test-environment source root: server')
    write(root, 'server/bad.ts', 'const =')
    expect(() => findTestRuleEnvironmentViolations(root)).toThrow('server/bad.ts')
  })
})
