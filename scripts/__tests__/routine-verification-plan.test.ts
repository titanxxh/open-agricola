import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { planRoutineVerification } from '../ci/routine-verification-plan'
import { FULL_TASK_IDS } from '../ci/verification-tasks'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function writeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'routine-plan-'))
  roots.push(root)
  for (const [file, text] of Object.entries(files)) {
    const target = join(root, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
  return root
}

describe('dependency routine verification plan', () => {
  it('selects every Vitest file that transitively depends on a changed production module', () => {
    const root = writeTree({
      'shared/domain/prod.ts': 'export const prod = 1\n',
      'shared/domain/mid.ts': "import { prod } from './prod'\nexport const mid = prod\n",
      'shared/domain/other.ts': 'export const other = 1\n',
      'shared/domain/__tests__/prod.test.ts': "import { mid } from '../mid'\nexport const used = mid\n",
      'shared/domain/__tests__/other.test.ts': "import { other } from '../other'\nexport const used = other\n",
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/domain/prod.ts' }],
    })

    expect(plan.vitestFiles).toEqual(['shared/domain/__tests__/prod.test.ts'])
  })

  it('selects Vitest files that reach a changed CSS module through an import', () => {
    const root = writeTree({
      'client/view.css': '.view { color: black; }\n',
      'client/view.ts': "import './view.css'\nexport const view = 1\n",
      'client/view.test.ts': "import { view } from './view'\nexport const used = view\n",
      'client/other.test.ts': 'export const other = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/view.css' }],
    })

    expect(plan.vitestFiles).toEqual(['client/view.test.ts'])
    expect(plan.fullTrigger).toBe(false)
  })

  it('selects Vitest files that reach a changed module through a literal dynamic import', () => {
    const root = writeTree({
      'client/pane.ts': 'export const pane = 1\n',
      'client/loader.ts': "export const load = () => import('./pane')\n",
      'client/loader.test.ts': "import { load } from './loader'\nexport const used = load\n",
      'client/other.test.ts': 'export const other = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/pane.ts' }],
    })

    expect(plan.vitestFiles).toEqual(['client/loader.test.ts'])
  })

  it('does not select a Vitest file that only imports the changed module as a type', () => {
    const root = writeTree({
      'shared/domain/score.ts': 'export type Score = number\nexport const score = 1\n',
      'shared/domain/__tests__/typed.test.ts': "import type { Score } from '../score'\nexport const marker: Score = 1\n",
      'shared/domain/__tests__/specifier.test.ts': "import { type Score } from '../score'\nexport const marker: Score = 1\n",
      'shared/domain/__tests__/value.test.ts': "import { score } from '../score'\nexport const used = score\n",
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/domain/score.ts' }],
    })

    expect(plan.vitestFiles).toEqual(['shared/domain/__tests__/value.test.ts'])
  })

  it('selects an unregistered source file and its new Vitest file without the complete catalog', () => {
    const root = writeTree({
      'new-service/handler.ts': 'export const handler = 1\n',
      'server/__tests__/handler.test.ts': "import { handler } from '../../new-service/handler'\nexport const used = handler\n",
    })

    const plan = planRoutineVerification({
      root,
      changes: [
        { status: 'A', path: 'new-service/handler.ts' },
        { status: 'A', path: 'server/__tests__/handler.test.ts' },
      ],
    })

    expect(plan.vitestFiles).toEqual(['server/__tests__/handler.test.ts'])
    expect(plan.fullTrigger).toBe(false)
  })

  it('keeps mechanism aggregators on the ordinary dependency walk', () => {
    const root = writeTree({
      'shared/actions/effects/pay.ts': 'export const pay = 1\n',
      'shared/actions/internal-actions.ts': "import { pay } from './effects/pay'\nexport const internal = pay\n",
      'shared/actions/index.ts': "import { internal } from './internal-actions'\nexport const actions = internal\n",
      'server/__tests__/actions.test.ts': "import { actions } from '../../shared/actions/index'\nexport const used = actions\n",
      'server/__tests__/unrelated.test.ts': 'export const other = 1\n',
    })

    const throughAggregator = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/actions/effects/pay.ts' }],
    })
    const aggregator = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/actions/internal-actions.ts' }],
    })

    expect(throughAggregator.vitestFiles).toEqual(['server/__tests__/actions.test.ts'])
    expect(aggregator.vitestFiles).toEqual(['server/__tests__/actions.test.ts'])
    expect(throughAggregator.fullTrigger).toBe(false)
  })

  it('stops a card change at the generated registries and keeps direct, literal, and registry-import tests', () => {
    const root = writeTree({
      'shared/cards/A/A009_Probe.ts': 'export const A009_Probe = { impl: {} }\n',
      'shared/cards/register-all.ts': "import { A009_Probe } from './A/A009_Probe'\nexport const ALL_CARD_IMPLS = { 'A009_Probe': A009_Probe.impl }\n",
      'shared/cards/catalog.generated.ts': 'export const catalog = []\n',
      'shared/cards/major/generated.ts': 'export const majors = []\n',
      'shared/cards/major/runtime.generated.ts': 'export const runtime = []\n',
      'server/helper.ts': "import '../shared/cards/register-all'\nexport const helper = 1\n",
      'server/__tests__/direct-card.test.ts': "import { A009_Probe } from '../../shared/cards/A/A009_Probe'\nexport const used = A009_Probe\n",
      'server/__tests__/registry-direct.test.ts': "import '../../shared/cards/register-all'\nexport const loaded = true\n",
      'server/__tests__/catalog-direct.test.ts': "import '../../shared/cards/catalog.generated'\nexport const loaded = true\n",
      'server/__tests__/via-helper.test.ts': "import { helper } from '../helper'\nexport const used = helper\n",
      'server/__tests__/key-literal.test.ts': "export const id = 'A009_Probe'\n",
      'server/__tests__/path-mention.test.ts': "export const file = 'shared/cards/A/A009_Probe.ts'\n",
      'server/__tests__/type-only-registry.test.ts': "import type { ALL_CARD_IMPLS } from '../../shared/cards/register-all'\nexport const typed = true as unknown as typeof ALL_CARD_IMPLS\n",
      'server/__tests__/unrelated.test.ts': 'export const other = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/cards/A/A009_Probe.ts' }],
    })

    expect(plan.vitestFiles).toEqual([
      'server/__tests__/catalog-direct.test.ts',
      'server/__tests__/direct-card.test.ts',
      'server/__tests__/key-literal.test.ts',
      'server/__tests__/registry-direct.test.ts',
    ])
    expect(plan.fullTrigger).toBe(false)
  })

  it('selects Vitest files that import a changed card registry directly', () => {
    const root = writeTree({
      'shared/cards/register-all.ts': 'export const ALL_CARD_IMPLS = {}\n',
      'server/helper.ts': "import '../shared/cards/register-all'\nexport const helper = 1\n",
      'server/__tests__/registry-direct.test.ts': "import '../../shared/cards/register-all'\nexport const loaded = true\n",
      'server/__tests__/via-helper.test.ts': "import { helper } from '../helper'\nexport const used = helper\n",
      'server/__tests__/unrelated.test.ts': 'export const other = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/cards/register-all.ts' }],
    })

    expect(plan.vitestFiles).toEqual(['server/__tests__/registry-direct.test.ts'])
    expect(plan.fullTrigger).toBe(false)
  })

  it('selects the quality and build catalog tasks for a source change', () => {
    const root = writeTree({
      'shared/domain/prod.ts': 'export const prod = 1\n',
      'shared/domain/__tests__/prod.test.ts': "import { prod } from '../prod'\nexport const used = prod\n",
      'docs/ARCHITECTURE.md': '# Architecture\n',
    })

    const source = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/domain/prod.ts' }],
    })
    const mixed = planRoutineVerification({
      root,
      changes: [
        { status: 'M', path: 'docs/ARCHITECTURE.md' },
        { status: 'M', path: 'shared/domain/prod.ts' },
      ],
    })

    expect(source.catalogTasks).toEqual(['quality', 'build'])
    expect(source.vitestFiles).toEqual(['shared/domain/__tests__/prod.test.ts'])
    expect(source.fullTrigger).toBe(false)
    expect(mixed.catalogTasks).toEqual(['quality', 'build'])
    expect(mixed.vitestFiles).toEqual(['shared/domain/__tests__/prod.test.ts'])
  })

  it('selects no catalog tasks for a documentation-only change', () => {
    const root = writeTree({
      'docs/ARCHITECTURE.md': '# Architecture\n',
      'README.md': '# Readme\n',
      'shared/domain/prod.ts': 'export const prod = 1\n',
      'shared/domain/__tests__/prod.test.ts': "import { prod } from '../prod'\nexport const used = prod\n",
    })

    const plan = planRoutineVerification({
      root,
      changes: [
        { status: 'M', path: 'docs/ARCHITECTURE.md' },
        { status: 'M', path: 'README.md' },
      ],
    })

    expect(plan.catalogTasks).toEqual([])
    expect(plan.vitestFiles).toEqual([])
    expect(plan.fullTrigger).toBe(false)
    expect(plan.warnings).toEqual([])
  })

  it('selects the complete catalog for a full trigger and keeps an unclassified path off that list', () => {
    const root = writeTree({
      'shared/domain/prod.ts': 'export const prod = 1\n',
      'shared/domain/__tests__/prod.test.ts': "import { prod } from '../prod'\nexport const used = prod\n",
      'new-service/handler.ts': 'export const handler = 1\n',
      'server/__tests__/handler.test.ts': "import { handler } from '../../new-service/handler'\nexport const used = handler\n",
      'scripts/check-dependencies.ts': 'export const check = 1\n',
      'scripts/__tests__/check-dependencies.test.ts': "import { check } from '../check-dependencies'\nexport const used = check\n",
      'replay-viewer/vite.config.ts': 'export default {}\n',
    })
    const complete = [...FULL_TASK_IDS]

    for (const path of [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'vitest.config.ts',
      'vite.config.ts',
      'playwright.config.ts',
      'eslint.config.js',
      'tsconfig.json',
      'tsconfig.verification-tools.json',
      '.github/workflows/scoped-verification.yml',
      'scripts/ci/verification-plan.ts',
      'scripts/ci/routine-verification-plan.ts',
      'scripts/verify.ts',
      'scripts/test-project-globs.ts',
    ]) {
      const plan = planRoutineVerification({ root, changes: [{ status: 'M', path }] })
      expect(plan.fullTrigger, path).toBe(true)
      expect(plan.catalogTasks, path).toEqual(complete)
      expect(plan.vitestFiles, path).toEqual([])
    }

    const mixed = planRoutineVerification({
      root,
      changes: [
        { status: 'M', path: 'package.json' },
        { status: 'M', path: 'shared/domain/prod.ts' },
      ],
    })
    expect(mixed.fullTrigger).toBe(true)
    expect(mixed.catalogTasks).toEqual(complete)
    expect(mixed.vitestFiles).toEqual([])

    const unknown = planRoutineVerification({
      root,
      changes: [{ status: 'A', path: 'new-service/handler.ts' }],
    })
    expect(unknown.fullTrigger).toBe(false)
    expect(unknown.catalogTasks).toEqual(['quality', 'build'])
    expect(unknown.vitestFiles).toEqual(['server/__tests__/handler.test.ts'])

    const script = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'scripts/check-dependencies.ts' }],
    })
    expect(script.fullTrigger).toBe(false)
    expect(script.catalogTasks).toEqual(['quality', 'build'])
    expect(script.vitestFiles).toEqual(['scripts/__tests__/check-dependencies.test.ts'])

    const nestedConfig = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'replay-viewer/vite.config.ts' }],
    })
    expect(nestedConfig.fullTrigger).toBe(false)
    expect(nestedConfig.catalogTasks).toEqual(['quality', 'build'])
  })

  it('warns and widens an unresolved import to its Vitest project', () => {
    const root = writeTree({
      'shared/domain/score.ts': "import { missing } from './missing'\nexport const score = missing\n",
      'shared/domain/__tests__/score.test.ts': "import { score } from '../score'\nexport const used = score\n",
      'shared/domain/__tests__/other.test.ts': 'export const other = 1\n',
      'server/__tests__/room.test.ts': 'export const room = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/domain/score.ts' }],
    })

    expect(plan.fullTrigger).toBe(false)
    expect(plan.catalogTasks).toEqual(['quality', 'build'])
    expect(plan.vitestFiles).toEqual([
      'shared/domain/__tests__/other.test.ts',
      'shared/domain/__tests__/score.test.ts',
    ])
    expect(plan.warnings).toEqual([
      "shared/domain/score.ts: unresolved import './missing'; widened to fast-shared",
    ])
  })

  it('warns and widens a non-literal dynamic import to its Vitest project', () => {
    const root = writeTree({
      'client/loader.ts': 'export const load = (name: string) => import(name)\n',
      'client/loader.test.ts': "import { load } from './loader'\nexport const used = load\n",
      'client/other.test.ts': 'export const other = 1\n',
      'server/__tests__/room.test.ts': 'export const room = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/loader.ts' }],
    })

    expect(plan.fullTrigger).toBe(false)
    expect(plan.vitestFiles).toEqual(['client/loader.test.ts', 'client/other.test.ts'])
    expect(plan.warnings).toEqual(['client/loader.ts: unresolved import; widened to fast-client'])
  })

  it('does not widen when unresolved evidence is outside the changed dependency cone', () => {
    const root = writeTree({
      'shared/domain/prod.ts': 'export const prod = 1\n',
      'shared/domain/__tests__/prod.test.ts': "import { prod } from '../prod'\nexport const used = prod\n",
      'client/loader.ts': 'export const load = (name: string) => import(name)\n',
      'client/loader.test.ts': "import { load } from './loader'\nexport const used = load\n",
      'client/other.test.ts': 'export const other = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/domain/prod.ts' }],
    })

    expect(plan.vitestFiles).toEqual(['shared/domain/__tests__/prod.test.ts'])
    expect(plan.warnings).toEqual([])
    expect(plan.fullTrigger).toBe(false)
  })

  it('warns and widens an unparseable source file to its Vitest project', () => {
    const root = writeTree({
      'shared/domain/score.ts': 'export const =\n',
      'shared/domain/__tests__/score.test.ts': "import { score } from '../score'\nexport const used = score\n",
      'shared/domain/__tests__/other.test.ts': 'export const other = 1\n',
      'server/__tests__/room.test.ts': 'export const room = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/domain/score.ts' }],
    })

    expect(plan.fullTrigger).toBe(false)
    expect(plan.catalogTasks).toEqual(['quality', 'build'])
    expect(plan.vitestFiles).toEqual([
      'shared/domain/__tests__/other.test.ts',
      'shared/domain/__tests__/score.test.ts',
    ])
    expect(plan.warnings).toEqual([
      'shared/domain/score.ts: source file cannot be parsed; widened to fast-shared',
    ])
  })

  it('widens unparseable browser evidence to the empty routine browser smoke set', () => {
    const root = writeTree({
      'e2e-tests/login.spec.ts': 'export const =\n',
      'shared/domain/__tests__/other.test.ts': 'export const other = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'e2e-tests/login.spec.ts' }],
    })

    expect(plan.fullTrigger).toBe(false)
    expect(plan.vitestFiles).toEqual([])
    expect(plan.browserFiles).toEqual([])
    expect(plan.warnings).toEqual([
      'e2e-tests/login.spec.ts: source file cannot be parsed; widened to the routine browser smoke set',
    ])
  })

  it('selects the complete catalog and reports the error when planning throws', () => {
    const plan = planRoutineVerification({
      root: '/tmp/routine-plan-missing-root',
      changes: [{ status: 'M', path: 'shared/domain/prod.ts' }],
    })

    expect(plan.fullTrigger).toBe(true)
    expect(plan.catalogTasks).toEqual([...FULL_TASK_IDS])
    expect(plan.vitestFiles).toEqual([])
    expect(plan.browserFiles).toEqual([])
    expect(plan.warnings).toEqual([
      expect.stringContaining('Planner exception:'),
    ])
    expect(plan.warnings.join('\n')).toContain('routine-plan-missing-root')
  })

  it('keeps CI on the existing verification plan', () => {
    const source = readFileSync(fileURLToPath(new URL('../ci/scoped-verification.ts', import.meta.url)), 'utf8')
    expect(source).toContain('createRepositoryPlan(')
    expect(source).not.toContain('planRoutineVerification')
  })
})
