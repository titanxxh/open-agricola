import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { planRoutineVerification } from '../ci/routine-verification-plan'
import { FULL_TASK_IDS } from '../ci/verification-tasks'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const routineBrowserSmokeSet = [
  { file: 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', grep: '@viewport' },
  { file: 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', grep: '@webkit' },
  { file: 'e2e-tests/hosted-password-login.spec.ts', grep: 'password session' },
  { file: 'e2e-tests/ws-dual-player.spec.ts', grep: 'create room' },
]
const replayViewerSpecs = [
  { file: 'e2e-tests/replay-viewer-csp.spec.ts', grep: null },
  { file: 'e2e-tests/replay-viewer.spec.ts', grep: null },
]

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

  it('widens unparseable browser evidence to the routine browser smoke set', () => {
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
    expect(plan.browserFiles).toEqual(routineBrowserSmokeSet)
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

  it('selects a browser spec whose covers declaration matches the changed path', () => {
    const root = writeTree({
      'client/components/board/tile.ts': 'export const tile = 1\n',
      'client/components/board/panel.ts': "import { tile } from './tile'\nexport const panel = tile\n",
      'client/components/header/bar.ts': 'export const bar = 1\n',
      'client/somewhere/marker.ts': 'export const marker = 1\n',
      'e2e-tests/board.spec.ts': '// @covers client/components/board/\nexport const board = 1\n',
      'e2e-tests/header.spec.ts': '// @covers client/components/header/\nexport const header = 1\n',
      'e2e-tests/extra.spec.ts': "// @covers client/somewhere/\nimport { panel } from '../client/components/board/panel'\nexport const used = panel\n",
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/components/board/tile.ts' }],
    })
    const edited = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'e2e-tests/board.spec.ts' }],
    })

    expect(plan.browserFiles).toEqual([{ file: 'e2e-tests/board.spec.ts', grep: null }])
    expect(plan.fullTrigger).toBe(false)
    expect(edited.browserFiles).toEqual([{ file: 'e2e-tests/board.spec.ts', grep: null }])
  })

  it('warns about a covers prefix that matches no file and does not widen selection', () => {
    const root = writeTree({
      'client/components/board/tile.ts': 'export const tile = 1\n',
      'e2e-tests/board.spec.ts': '// @covers client/components/board/\n// @covers client/missing/\nexport const board = 1\n',
      'e2e-tests/wide.spec.ts': 'export const wide = 1\n',
      'e2e-tests/filler.spec.ts': 'export const filler = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/components/board/tile.ts' }],
    })

    expect(plan.browserFiles).toEqual([{ file: 'e2e-tests/board.spec.ts', grep: null }])
    expect(plan.warnings).toEqual([
      "e2e-tests/board.spec.ts: @covers prefix 'client/missing/' matches no file",
    ])
    expect(plan.fullTrigger).toBe(false)
  })

  it('selects a spec with no covers declaration only when it changes or directly imports the changed file', () => {
    const root = writeTree({
      'client/board/tile.ts': 'export const tile = 1\nexport type Tile = number\n',
      'client/board/other.ts': 'export const other = 1\n',
      'e2e-tests/direct.spec.ts': "import { tile } from '../client/board/tile'\nexport const used = tile\n",
      'e2e-tests/typed.spec.ts': "import type { Tile } from '../client/board/tile'\nexport const marker: Tile = 1\n",
      'e2e-tests/plain.spec.ts': 'export const plain = 1\n',
    })

    const imported = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/board/tile.ts' }],
    })
    const self = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'e2e-tests/plain.spec.ts' }],
    })
    const untouched = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/board/other.ts' }],
    })

    expect(imported.browserFiles).toEqual([{ file: 'e2e-tests/direct.spec.ts', grep: null }])
    expect(imported.warnings).toEqual([])
    expect(self.browserFiles).toEqual([{ file: 'e2e-tests/plain.spec.ts', grep: null }])
    expect(untouched.browserFiles).toEqual([])
    expect(untouched.warnings).toEqual([])
  })

  it('does not select a spec that imports the changed file only through a shared test helper', () => {
    const root = writeTree({
      'client/board/tile.ts': 'export const tile = 1\n',
      'e2e-tests/helpers/board.ts': "import { tile } from '../../client/board/tile'\nexport const used = tile\n",
      'e2e-tests/board.spec.ts': "import { used } from './helpers/board'\nexport const spec = used\n",
      'e2e-tests/direct.spec.ts': "import { tile } from '../client/board/tile'\nexport const used = tile\n",
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/board/tile.ts' }],
    })

    expect(plan.browserFiles).toEqual([{ file: 'e2e-tests/direct.spec.ts', grep: null }])
  })

  it('stops the importer walk at the first file with a covers declaration', () => {
    const root = writeTree({
      'client/feature/widget.ts': 'export const widget = 1\n',
      'client/feature/panel.ts': "import { widget } from './widget'\nexport const panel = widget\n",
      'client/unrelated/marker.ts': 'export const marker = 1\n',
      'client/also-unrelated/marker.ts': 'export const marker = 1\n',
      'e2e-tests/near.spec.ts': "// @covers client/unrelated/\nimport { panel } from '../client/feature/panel'\nexport const used = panel\n",
      'e2e-tests/far.spec.ts': "// @covers client/also-unrelated/\nimport { used } from './near.spec'\nexport const far = used\n",
      'e2e-tests/filler.spec.ts': 'export const filler = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/feature/widget.ts' }],
    })
    const throughNear = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'e2e-tests/near.spec.ts' }],
    })

    expect(plan.browserFiles).toEqual([{ file: 'e2e-tests/near.spec.ts', grep: null }])
    expect(throughNear.browserFiles).toEqual([
      { file: 'e2e-tests/far.spec.ts', grep: null },
      { file: 'e2e-tests/near.spec.ts', grep: null },
    ])
  })

  it('uses the routine browser smoke set when the walk reaches the main app entry or the matched specs exceed one third', () => {
    const mainRoot = writeTree({
      'client/feature/widget.ts': 'export const widget = 1\n',
      'client/app/shell.ts': "import { widget } from '../feature/widget'\nexport const shell = widget\n",
      'client/main.tsx': "import { shell } from './app/shell'\nexport const main = shell\n",
      'client/unrelated/marker.ts': 'export const marker = 1\n',
      'e2e-tests/app.spec.ts': "// @covers client/unrelated/\nimport { main } from '../client/main'\nexport const used = main\n",
      'e2e-tests/filler.spec.ts': 'export const filler = 1\n',
      'e2e-tests/filler-b.spec.ts': 'export const filler = 1\n',
    })
    const thirdRoot = writeTree({
      'client/components/board/tile.ts': 'export const tile = 1\n',
      'client/components/header/bar.ts': 'export const bar = 1\n',
      'e2e-tests/a.spec.ts': '// @covers client/components/board/\nexport const a = 1\n',
      'e2e-tests/b.spec.ts': '// @covers client/components/board/\nexport const b = 1\n',
      'e2e-tests/c.spec.ts': '// @covers client/components/header/\nexport const c = 1\n',
    })
    const walkRoot = writeTree({
      'client/feature/widget.ts': 'export const widget = 1\n',
      'client/a/marker.ts': 'export const marker = 1\n',
      'client/b/marker.ts': 'export const marker = 1\n',
      'client/c/marker.ts': 'export const marker = 1\n',
      'e2e-tests/walk-a.spec.ts': "// @covers client/a/\nimport { widget } from '../client/feature/widget'\nexport const used = widget\n",
      'e2e-tests/walk-b.spec.ts': "// @covers client/b/\nimport { widget } from '../client/feature/widget'\nexport const used = widget\n",
      'e2e-tests/walk-c.spec.ts': "// @covers client/c/\nimport { widget } from '../client/feature/widget'\nexport const used = widget\n",
    })
    const durations = JSON.parse(readFileSync(fileURLToPath(new URL('../ci/verification-durations.json', import.meta.url)), 'utf8')) as Record<string, number>

    const main = planRoutineVerification({
      root: mainRoot,
      changes: [{ status: 'M', path: 'client/feature/widget.ts' }],
    })
    const broad = planRoutineVerification({
      root: thirdRoot,
      changes: [{ status: 'M', path: 'client/components/board/tile.ts' }],
    })
    const narrow = planRoutineVerification({
      root: thirdRoot,
      changes: [{ status: 'M', path: 'client/components/header/bar.ts' }],
    })
    const walked = planRoutineVerification({
      root: walkRoot,
      changes: [{ status: 'M', path: 'client/feature/widget.ts' }],
    })

    expect(main.browserFiles).toEqual(routineBrowserSmokeSet)
    expect(main.browserFiles.length).toBeLessThanOrEqual(5)
    const smokeFiles = [...new Set(main.browserFiles.map(entry => entry.file))]
    const smokeDuration = smokeFiles.reduce((total, file) => total + durations[file], 0)
    expect(smokeDuration).toBeGreaterThanOrEqual(90_000)
    expect(smokeDuration).toBeLessThanOrEqual(150_000)
    for (const entry of main.browserFiles) {
      expect(entry.grep).toEqual(expect.any(String))
      const source = readFileSync(fileURLToPath(new URL(`../../${entry.file}`, import.meta.url)), 'utf8')
      expect(source).toContain(entry.grep)
      if (durations[entry.file] >= 30_000) {
        const headings = source.split('\n').filter(line => /^\s*test(?:\.describe)?\(/.test(line))
        expect(headings.some(line => !line.includes(entry.grep ?? ''))).toBe(true)
      }
    }
    expect(broad.browserFiles).toEqual(routineBrowserSmokeSet)
    expect(narrow.browserFiles).toEqual([{ file: 'e2e-tests/c.spec.ts', grep: null }])
    expect(walked.browserFiles).toEqual(routineBrowserSmokeSet)
  })

  it('selects the replay viewer specs when the walk reaches the replay viewer entry', () => {
    const root = writeTree({
      'replay-viewer/src/pane.ts': 'export const pane = 1\n',
      'replay-viewer/src/main.tsx': "import { pane } from './pane'\nexport const main = pane\n",
      'e2e-tests/other.spec.ts': 'export const other = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'replay-viewer/src/pane.ts' }],
    })
    const entry = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'replay-viewer/src/main.tsx' }],
    })

    expect(plan.browserFiles).toEqual(replayViewerSpecs)
    expect(entry.browserFiles).toEqual(replayViewerSpecs)
  })

  it('keeps walking past the sandbox app until it finds a covers declaration', () => {
    const root = writeTree({
      'client/feature/widget.ts': 'export const widget = 1\n',
      'client/sandbox/SandboxApp.tsx': "import { widget } from '../feature/widget'\nexport const sandbox = widget\n",
      'client/shell/app.ts': "import { sandbox } from '../sandbox/SandboxApp'\nexport const app = sandbox\n",
      'client/shell/marker.ts': 'export const marker = 1\n',
      'e2e-tests/shell.spec.ts': "// @covers client/shell/\nimport { app } from '../client/shell/app'\nexport const used = app\n",
      'e2e-tests/filler.spec.ts': 'export const filler = 1\n',
      'e2e-tests/filler-b.spec.ts': 'export const filler = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'client/feature/widget.ts' }],
    })

    expect(plan.browserFiles).toEqual([{ file: 'e2e-tests/shell.spec.ts', grep: null }])
  })

  it('selects both the smoke set and the replay viewer specs when the walk reaches both entries', () => {
    const root = writeTree({
      'shared/util/value.ts': 'export const value = 1\n',
      'client/app/shell.ts': "import { value } from '../../shared/util/value'\nexport const shell = value\n",
      'client/main.tsx': "import { shell } from './app/shell'\nexport const main = shell\n",
      'replay-viewer/src/app.ts': "import { value } from '../../shared/util/value'\nexport const app = value\n",
      'replay-viewer/src/main.tsx': "import { app } from './app'\nexport const main = app\n",
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'M', path: 'shared/util/value.ts' }],
    })

    expect(plan.browserFiles).toEqual([
      { file: 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', grep: '@viewport' },
      { file: 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', grep: '@webkit' },
      { file: 'e2e-tests/hosted-password-login.spec.ts', grep: 'password session' },
      { file: 'e2e-tests/replay-viewer-csp.spec.ts', grep: null },
      { file: 'e2e-tests/replay-viewer.spec.ts', grep: null },
      { file: 'e2e-tests/ws-dual-player.spec.ts', grep: 'create room' },
    ])
  })

  it('selects no browser spec for a new file that nothing imports', () => {
    const root = writeTree({
      'client/feature/new-widget.ts': 'export const widget = 1\n',
      'client/components/board/tile.ts': 'export const tile = 1\n',
      'e2e-tests/board.spec.ts': '// @covers client/components/board/\nexport const board = 1\n',
    })

    const plan = planRoutineVerification({
      root,
      changes: [{ status: 'A', path: 'client/feature/new-widget.ts' }],
    })

    expect(plan.browserFiles).toEqual([])
    expect(plan.warnings).toEqual([])
    expect(plan.fullTrigger).toBe(false)
  })

  it('selects repository browser evidence from covers, entries, and the smoke set', () => {
    const board = [
      'e2e-tests/a040-clay-positions.spec.ts',
      'e2e-tests/action-log-source.spec.ts',
      'e2e-tests/action-space-icons.spec.ts',
      'e2e-tests/action-space-use.spec.ts',
      'e2e-tests/apiary-sow-budget.spec.ts',
      'e2e-tests/card-cost-icons.spec.ts',
      'e2e-tests/card-state-presentation.spec.ts',
      'e2e-tests/crop-scoring.spec.ts',
      'e2e-tests/encyclopedia-in-game.spec.ts',
      'e2e-tests/expansion-display.spec.ts',
      'e2e-tests/farm-card-targets.spec.ts',
      'e2e-tests/farm-interaction-focus.spec.ts',
      'e2e-tests/farm-select.spec.ts',
      'e2e-tests/frontend-browser-scenario-matrix.spec.ts',
      'e2e-tests/garden-path-marker.spec.ts',
      'e2e-tests/grain-distillery-scoring.spec.ts',
      'e2e-tests/hotseat-public-farms.spec.ts',
      'e2e-tests/issue1201-lover-settlement.spec.ts',
      'e2e-tests/mobile-scoring-pad.spec.ts',
      'e2e-tests/played-card-chronology.spec.ts',
      'e2e-tests/room-animal-holders.spec.ts',
      'e2e-tests/seasons-worker-icons.spec.ts',
      'e2e-tests/source-aware-scoring.spec.ts',
      'e2e-tests/special-actions-localization.spec.ts',
      'e2e-tests/visual-support-regression.spec.ts',
      'scripts/test-actions.spec.ts',
    ].map(file => ({ file, grep: null }))
    const farm = planRoutineVerification({
      root: repoRoot,
      changes: [{ status: 'M', path: 'client/components/board/FarmBoard.tsx' }],
    })
    const main = planRoutineVerification({
      root: repoRoot,
      changes: [{ status: 'M', path: 'client/main.tsx' }],
    })
    const replay = planRoutineVerification({
      root: repoRoot,
      changes: [{ status: 'M', path: 'replay-viewer/src/main.tsx' }],
    })

    expect(farm.fullTrigger).toBe(false)
    expect(farm.warnings.filter(warning => warning.includes('@covers'))).toEqual([])
    expect(farm.browserFiles).toEqual(board)
    expect(main.fullTrigger).toBe(false)
    expect(main.browserFiles).toEqual(routineBrowserSmokeSet)
    expect(replay.fullTrigger).toBe(false)
    expect(replay.browserFiles).toEqual(replayViewerSpecs)
  }, 60_000)

  it('keeps CI on the existing verification plan', () => {
    const source = readFileSync(fileURLToPath(new URL('../ci/scoped-verification.ts', import.meta.url)), 'utf8')
    expect(source).toContain('createRepositoryPlan(')
    expect(source).not.toContain('planRoutineVerification')
  })
})
