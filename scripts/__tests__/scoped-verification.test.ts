import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planVerification } from '../ci/verification-plan'
import { executeRepositoryPlan, routinePlanManifest } from '../ci/scoped-verification'
import { FULL_TASK_IDS } from '../ci/verification-tasks'

const identity = {
  baseRef: 'main', headRef: 'HEAD', baseSha: '1'.repeat(40), mergeBaseSha: '1'.repeat(40),
  headSha: '2'.repeat(40), testedSha: '2'.repeat(40), sourceFingerprint: '3'.repeat(64),
}
const consumers = [
  'farm-select', 'choice-previews', 'farm-card-targets', 'desktop-table-layout', 'mobile-game-layout',
  'frontend-browser-scenario-matrix', 'online-interaction-completion', 'interaction-focus', 'mobile-interaction-continuity',
  'hosted-password-login', 'oauth-onboarding', 'room-invitations', 'ws-dual-player',
  'interface-localization', 'interface-localization-fields', 'card-localization',
  'replay-viewer', 'replay-viewer-csp', 'game-context-recovery', 'source-aware-scoring', 'mobile-scoring-pad',
  'game-end', 'draft-opening-order', 'hotseat-public-farms', 'standard-solo-ui', 'setup-navigation',
  'encyclopedia', 'encyclopedia-entry', 'encyclopedia-search', 'encyclopedia-filters',
  'encyclopedia-faces', 'encyclopedia-in-game', 'encyclopedia-pages',
].map(name => `e2e-tests/${name}.spec.ts`)
const inventory = {
  vitest: [{ file: 'client/services/__tests__/gameTransport.test.ts', project: 'fast-client' }],
  browser: consumers,
}

describe('routine verification scope', () => {
  it('retains every owned browser group of the game orchestration entry point', () => {
    const plan = planVerification({
      identity, changes: [{ status: 'M', path: 'client/app/GameContainerApi.tsx' }], inventory,
      fullTaskIds: FULL_TASK_IDS,
    })
    expect(plan.mode).toBe('scoped')
    const browsers = plan.checks.flatMap(check => check.kind === 'browser' ? check.files : [])
    expect(browsers).toEqual(expect.arrayContaining([
      'e2e-tests/game-end.spec.ts', 'e2e-tests/farm-select.spec.ts', 'e2e-tests/choice-previews.spec.ts',
      'e2e-tests/online-interaction-completion.spec.ts', 'e2e-tests/source-aware-scoring.spec.ts', 'e2e-tests/mobile-scoring-pad.spec.ts',
      'e2e-tests/encyclopedia-in-game.spec.ts', 'e2e-tests/encyclopedia-faces.spec.ts',
    ]))
    expect(plan.checks.filter(check => check.kind === 'vitest').map(check => check.project)).toEqual(['fast-client'])
  })
  it.each([
    'hosted-password-login', 'oauth-onboarding', 'workshop-browser-card-tests',
  ])('installs both engines for the embedded browser launches in %s', file => {
    const plan = planVerification({
      identity, changes: [{ status: 'M', path: 'README.md' }],
      inventory: { vitest: [{ file: 'scripts/__tests__/docs-budget.test.ts', project: 'fast-scripts' }], browser: [] },
      fullTaskIds: FULL_TASK_IDS,
    })

    const manifest = routinePlanManifest({ ...plan, checks: [
      { kind: 'browser', browser: 'chromium', files: [`e2e-tests/${file}.spec.ts`], grep: null },
    ] })

    expect(manifest.browsers).toBe('chromium webkit')
  })

  it('runs the complete frontend group and the board browser consumers without backend rule suites', () => {
    const plan = planVerification({
      identity, changes: [{ status: 'M', path: 'client/components/board/FarmBoard.tsx' }],
      inventory: {
        vitest: [
          { file: 'client/components/board/__tests__/FarmBoard.test.tsx', project: 'fast-client' },
          { file: 'client/services/__tests__/gameTransport.test.ts', project: 'fast-client' },
          { file: 'server/__tests__/rules.test.ts', project: 'fast-server' },
        ],
        browser: [
          'e2e-tests/farm-select.spec.ts', 'e2e-tests/choice-previews.spec.ts', 'e2e-tests/farm-card-targets.spec.ts',
          'e2e-tests/desktop-table-layout.spec.ts', 'e2e-tests/mobile-game-layout.spec.ts',
          'e2e-tests/frontend-browser-scenario-matrix.spec.ts',
          'e2e-tests/encyclopedia-faces.spec.ts', 'e2e-tests/encyclopedia-in-game.spec.ts',
        ],
      },
      fullTaskIds: FULL_TASK_IDS,
    })

    expect(plan.mode).toBe('scoped')
    expect(plan.checks).toEqual([
      { kind: 'vitest', project: 'fast-client', files: [
        'client/components/board/__tests__/FarmBoard.test.tsx', 'client/services/__tests__/gameTransport.test.ts',
      ] },
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'browser', browser: 'chromium', files: [
        'e2e-tests/choice-previews.spec.ts', 'e2e-tests/desktop-table-layout.spec.ts',
        'e2e-tests/encyclopedia-faces.spec.ts', 'e2e-tests/encyclopedia-in-game.spec.ts', 'e2e-tests/farm-card-targets.spec.ts',
        'e2e-tests/farm-select.spec.ts', 'e2e-tests/mobile-game-layout.spec.ts',
      ], grep: null },
      { kind: 'browser', browser: 'chromium', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@viewport|@ws' },
      { kind: 'browser', browser: 'webkit', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@webkit' },
    ])
  })

  it.each(['docs/HOW_TO_DEPLOY.md', 'docs/operations/ci-checks.md'])(
    'selects documentation constraints for operational instructions: %s', path => {
      const plan = planVerification({
        identity, changes: [{ status: 'M', path }],
        inventory: { vitest: [{ file: 'scripts/__tests__/docs-budget.test.ts', project: 'fast-scripts' }], browser: [] },
        fullTaskIds: FULL_TASK_IDS,
      })
      expect(plan.mode).toBe('scoped')
      expect(plan.checks).toEqual([{ kind: 'vitest', project: 'fast-scripts', files: ['scripts/__tests__/docs-budget.test.ts'] }])
    },
  )

  it('selects executable Workshop contracts for the generation prompt', () => {
    const plan = planVerification({
      identity, changes: [{ status: 'M', path: 'docs/prompts/card-generation.md' }],
      inventory: { vitest: [
        { file: 'scripts/__tests__/docs-budget.test.ts', project: 'fast-scripts' },
        { file: 'server/__tests__/workshop-timing-payment-session.test.ts', project: 'fast-server' },
        { file: 'server/__tests__/workshop-composed-behaviors-session.test.ts', project: 'fast-server' },
      ], browser: [] }, fullTaskIds: FULL_TASK_IDS,
    })
    expect(plan.mode).toBe('scoped')
    expect(plan.checks).toEqual([
      { kind: 'vitest', project: 'fast-server', files: [
        'server/__tests__/workshop-composed-behaviors-session.test.ts', 'server/__tests__/workshop-timing-payment-session.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-scripts', files: ['scripts/__tests__/docs-budget.test.ts'] },
    ])
  })

  it.each([
    { path: 'client/services/gameTransport.ts', files: ['encyclopedia', 'encyclopedia-entry', 'encyclopedia-in-game', 'hosted-password-login', 'oauth-onboarding', 'room-invitations', 'ws-dual-player'], tag: '@ws' },
    { path: 'client/contexts/__tests__/LocaleContext.test.tsx', files: ['card-localization', 'encyclopedia', 'encyclopedia-pages', 'encyclopedia-search', 'interface-localization', 'interface-localization-fields'], tag: '@locale' },
    { path: 'client/components/interaction/InteractionBar.tsx', files: ['choice-previews', 'encyclopedia-in-game', 'interaction-focus', 'mobile-interaction-continuity', 'online-interaction-completion'], tag: '@viewport|@ws' },
    { path: 'client/components/board/ScoringPad.tsx', files: ['choice-previews', 'desktop-table-layout', 'encyclopedia-faces', 'encyclopedia-in-game', 'farm-card-targets', 'farm-select', 'mobile-game-layout', 'mobile-scoring-pad', 'source-aware-scoring'], tag: '@viewport|@ws' },
    { path: 'replay-viewer/src/ReplayBoard.tsx', files: ['game-context-recovery', 'replay-viewer', 'replay-viewer-csp'], tag: '@webkit' },
  ])('selects declared module consumers for $path', ({ path, files, tag }) => {
    const plan = planVerification({ identity, changes: [{ status: 'M', path }], inventory, fullTaskIds: FULL_TASK_IDS })
    expect(plan.mode).toBe('scoped')
    expect(plan.checks).toContainEqual({ kind: 'browser', browser: 'chromium', files: files.map(file => `e2e-tests/${file}.spec.ts`).sort(), grep: null })
    expect(plan.checks.some(check => check.kind === 'browser' && check.grep === tag)).toBe(true)
    expect(plan.checks).not.toContainEqual({ kind: 'catalog', taskId: 'fast' })
    expect(plan.checks).not.toContainEqual({ kind: 'catalog', taskId: 'slow' })
  })

  it.each([
    { path: 'client/components/header/GameHeader.tsx', files: ['encyclopedia-in-game'], safari: false },
    { path: 'client/app/draft/DraftOverlay.tsx', files: ['encyclopedia-in-game'], safari: false },
    { path: 'client/app/parents/ParentSelectionOverlay.tsx', files: ['encyclopedia-in-game'], safari: false },
    { path: 'client/app/interaction-focus.ts', files: ['encyclopedia-in-game'], safari: false },
    { path: 'client/components/board/FarmGroundSprite.tsx', files: ['encyclopedia-faces', 'encyclopedia-in-game'], safari: false },
    { path: 'client/components/board/SeasonBoardPieces.tsx', files: ['encyclopedia-faces', 'encyclopedia-in-game'], safari: false },
    { path: 'client/components/board/SpecialActionCardFace.tsx', files: ['encyclopedia-faces', 'encyclopedia-in-game'], safari: false },
    { path: 'client/app/LobbyPage.tsx', files: ['encyclopedia', 'encyclopedia-entry', 'encyclopedia-in-game'], safari: true },
    { path: 'client/app/PageRouter.tsx', files: ['encyclopedia', 'encyclopedia-entry', 'encyclopedia-in-game'], safari: true },
    { path: 'client/hooks/useGameSync.ts', files: ['encyclopedia', 'encyclopedia-entry', 'encyclopedia-in-game'], safari: true },
    { path: 'client/services/language-pack.ts', files: ['encyclopedia', 'encyclopedia-pages', 'encyclopedia-search'], safari: true },
  ])('retains the complete encyclopedia consumers of the existing frontend seam $path', ({ path, files, safari }) => {
    const plan = planVerification({ identity, changes: [{ status: 'M', path }], inventory, fullTaskIds: FULL_TASK_IDS })
    expect(plan.mode).toBe('scoped')
    expect(plan.checks.flatMap(check => check.kind === 'browser' && check.browser === 'chromium' && check.grep === null
      ? check.files.filter(file => file.startsWith('e2e-tests/encyclopedia')) : []))
      .toEqual(files.map(file => `e2e-tests/${file}.spec.ts`).sort())
    expect(plan.checks).toContainEqual({
      kind: 'browser', browser: 'webkit', grep: '@webkit', files: safari
        ? ['e2e-tests/encyclopedia.spec.ts', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts']
        : ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'],
    })
  })

  it.each([
    'client/components/unowned/Widget.tsx', 'shared/cards/A/A029_AleBenches.ts',
    'client/components/board/__tests__/fixtures.ts', 'replay-viewer/vite.config.ts',
  ])('retains full fallback for unknown ownership or shared configuration: %s', path => {
    const plan = planVerification({ identity, changes: [{ status: 'M', path }], inventory, fullTaskIds: FULL_TASK_IDS })
    expect(plan.mode).toBe('full')
    expect(plan.checks).toEqual([
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'fast' },
      { kind: 'catalog', taskId: 'slow' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'catalog', taskId: 'chromium-1' }, { kind: 'catalog', taskId: 'chromium-2' },
      { kind: 'catalog', taskId: 'chromium-3' }, { kind: 'catalog', taskId: 'chromium-4' },
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
    ])
  })

  it.each(['client/components/common/Button.tsx', 'client/styles/tokens.css'])(
    'widens shared presentation to the complete browser layer: %s', path => {
      const plan = planVerification({ identity, changes: [{ status: 'M', path }], inventory, fullTaskIds: FULL_TASK_IDS })
      expect(plan.mode).toBe('scoped')
      expect(plan.checks).toContainEqual({ kind: 'browser', browser: 'chromium', files: [...consumers].sort(), grep: null })
      expect(plan.checks).toContainEqual({ kind: 'catalog', taskId: 'webkit' })
      expect(plan.checks).toContainEqual({ kind: 'vitest', project: 'fast-client', files: ['client/services/__tests__/gameTransport.test.ts'] })
    },
  )

  it.each([
    'client/App.tsx', 'client/App.css', 'client/main.tsx', 'client/app/AppErrorBoundary.tsx',
    'client/app/AppShellLoadScreen.tsx', 'client/app/GameContextRouter.tsx', 'client/app/game-load-progress.ts',
  ])('runs the complete browser layer for the shared application entry %s', path => {
    const plan = planVerification({ identity, changes: [{ status: 'M', path }], inventory, fullTaskIds: FULL_TASK_IDS })
    expect(plan.mode).toBe('scoped')
    expect(plan.checks).toContainEqual({ kind: 'browser', browser: 'chromium', files: [...consumers].sort(), grep: null })
    expect(plan.checks).toContainEqual({ kind: 'catalog', taskId: 'webkit' })
    expect(plan.checks.filter(check => check.kind === 'vitest').map(check => check.project)).toEqual(['fast-client'])
  })

  it.each([
    { paths: ['client/App.tsx', 'client/styles/tokens.css'] }, { paths: ['client/styles/tokens.css', 'client/App.tsx'] },
  ])('keeps the shared WebKit catalog when app and shared presentation changes are mixed: $paths', ({ paths }) => {
    const plan = planVerification({ identity, changes: paths.map(path => ({ status: 'M', path })), inventory, fullTaskIds: FULL_TASK_IDS })
    expect(plan.mode).toBe('scoped')
    expect(plan.checks).toContainEqual({ kind: 'catalog', taskId: 'webkit' })
  })

  it.each([
    { path: 'client/components/header/GameHeader.tsx', consumer: 'encyclopedia-in-game' },
    { path: 'client/components/board/SpecialActionCardFace.tsx', consumer: 'encyclopedia-faces' },
    { path: 'client/app/PageRouter.tsx', consumer: 'encyclopedia-entry' },
    { path: 'client/contexts/LocaleContext.tsx', consumer: 'encyclopedia-pages' },
    { path: 'client/main.tsx', consumer: 'encyclopedia' },
    { path: 'client/App.tsx', consumer: 'replay-viewer-csp' },
  ])('rejects the missing declared encyclopedia consumer $consumer for $path', ({ path, consumer }) => {
    expect(() => planVerification({
      identity, changes: [{ status: 'M', path }],
      inventory: { ...inventory, browser: consumers.filter(file => file !== `e2e-tests/${consumer}.spec.ts`) },
      fullTaskIds: FULL_TASK_IDS,
    })).toThrow(`Declared frontend browser consumers are missing: e2e-tests/${consumer}.spec.ts`)
  })

  it.each([
    { paths: ['client/components/header/GameHeader.tsx', 'client/components/unowned/Widget.tsx'] },
    { paths: ['client/components/unowned/Widget.tsx', 'client/components/header/GameHeader.tsx'] },
  ])('does not hide a missing declared frontend consumer behind an unknown path: $paths', ({ paths }) => {
    expect(() => planVerification({
      identity, changes: paths.map(path => ({ status: 'M', path })),
      inventory: { ...inventory, browser: consumers.filter(file => file !== 'e2e-tests/encyclopedia-in-game.spec.ts') },
      fullTaskIds: FULL_TASK_IDS,
    })).toThrow('Declared frontend browser consumers are missing: e2e-tests/encyclopedia-in-game.spec.ts')
  })

  it.each(['client/app/workshop/Prompt.tsx', 'server/game/room.ts', 'shared/contract/interaction.ts'])(
    'rejects incomplete declared business consumers for %s', path => {
      expect(() => planVerification({ identity, changes: [{ status: 'M', path }], inventory, fullTaskIds: FULL_TASK_IDS }))
        .toThrow('Required consumers for ')
    },
  )

  it('rejects a missing declared browser consumer', () => {
    expect(() => planVerification({
      identity, changes: [{ status: 'M', path: 'client/components/board/FarmBoard.tsx' }],
      inventory: { ...inventory, browser: consumers.filter(file => file !== 'e2e-tests/farm-select.spec.ts') }, fullTaskIds: FULL_TASK_IDS,
    })).toThrow('Declared frontend browser consumers are missing: e2e-tests/farm-select.spec.ts')
  })
})

const executionDirectories: string[] = []
afterEach(() => {
  executionDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
  vi.unstubAllEnvs()
})

function executionFixture(change: 'card' | 'script-database' | 'script-pure' | 'script-dynamic' | 'documentation' = 'card') {
  vi.stubEnv('GITHUB_SHA', '')
  vi.stubEnv('GITHUB_OUTPUT', '')
  vi.stubEnv('GITHUB_STEP_SUMMARY', '')
  const cwd = mkdtempSync(join(tmpdir(), 'scoped-execution-'))
  executionDirectories.push(cwd)
  const write = (file: string, contents: string) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true })
    writeFileSync(join(cwd, file), contents)
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  for (const directory of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) write(`${directory}/.keep`, '')
  write('.gitignore', 'output/\n')
  write('shared/cards/A/A029_AleBenches.ts', "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches', cost: { wood: 1 } } })\n")
  write('shared/cards/__tests__/A29_AleBenches.test.ts', "import '../A/A029_AleBenches'\n")
  write('server/__tests__/cross-card-session.test.ts', "const card = 'A029_AleBenches'\n")
  write('server/__tests__/A029_AleBenches-session.test.ts', "const card = 'A029_AleBenches'\n")
  for (const name of ['card-localization', 'choice-previews', 'farm-card-targets', 'frontend-browser-scenario-matrix']) {
    write(`e2e-tests/${name}.spec.ts`, '// generic card consumer\n')
  }
  write('README.md', 'Guide\n')
  if (change === 'documentation') write('scripts/__tests__/docs-budget.test.ts', "import { readFileSync } from 'node:fs'\nconst bytes = readFileSync('README.md', 'utf8')\n")
  if (change.startsWith('script-')) {
    const contents = change === 'script-database' ? "import { createDatabase } from './_helpers/import-fixture'\ncreateDatabase()\n"
      : change === 'script-dynamic' ? 'await import(inputPath)\n' : 'const formatted = true\n'
    write('scripts/__tests__/script-consumer.test.ts', contents)
    if (change === 'script-database') {
      write('scripts/__tests__/_helpers/import-fixture.ts', "import { createTestDatabase } from '../../../server/__tests__/_helpers/postgres'\nexport const createDatabase = createTestDatabase\n")
      write('server/__tests__/_helpers/postgres.ts', 'export const createTestDatabase = () => ({})\n')
    }
  }
  write('package.json', '{}\n')
  git('init', '-q', '--template=', '-b', 'main')
  git('add', '--', '.', ':(exclude)docs/superpowers/**')
  git('-c', 'user.name=Scope', '-c', 'user.email=scope@example.test', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline')
  git('checkout', '-qb', 'feature')
  if (change === 'card') write('shared/cards/A/A029_AleBenches.ts', "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches', cost: { wood: 2 } } })\n")
  else if (change === 'documentation') write('README.md', 'Updated guide\n')
  else writeFileSync(join(cwd, 'scripts/__tests__/script-consumer.test.ts'), readFileSync(join(cwd, 'scripts/__tests__/script-consumer.test.ts'), 'utf8') + '// regression assertion\n')
  git('add', '--', '.', ':(exclude)docs/superpowers/**')
  git('-c', 'user.name=Scope', '-c', 'user.email=scope@example.test', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', change)
  const output = join(cwd, 'output/verification/scoped-result.json')
  return { cwd, output, execute: (run: (command: string, args: string[], cwd: string) => number) =>
    executeRepositoryPlan({ cwd, base: 'main', head: 'HEAD', partition: 'units', output }, run) }
}

function writeRunnerReport(cwd: string, args: string[], names?: string[]) {
  const argument = args.find(arg => arg.startsWith('--outputFile.json='))
  if (!argument) return
  const files = names ?? args.filter(arg => /\.test\.[cm]?[jt]sx?$/.test(arg))
  writeFileSync(argument.slice('--outputFile.json='.length), JSON.stringify({
    success: true, numFailedTests: 0, numFailedTestSuites: 0, numPendingTestSuites: 0,
    testResults: files.map(file => ({ name: join(cwd, file), status: 'passed', assertionResults: [{ status: 'passed' }] })),
  }))
}

describe('scoped check execution', () => {
  it.each(['script-database', 'script-dynamic'] as const)('prepares services once for an independently selected %s consumer', change => {
    const value = executionFixture(change)
    const result = value.execute((_command, args, cwd) => { writeRunnerReport(cwd, args); return 0 })

    expect(result.status).toBe('passed')
    expect(result.checks.map(entry => entry.check)).toEqual([{
      kind: 'vitest', project: 'fast-scripts', files: ['scripts/__tests__/script-consumer.test.ts'],
    }])
    expect(result.preparation.map(command => command.args)).toEqual([
      ['scripts/local-services.mjs', '--test'], ['run', 'build:cards-manifest'],
    ])
  })

  it.each(['documentation', 'script-pure'] as const)('keeps %s verification free of unused services', change => {
    const value = executionFixture(change)
    const result = value.execute((_command, args, cwd) => { writeRunnerReport(cwd, args); return 0 })

    expect(result.status).toBe('passed')
    expect(result.preparation.map(command => command.args)).toEqual([['run', 'build:cards-manifest']])
    expect(result.checks.map(entry => entry.check)).toEqual([{
      kind: 'vitest', project: 'fast-scripts', files: [change === 'documentation' ? 'scripts/__tests__/docs-budget.test.ts' : 'scripts/__tests__/script-consumer.test.ts'],
    }])
  })

  it('prepares services and the manifest once while retaining every complete project check and measured command', () => {
    const value = executionFixture()
    const result = value.execute((_command, args, cwd) => {
      writeRunnerReport(cwd, args)
      return 0
    })
    expect(result.status).toBe('passed')
    expect(result.preparation.map(command => command.args)).toEqual([
      ['scripts/local-services.mjs', '--test'], ['run', 'build:cards-manifest'],
    ])
    expect(result.checks.map(entry => entry.check)).toEqual([
      { kind: 'vitest', project: 'fast-cards', files: ['shared/cards/__tests__/A29_AleBenches.test.ts'] },
      { kind: 'vitest', project: 'fast-server', files: ['server/__tests__/cross-card-session.test.ts'] },
      { kind: 'vitest', project: 'slow', files: ['server/__tests__/A029_AleBenches-session.test.ts'] },
    ])
    const commands = result.checks.flatMap(check => check.commands)
    expect(new Set(commands.map(command => command.args.find(arg => arg.startsWith('--outputFile.json=')))).size).toBe(3)
    for (const command of commands) {
      expect(command.args).toContain('--reporter=default')
      expect(command.args).toContain('--reporter=json')
      expect(command.args.filter(arg => arg === '--project')).toHaveLength(1)
    }
    for (const command of [...result.preparation, ...result.checks.flatMap(check => check.commands)]) {
      expect(command).toMatchObject({ exitCode: 0, startedAt: expect.any(String), completedAt: expect.any(String), durationMs: expect.any(Number) })
      expect(Date.parse(command.completedAt)).toBeGreaterThanOrEqual(Date.parse(command.startedAt))
      expect(command.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it.each(['nonzero exit', 'runner exception'])('retains preparation timing after %s', scenario => {
    const value = executionFixture()
    expect(() => value.execute(() => {
      if (scenario === 'runner exception') throw new Error('spawn failed')
      return 7
    })).toThrow()
    expect(JSON.parse(readFileSync(value.output, 'utf8'))).toMatchObject({
      status: 'failed', checks: [], preparation: [{
        exitCode: scenario === 'runner exception' ? null : 7,
        startedAt: expect.any(String), completedAt: expect.any(String), durationMs: expect.any(Number),
        ...(scenario === 'runner exception' ? { error: 'spawn failed' } : {}),
      }],
    })
  })

  it.each(['missing report', 'missing selected file', 'extra substring match', 'duplicate module', 'failed command'])(
    'rejects %s before publishing successful completion', scenario => {
      const value = executionFixture()
      expect(() => value.execute((_command, args, cwd) => {
        if (!args.includes('vitest')) return 0
        if (scenario === 'missing report') return 0
        const files = args.filter(arg => /\.test\.[cm]?[jt]sx?$/.test(arg))
        if (scenario === 'missing selected file') writeRunnerReport(cwd, args, [])
        else if (scenario === 'extra substring match') writeRunnerReport(cwd, args, [...files, `copy/${files[0]}`])
        else if (scenario === 'duplicate module') writeRunnerReport(cwd, args, [...files, ...files])
        else writeRunnerReport(cwd, args)
        return scenario === 'failed command' ? 7 : 0
      })).toThrow()
      const record: unknown = JSON.parse(readFileSync(value.output, 'utf8'))
      expect(record).toMatchObject({ status: 'failed', checks: [{ status: 'failed' }] })
    },
  )

  it('does not reuse a previous successful report when the next execution produces none', () => {
    const value = executionFixture()
    expect(value.execute((_command, args, cwd) => { writeRunnerReport(cwd, args); return 0 }).status).toBe('passed')
    expect(() => value.execute(() => 0)).toThrow()
    expect(JSON.parse(readFileSync(value.output, 'utf8'))).toMatchObject({ status: 'failed', checks: [{ status: 'failed' }] })
  })
})
