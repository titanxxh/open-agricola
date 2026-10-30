import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cardVerification, readCardAssociationIndex } from '../ci/card-verification'
import { planVerification, readTestInventory, type ChangedPath, type TestInventory } from '../ci/verification-plan'
import { FULL_TASK_IDS } from '../ci/verification-tasks'

const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })))
const write = (cwd: string, file: string, text: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), text)
}
const identity = {
  baseRef: 'main', headRef: 'HEAD', baseSha: '1'.repeat(40), mergeBaseSha: '1'.repeat(40),
  headSha: '2'.repeat(40), testedSha: '2'.repeat(40), sourceFingerprint: '3'.repeat(64),
}
const browserSafety = ['card-localization', 'choice-previews', 'farm-card-targets', 'frontend-browser-scenario-matrix'].map(name => `e2e-tests/${name}.spec.ts`)
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'card-verification-'))
  temporary.push(cwd)
  const source = 'shared/cards/A/A029_AleBenches.ts'
  const other = 'shared/cards/A/A127_Lodger.ts'
  write(cwd, source, "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches' } })\n")
  write(cwd, other, "export const A127_Lodger = defineOccupationCard({ meta: { id: 'A127_Lodger' } })\n")
  const inventory: TestInventory = { vitest: [
    { file: 'shared/cards/__tests__/A29_AleBenches.test.ts', project: 'fast-cards' },
    { file: 'shared/cards/__tests__/A127_Lodger.test.ts', project: 'fast-cards' },
    { file: 'server/__tests__/A029_AleBenches-session.test.ts', project: 'slow' },
    { file: 'server/__tests__/cross-card-session.test.ts', project: 'fast-server' },
    { file: 'shared/cards/__tests__/registry-audit.test.ts', project: 'fast-cards' },
  ], browser: [...browserSafety] }
  for (const file of browserSafety) write(cwd, file, 'const cards = catalogCardDefinitions\n')
  write(cwd, inventory.vitest[0]!.file, "import { A029_AleBenches as ale } from '../A/A029_AleBenches'\nale.impl.effect()\n")
  write(cwd, inventory.vitest[1]!.file, "const card = 'A127_Lodger'\nexpect(card).toBeDefined()\n")
  write(cwd, inventory.vitest[2]!.file, "const played = ['A29_AleBenches']\nexpect(played).toContain('A29_AleBenches')\n")
  write(cwd, inventory.vitest[3]!.file, "import { ALE } from './_helpers/audit/reexports'\nexpect(ALE).toBeDefined()\n")
  write(cwd, 'server/__tests__/_helpers/audit/reexports.ts', "export { ALE } from './cards'\n")
  write(cwd, 'server/__tests__/_helpers/audit/cards.ts', "import '../../../../../shared/cards/A/A029_AleBenches'\nexport const ALE = 'A029_AleBenches'\n")
  write(cwd, inventory.vitest[4]!.file, "const literal = 'A127_Lodger'\nconst cards = Object.values(ALL_CARD_IMPLS)\nexpect(cards).toContain(literal)\n")
  return { cwd, source, other, inventory }
}

describe('card test associations', () => {
  it('selects complete direct, leading-zero, Session and helper-owned cross-card files, plus generic safety consumers', () => {
    const { cwd, source, inventory } = fixture()
    const associations = readCardAssociationIndex(cwd, inventory)
    const mapping = cardVerification([source], inventory, associations, [{ status: 'M', path: source }])

    expect(mapping).toEqual({ expansionReasons: [], checks: [
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'vitest', project: 'fast-cards', files: [
        'shared/cards/__tests__/A29_AleBenches.test.ts', 'shared/cards/__tests__/registry-audit.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-server', files: ['server/__tests__/cross-card-session.test.ts'] },
      { kind: 'vitest', project: 'slow', files: ['server/__tests__/A029_AleBenches-session.test.ts'] },
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
      { kind: 'browser', browser: 'chromium', files: browserSafety, grep: null },
    ] })
  })

  it('selects card-owned browser helpers and retains generic card UI and specialized engine checks', () => {
    const { cwd, source, inventory } = fixture()
    inventory.browser.push('e2e-tests/ale.spec.ts', 'e2e-tests/lodger.spec.ts', 'e2e-tests/card-ui.spec.ts')
    write(cwd, 'e2e-tests/ale.spec.ts', "import { ALE } from './helpers/cards'\nexpect(ALE).toBeDefined()\n")
    write(cwd, 'e2e-tests/helpers/cards.ts', "export const ALE = 'A029_AleBenches'\n")
    write(cwd, 'e2e-tests/lodger.spec.ts', "const card = 'A127_Lodger'\n")
    write(cwd, 'e2e-tests/card-ui.spec.ts', "const named = 'A127_Lodger'\nconst cards = catalogCardDefinitions.map(card => card.id)\n")

    const mapping = cardVerification([source], inventory, readCardAssociationIndex(cwd, inventory), [{ status: 'M', path: source }])

    expect(mapping.expansionReasons).toEqual([])
    expect(mapping.checks.filter(check => check.kind === 'browser' || (check.kind === 'catalog' && !['quality', 'build'].includes(check.taskId)))).toEqual([
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
      { kind: 'browser', browser: 'chromium', files: [
        'e2e-tests/ale.spec.ts', 'e2e-tests/card-localization.spec.ts', 'e2e-tests/card-ui.spec.ts',
        'e2e-tests/choice-previews.spec.ts', 'e2e-tests/farm-card-targets.spec.ts', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts',
      ], grep: null },
    ])
  })

  it('does not turn unrelated Session construction or auth browser utilities into card consumers', () => {
    const { cwd, source, inventory } = fixture()
    inventory.vitest.push({ file: 'server/__tests__/auth.test.ts', project: 'fast-server' })
    inventory.browser.push('e2e-tests/auth.spec.ts')
    write(cwd, 'server/__tests__/auth.test.ts', 'const session = new GameSession(42)\nexpect(session.getState()).toBeDefined()\n')
    write(cwd, 'e2e-tests/auth.spec.ts', "import { saveScreenshot } from './fixtures'\nawait saveScreenshot(page, 'auth')\n")
    write(cwd, 'e2e-tests/fixtures.ts', "import { writeFileSync } from 'node:fs'\nexport function saveScreenshot(page, name) { writeFileSync(name, '') }\n")

    const mapping = cardVerification([source], inventory, readCardAssociationIndex(cwd, inventory), [{ status: 'M', path: source }])

    expect(mapping.expansionReasons).toEqual([])
    expect(mapping.checks.flatMap(check => check.kind === 'catalog' ? [] : check.files)).not.toContain('server/__tests__/auth.test.ts')
    expect(mapping.checks.flatMap(check => check.kind === 'catalog' ? [] : check.files)).not.toContain('e2e-tests/auth.spec.ts')
  })

  it.each([
    ['filesystem fixture', "import { readFileSync as read } from 'node:fs'\nconst fixture = JSON.parse(read(inputPath, 'utf8'))\nconsume(fixture)\n"],
    ['computed module', 'const imported = await import(inputPath)\nconsume(imported)\n'],
    ['unresolved local helper', "import { consume } from './_helpers/missing'\nconsume()\n"],
    ['parameterized card lookup', "const named = 'A127_Lodger'\nfunction find(cardId: string) { return getCardEffect(cardId) }\n"],
  ])('retains an unbounded %s consumer even without a literal owner', (_, contents) => {
    const { cwd, source, inventory } = fixture()
    const file = 'server/__tests__/indirect.test.ts'
    inventory.vitest.push({ file, project: 'fast-server' })
    write(cwd, file, contents)

    const mapping = cardVerification([source], inventory, readCardAssociationIndex(cwd, inventory), [{ status: 'M', path: source }])

    expect(mapping.expansionReasons).toEqual([])
    expect(mapping.checks).toContainEqual({ kind: 'vitest', project: 'fast-server', files: ['server/__tests__/cross-card-session.test.ts', file] })
  })

  it('uses associations in the public plan and expands the whole plan when a card has hand/global footprint', () => {
    const { cwd, source, inventory } = fixture()
    const input = { identity, changes: [{ status: 'M', path: source }] as const, inventory, fullTaskIds: ['quality', 'fast', 'slow', 'build', 'browser-sandbox', 'webkit'] }
    const scoped = planVerification({ ...input, changes: [...input.changes], cardAssociations: readCardAssociationIndex(cwd, inventory) })
    expect(scoped.mode).toBe('scoped')
    expect(scoped.checks).toContainEqual({ kind: 'vitest', project: 'slow', files: ['server/__tests__/A029_AleBenches-session.test.ts'] })

    write(cwd, source, "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches' }, impl: { effect: { handHooks: ['onPreparation'] } } })\n")
    const full = planVerification({ ...input, changes: [...input.changes], cardAssociations: readCardAssociationIndex(cwd, inventory) })
    expect(full.mode).toBe('full')
    expect(full.checks).toEqual([
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'fast' }, { kind: 'catalog', taskId: 'slow' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
    ])
    expect(full.expansionReasons.join(' ')).toContain('hand or global')
  })

  it('covers narrower same-engine selectors with complete files and retains the other browser and sandbox checks', () => {
    const { cwd, source, inventory } = fixture()
    inventory.vitest.push({ file: 'client/services/__tests__/gameTransport.test.ts', project: 'fast-client' })
    write(cwd, 'client/services/__tests__/gameTransport.test.ts', 'export {}\n')
    for (const name of ['hosted-password-login', 'oauth-onboarding', 'room-invitations', 'ws-dual-player']) {
      const file = `e2e-tests/${name}.spec.ts`
      inventory.browser.push(file)
      write(cwd, file, 'export {}\n')
    }
    const selected = planVerification({
      identity, changes: [{ status: 'M', path: source }, { status: 'M', path: 'client/services/gameTransport.ts' }],
      inventory, fullTaskIds: FULL_TASK_IDS, cardAssociations: readCardAssociationIndex(cwd, inventory),
    })

    expect(selected.mode).toBe('scoped')
    expect(selected.checks.filter(check => check.kind === 'browser')).toEqual([
      { kind: 'browser', browser: 'chromium', files: [
        'e2e-tests/card-localization.spec.ts', 'e2e-tests/choice-previews.spec.ts', 'e2e-tests/farm-card-targets.spec.ts',
        'e2e-tests/frontend-browser-scenario-matrix.spec.ts', 'e2e-tests/hosted-password-login.spec.ts',
        'e2e-tests/oauth-onboarding.spec.ts', 'e2e-tests/room-invitations.spec.ts', 'e2e-tests/ws-dual-player.spec.ts',
      ], grep: null },
      { kind: 'browser', browser: 'webkit', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@webkit' },
    ])
    expect(selected.checks.filter(check => check.kind === 'catalog')).toEqual([
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
    ])
  })

  it.each<ChangedPath>([
    { status: 'A', path: 'shared/cards/A/A029_AleBenches.ts' },
    { status: 'D', path: 'shared/cards/A/A029_AleBenches.ts' },
    { status: 'R', path: 'shared/cards/A/A029_AleBenches.ts', previousPath: 'shared/cards/A/A29_AleBenches.ts' },
  ])('expands $status card paths instead of trusting post-change associations', change => {
    const { cwd, inventory } = fixture()
    const mapping = cardVerification([change.path], inventory, readCardAssociationIndex(cwd, inventory), [change])
    expect(mapping.checks).toEqual([])
    expect(mapping.expansionReasons.join(' ')).toContain('Added, deleted or renamed')
  })

  it('expands unknown card paths, missing behavior evidence and stale test inventories', () => {
    const { cwd, source, other, inventory } = fixture()
    const associations = readCardAssociationIndex(cwd, inventory)
    expect(cardVerification(['shared/cards/A/A999_Unknown.ts'], inventory, associations, []).expansionReasons.join(' ')).toContain('ownership or behavior associations are missing')
    inventory.vitest = inventory.vitest.filter(test => test.file !== 'shared/cards/__tests__/A127_Lodger.test.ts' && test.file !== 'shared/cards/__tests__/registry-audit.test.ts')
    expect(cardVerification([source], inventory, associations, []).expansionReasons.join(' ')).toContain('does not match')
    expect(cardVerification([other], inventory, readCardAssociationIndex(cwd, inventory), []).expansionReasons.join(' ')).toContain('No declared behavior-test association')
    expect(cardVerification([source], inventory, undefined, []).expansionReasons.join(' ')).toContain('evidence is missing')
  })

  it('expands when a declared generic card UI consumer disappears from the inventory', () => {
    const { cwd, source, inventory } = fixture()
    inventory.browser = inventory.browser.filter(file => file !== 'e2e-tests/choice-previews.spec.ts')
    const mapping = cardVerification([source], inventory, readCardAssociationIndex(cwd, inventory), [])
    expect(mapping.checks).toEqual([])
    expect(mapping.expansionReasons.join(' ')).toContain('Declared card UI consumers are missing')
  })

  it.each(['direct', 'Session'])('accepts declared %s-only behavior coverage without imposing another test layer', layer => {
    const { cwd, source, inventory } = fixture()
    inventory.vitest = inventory.vitest.filter(test => test.file === (layer === 'direct'
      ? 'shared/cards/__tests__/A29_AleBenches.test.ts' : 'server/__tests__/A029_AleBenches-session.test.ts'))
    const mapping = cardVerification([source], inventory, readCardAssociationIndex(cwd, inventory), [])
    expect(mapping.expansionReasons).toEqual([])
    expect(mapping.checks).toContainEqual(layer === 'direct'
      ? { kind: 'vitest', project: 'fast-cards', files: ['shared/cards/__tests__/A29_AleBenches.test.ts'] }
      : { kind: 'vitest', project: 'slow', files: ['server/__tests__/A029_AleBenches-session.test.ts'] })
  })

  it('discovers newly inventoried cross-card files and keeps bounded helper cycles complete', () => {
    const { cwd, source, inventory } = fixture()
    write(cwd, 'server/__tests__/_helpers/audit/cards.ts', "export const ALE = 'A029_AleBenches'\nexport { ALE as alias } from './reexports'\n")
    const file = 'shared/cards/__tests__/new-cross-card.test.ts'
    inventory.vitest.push({ file, project: 'fast-cards' })
    write(cwd, file, "const owner = 'A29_AleBenches'\n")
    const mapping = cardVerification([source], inventory, readCardAssociationIndex(cwd, inventory), [])
    expect(mapping.expansionReasons).toEqual([])
    expect(mapping.checks).toContainEqual({ kind: 'vitest', project: 'fast-cards', files: [
      'shared/cards/__tests__/A29_AleBenches.test.ts', file, 'shared/cards/__tests__/registry-audit.test.ts',
    ] })
    expect(mapping.checks).toContainEqual({ kind: 'vitest', project: 'fast-server', files: ['server/__tests__/cross-card-session.test.ts'] })
  })

  it('expands malformed helper evidence and ambiguous leading-zero source identities', () => {
    const { cwd, source, inventory } = fixture()
    write(cwd, 'server/__tests__/_helpers/audit/cards.ts', 'export const =')
    expect(cardVerification([source], inventory, readCardAssociationIndex(cwd, inventory), []).expansionReasons.join(' ')).toContain('Cannot inspect card test evidence')
    write(cwd, 'shared/cards/A/A29_AleBenches.ts', "export const A29_AleBenches = defineMinorCard({ meta: { id: 'A29_AleBenches' } })\n")
    expect(cardVerification([source], inventory, readCardAssociationIndex(cwd, inventory), []).expansionReasons.join(' ')).toContain('Ambiguous Card Source identity')
  })

  it('does not traverse production register-all or bootstrap into every card owner', () => {
    const { cwd, source, inventory } = fixture()
    write(cwd, 'shared/cards/register-all.ts', "import './A/A029_AleBenches'\nimport './A/A127_Lodger'\n")
    write(cwd, 'shared/cards/__tests__/setup-register-all.ts', "import '../register-all'\n")
    write(cwd, 'shared/cards/__tests__/A127_Lodger.test.ts', "import './setup-register-all'\nconst id = 'A127_Lodger'\n")
    const index = readCardAssociationIndex(cwd, inventory)
    expect(index.tests.find(test => test.file === 'shared/cards/__tests__/A127_Lodger.test.ts')).toEqual({
      file: 'shared/cards/__tests__/A127_Lodger.test.ts', cardIds: ['A127_Lodger'], safetyReasons: [],
    })
    expect(cardVerification([source], inventory, index, []).checks.flatMap(check => check.kind === 'catalog' ? [] : check.files)).not.toContain('shared/cards/__tests__/A127_Lodger.test.ts')
  })

  it('includes every known real A029 consumer and production-wide card safety audits', () => {
    const cwd = resolve(import.meta.dirname, '../..')
    const inventory = readTestInventory(cwd)
    const index = readCardAssociationIndex(cwd, inventory)
    const source = 'shared/cards/A/A029_AleBenches.ts'
    const mapping = cardVerification([source], inventory, index, [{ status: 'M', path: source }])
    expect(mapping.expansionReasons).toEqual([])
    const selected = mapping.checks.flatMap(check => check.kind === 'catalog' ? [] : check.files)
    expect(selected).toEqual(expect.arrayContaining([
      'shared/cards/__tests__/A29_AleBenches.test.ts',
      'shared/cards/__tests__/priority-plan-implementation.test.ts',
      'server/__tests__/A029_AleBenches-session.test.ts',
      'server/__tests__/A-complex-minors-parity-session.test.ts',
      'server/__tests__/A127_Lodger-session.test.ts',
      'server/__tests__/A27_OvenSite-session.test.ts',
      'server/__tests__/A28_ForestSchool-session.test.ts',
      'shared/cards/__tests__/listener-purity-guard.test.ts',
      'shared/cards/__tests__/provenance-result-audit.test.ts',
      'server/__tests__/anytime-reentry-session.test.ts',
      'tests/cost-pay-parity.test.ts',
      'shared/i18n/__tests__/zh.test.ts',
      'e2e-tests/card-localization.spec.ts',
      'e2e-tests/choice-previews.spec.ts',
      'e2e-tests/farm-card-targets.spec.ts',
      'e2e-tests/frontend-browser-scenario-matrix.spec.ts',
    ]))
    expect(mapping.checks).toContainEqual({ kind: 'catalog', taskId: 'quality' })
    expect(selected).not.toContain('server/__tests__/B007_Wage-session.test.ts')
  }, 30_000)
})
