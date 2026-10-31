import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { assertPlanCurrent, createRepositoryPlan, planVerification, type ChangedPath } from '../ci/verification-plan'
import { businessScopeFor } from '../ci/business-verification'

const identity = {
  baseRef: 'main', headRef: 'HEAD',
  baseSha: '1111111111111111111111111111111111111111',
  mergeBaseSha: '1111111111111111111111111111111111111111',
  headSha: '2222222222222222222222222222222222222222',
  testedSha: '2222222222222222222222222222222222222222',
  sourceFingerprint: '3333333333333333333333333333333333333333333333333333333333333333',
}

describe('verification scope planning', () => {
  it('selects the document constraint tests for an ordinary documentation change', () => {
    const plan = planVerification({
      identity,
      changes: [{ status: 'M', path: 'README.md' }],
      inventory: {
        vitest: [{ file: 'scripts/__tests__/docs-budget.test.ts', project: 'fast-scripts' }],
        browser: [],
      },
      fullTaskIds: ['quality', 'fast', 'slow', 'build', 'chromium-1'],
    })

    expect(plan.mode).toBe('scoped')
    expect(plan.checks).toEqual([{
      kind: 'vitest', project: 'fast-scripts', files: ['scripts/__tests__/docs-budget.test.ts'],
    }])
    expect(plan.selections).toEqual([{
      scope: 'documentation', paths: ['README.md'],
      reason: 'Ordinary documentation requires documentation constraints.',
    }])
    expect(plan.identity).toEqual(identity)
  })

  it('expands an unclassified source change to every canonical full task', () => {
    const plan = planVerification({
      identity, changes: [{ status: 'A', path: 'new-service/handler.ts' }],
      inventory: { vitest: [], browser: [] },
      fullTaskIds: ['quality', 'fast', 'slow', 'build', 'chromium-1'],
    })

    expect(plan.mode).toBe('full')
    expect(plan.checks).toEqual([
      { kind: 'catalog', taskId: 'quality' },
      { kind: 'catalog', taskId: 'fast' },
      { kind: 'catalog', taskId: 'slow' },
      { kind: 'catalog', taskId: 'build' },
      { kind: 'catalog', taskId: 'chromium-1' },
    ])
    expect(plan.selections).toEqual([{
      scope: 'unknown', paths: ['new-service/handler.ts'], reason: 'Unclassified ownership requires full verification.',
    }])
  })

  it('explains the complete mixed diff, including both sides of a rename and runtime-readable docs', () => {
    const plan = planVerification({
      identity,
      changes: [
        { status: 'R', previousPath: 'README.md', path: 'client/components/Help.tsx' },
        { status: 'M', path: 'shared/cards/A/A029_AleBenches.ts' },
        { status: 'M', path: 'server/game/room.ts' },
        { status: 'M', path: 'shared/actions/payment/solver.ts' },
        { status: 'D', path: 'shared/contract/interaction.ts' },
        { status: 'M', path: 'docs/CUSTOM_CARD_SANDBOX.md' },
        { status: 'M', path: 'package.json' },
      ],
      inventory: {
        vitest: [
          { file: 'scripts/__tests__/docs-budget.test.ts', project: 'fast-scripts' },
          { file: 'scripts/__tests__/card-encyclopedia-artifacts.test.ts', project: 'fast-scripts' },
          { file: 'scripts/__tests__/card-encyclopedia-catalog.test.ts', project: 'fast-scripts' },
          { file: 'scripts/__tests__/card-encyclopedia-facts.test.ts', project: 'fast-scripts' },
          { file: 'scripts/__tests__/card-encyclopedia-search.test.ts', project: 'fast-scripts' },
          { file: 'scripts/__tests__/card-encyclopedia-text.test.ts', project: 'fast-scripts' },
          { file: 'client/services/llm/generation/__tests__/references.test.ts', project: 'fast-client' },
          { file: 'server/__tests__/workshop-timing-payment-session.test.ts', project: 'fast-server' },
          { file: 'server/__tests__/workshop-composed-behaviors-session.test.ts', project: 'fast-server' },
          { file: 'shared/actions/payment/internal/__tests__/pay.test.ts', project: 'fast-shared' },
          { file: 'shared/cards/__tests__/listener-purity-guard.test.ts', project: 'fast-cards' },
          { file: 'shared/actions/effects/__tests__/pay-supply-token.test.ts', project: 'fast-card-runtime' },
          { file: 'server/__tests__/listener-purity-gate-session.test.ts', project: 'fast-server' },
          { file: 'tests/cost-pay-parity.test.ts', project: 'fast-tests' },
          { file: 'shared/session/__tests__/serialization-cursor.test.ts', project: 'fast-card-runtime' },
          { file: 'client/services/__tests__/api-contract.test.ts', project: 'fast-client' },
          { file: 'tests/protocol-types.test.ts', project: 'fast-tests' },
          { file: 'tests/serialization.test.ts', project: 'fast-tests' },
          { file: 'shared/contract/__tests__/authoritative-command.test.ts', project: 'fast-shared' },
          { file: 'client/services/__tests__/gameTransport-reconnect.test.ts', project: 'fast-client' },
          { file: 'server/__tests__/auth.test.ts', project: 'fast-server' },
          { file: 'server/connection/__tests__/ws-server.test.ts', project: 'fast-server' },
          { file: 'server/game/__tests__/room.test.ts', project: 'fast-server' },
          { file: 'tests/game-sync-pipeline.test.ts', project: 'fast-tests' },
          { file: 'server/__tests__/A029_AleBenches-session.test.ts', project: 'slow' },
        ],
        browser: [
          'e2e-tests/choice-previews.spec.ts', 'e2e-tests/listener-lifecycle-room.spec.ts',
          'e2e-tests/room-animal-holders.spec.ts', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts',
          'e2e-tests/game-context-recovery.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts',
          'e2e-tests/local-sandbox.spec.ts', 'e2e-tests/hosted-password-login.spec.ts',
          'e2e-tests/oauth-onboarding.spec.ts', 'e2e-tests/room-invitations.spec.ts', 'e2e-tests/ws-dual-player.spec.ts',
        ],
      },
      fullTaskIds: ['quality', 'fast'],
    })

    expect(plan.mode).toBe('full')
    expect(plan.selections.map(selection => ({ scope: selection.scope, paths: selection.paths }))).toEqual([
      { scope: 'documentation', paths: ['README.md', 'docs/CUSTOM_CARD_SANDBOX.md'] },
      { scope: 'frontend', paths: ['client/components/Help.tsx'] },
      { scope: 'card', paths: ['shared/cards/A/A029_AleBenches.ts'] },
      { scope: 'server', paths: ['server/game/room.ts'] },
      { scope: 'rules', paths: ['shared/actions/payment/solver.ts'] },
      { scope: 'contract', paths: ['shared/contract/interaction.ts'] },
      { scope: 'global', paths: ['package.json'] },
    ])
  })

  it.each<{ changes: ChangedPath[]; reason: string }>([
    { changes: [], reason: 'No changes were established; full verification is required.' },
  ])('never turns an unprovable scope into an empty successful plan: $reason', ({ changes, reason }) => {
    const plan = planVerification({
      identity, changes, inventory: { vitest: [], browser: [] }, fullTaskIds: ['quality', 'fast'],
    })
    expect(plan.mode).toBe('full')
    expect(plan.checks).toEqual([{ kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'fast' }])
    expect(plan.expansionReasons).toContain(reason)
  })

  it('rejects a missing declared documentation consumer', () => {
    expect(() => planVerification({
      identity, changes: [{ status: 'M', path: 'README.md' }],
      inventory: { vitest: [], browser: [] }, fullTaskIds: ['quality', 'fast'],
    })).toThrow('Declared documentation consumer is missing')
  })

  it('rejects an absent canonical full task catalog', () => {
    expect(() => planVerification({
      identity, changes: [{ status: 'M', path: 'package.json' }],
      inventory: { vitest: [], browser: [] }, fullTaskIds: [],
    })).toThrow('canonical full task catalog')
  })

  it.each(['shared/cards/__tests__/setup-register-all.ts', 'shared/cards/__tests__/card-environment.ts'])('treats global card bootstrap as global: %s', path => {
    const plan = planVerification({
      identity, changes: [{ status: 'M', path }], inventory: { vitest: [], browser: [] }, fullTaskIds: ['quality', 'fast'],
    })
    expect(plan.mode).toBe('full')
    expect(plan.selections).toMatchObject([{ scope: 'global', paths: [path] }])
  })

  describe.each(['tests/setup-language-packs.ts', 'shared/cards/__tests__/setup-listener-purity.ts'])('cross-project setup %s', path => {
    it.each<ChangedPath>([
      { status: 'M', path },
      { status: 'D', path },
      { status: 'R', previousPath: path, path: 'tests/helpers/renamed.ts' },
    ])('retains the global catalog for $status', change => {
      const plan = planVerification({
        identity, changes: [change], inventory: { vitest: [], browser: [] }, fullTaskIds: ['quality', 'fast'],
      })
      expect(plan.mode).toBe('full')
      expect(plan.selections).toContainEqual({
        scope: 'global', paths: [path], reason: 'Shared verification configuration or fixtures require full verification.',
      })
      expect(plan.checks).toEqual([{ kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'fast' }])
    })
  })

  it.each(['client/__tests__/setup.ts', 'client/__tests__/setup-card-manifest.ts'])('keeps the client-only setup in the complete client layer: %s', path => {
    const inventory = {
      vitest: [
        { file: 'client/components/__tests__/first.test.ts', project: 'fast-client' },
        { file: 'client/components/__tests__/second.test.ts', project: 'fast-client' },
        { file: 'server/__tests__/unrelated.test.ts', project: 'fast-server' },
      ], browser: [],
    }
    const plan = planVerification({
      identity, changes: [{ status: 'M', path }], inventory, fullTaskIds: ['quality', 'fast'],
      testConsumers: {
        inventoryKey: JSON.stringify(inventory), expansionReasons: [],
        tests: inventory.vitest.map(test => ({
          file: test.file, dependencies: [test.file], symbols: [], literals: [], uncertaintyReasons: [],
        })),
      },
    })
    expect(plan.mode).toBe('scoped')
    expect(plan.selections).toMatchObject([{ scope: 'test-support', paths: [path] }])
    expect(plan.checks).toEqual([{ kind: 'vitest', project: 'fast-client', files: [
      'client/components/__tests__/first.test.ts', 'client/components/__tests__/second.test.ts',
    ] }])
  })

  it('uses test support ownership for a client fixture', () => {
    const path = 'client/components/__tests__/fixtures.ts'
    const plan = planVerification({
      identity, changes: [{ status: 'M', path }], inventory: { vitest: [], browser: [] }, fullTaskIds: ['quality', 'fast'],
    })
    expect(plan.selections).toMatchObject([{ scope: 'test-support', paths: [path] }])
    expect(plan.expansionReasons).toContain('Test consumer evidence is missing; full verification is required.')
  })

  it.each(['server/workshop-validation.ts', 'client/services/workshop-pr.ts'])('retains Workshop ownership for module prefixes: %s', path => {
    expect(businessScopeFor(path)).toBe('workshop')
  })

  it('includes a new rule regression without requiring a production filename twin', () => {
    const file = 'server/__tests__/payment-new-regression.test.ts'
    const inventory = { vitest: [{ file, project: 'fast-server' }], browser: [] }
    const plan = planVerification({
      identity, changes: [{ status: 'A', path: file }], inventory, fullTaskIds: ['quality', 'fast'],
      testConsumers: { inventoryKey: JSON.stringify(inventory), expansionReasons: [], tests: [
        { file, dependencies: [file], symbols: [], literals: [], uncertaintyReasons: [] },
      ] },
    })
    expect(plan.mode).toBe('scoped')
    expect(plan.checks).toEqual([{ kind: 'vitest', project: 'fast-server', files: [file] }])
  })
})

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))
const write = (cwd: string, file: string, content: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), content)
}
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const commit = (cwd: string, title: string) => {
  git(cwd, 'add', '--', '.', ':(exclude)docs/superpowers/**')
  git(cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', title)
  return git(cwd, 'rev-parse', 'HEAD')
}
const repository = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'verification-plan-'))
  directories.push(cwd)
  git(cwd, 'init', '-q', '--template=', '-b', 'main')
  git(cwd, 'config', 'user.email', 'test@example.com')
  git(cwd, 'config', 'user.name', 'Verification Plan Test')
  for (const root of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) write(cwd, `${root}/.keep`, '')
  for (const file of [
    'shared/domain/example.ts', 'shared/domain/__tests__/example.test.ts',
    'client/components/Example.tsx', 'client/components/__tests__/Example.test.tsx',
    'server/__tests__/example.test.ts', 'scripts/__tests__/docs-budget.test.ts',
    'tests/example.test.ts', 'e2e-tests/example.spec.ts', 'replay-viewer/src/example.ts',
  ]) write(cwd, file, '// valid source\n')
  write(cwd, 'README.md', Array.from({ length: 12 }, (_, index) => `Line ${index}`).join('\n') + '\n')
  write(cwd, '.gitignore', 'output/\n')
  const base = commit(cwd, 'baseline')
  git(cwd, 'checkout', '-qb', 'feature')
  return { cwd, base }
}

describe('repository verification scope', () => {
  it('uses the whole branch diff and retains additions, deletions, renames, and their test owners', () => {
    const { cwd, base } = repository()
    write(cwd, 'README.md', 'Earlier commit documentation\n')
    commit(cwd, 'first change')
    git(cwd, 'mv', 'client/components/Example.tsx', 'shared/domain/Moved.tsx')
    rmSync(join(cwd, 'server/__tests__/example.test.ts'))
    write(cwd, 'client/components/__tests__/Added.test.tsx', '// new test\n')
    const head = commit(cwd, 'second change')

    const plan = createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast'] })

    expect(plan.identity).toMatchObject({ baseSha: base, mergeBaseSha: base, headSha: head, testedSha: head })
    expect(plan.changes).toEqual([
      { status: 'M', path: 'README.md' },
      { status: 'A', path: 'client/components/__tests__/Added.test.tsx' },
      { status: 'D', path: 'server/__tests__/example.test.ts' },
      { status: 'R', previousPath: 'client/components/Example.tsx', path: 'shared/domain/Moved.tsx' },
    ])
    expect(plan.inventory.vitest).toContainEqual({ file: 'client/components/__tests__/Added.test.tsx', project: 'fast-client' })
    expect(plan.inventory.vitest).not.toContainEqual({ file: 'server/__tests__/example.test.ts', project: 'fast-server' })
    expect(plan.inventory.browser).toEqual(['e2e-tests/example.spec.ts'])
  })

  it.each([
    { name: 'missing discovery root', mutate: (cwd: string) => rmSync(join(cwd, 'shared'), { recursive: true }), error: /Missing test discovery root: shared/ },
    { name: 'malformed source', mutate: (cwd: string) => write(cwd, 'client/components/Example.tsx', 'export const ='), error: /Example\.tsx/ },
    { name: 'unclassified new test', mutate: (cwd: string) => write(cwd, 'unowned/new.test.ts', '// new test\n'), error: /exactly one project.*unowned\/new\.test\.ts/ },
  ])('fails scope computation on $name', ({ mutate, error }) => {
    const { cwd } = repository()
    mutate(cwd)
    expect(() => createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast'] })).toThrow(error)
  })

  it('binds an existing plan to its source contents, refs, and actual checked-out commit', () => {
    const { cwd } = repository()
    write(cwd, 'README.md', 'Updated guide\n')
    commit(cwd, 'documentation')
    const plan = createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast'] })
    expect(() => assertPlanCurrent(cwd, plan)).not.toThrow()

    write(cwd, 'client/components/Example.tsx', 'export const changed = true\n')
    expect(() => assertPlanCurrent(cwd, plan)).toThrow('Source contents changed')
    git(cwd, 'restore', '--', 'client/components/Example.tsx')
    git(cwd, 'branch', '-f', 'main', 'HEAD')
    expect(() => assertPlanCurrent(cwd, plan)).toThrow('Base reference changed')
    git(cwd, 'branch', '-f', 'main', plan.identity.baseSha)
    git(cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'another commit')
    expect(() => assertPlanCurrent(cwd, plan)).toThrow('Checked-out commit changed')
  })

  it('rejects an unparsable transitive helper even when the helper itself is unchanged', () => {
    const { cwd } = repository()
    write(cwd, 'e2e-tests/helpers/broken.ts', 'export const =')
    write(cwd, 'e2e-tests/example.spec.ts', "import './helpers/broken'\n")
    commit(cwd, 'baseline with unreadable helper')
    git(cwd, 'branch', '-f', 'main', 'HEAD')
    write(cwd, 'e2e-tests/example.spec.ts', "import './helpers/broken'\n// Changed browser test\n")
    commit(cwd, 'browser change')

    expect(() => createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast'] }))
      .toThrow(/Cannot establish test consumer evidence.*broken\.ts/)
  })

  it('rejects an unreadable card test helper for a card-only production change', () => {
    const { cwd } = repository()
    const card = 'shared/cards/A/A029_AleBenches.ts'
    const source = "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches' } })\n"
    write(cwd, card, source)
    write(cwd, 'shared/cards/__tests__/fixtures/broken.ts', 'export const =')
    write(cwd, 'shared/cards/__tests__/A29_AleBenches.test.ts', "import './fixtures/broken'\n")
    commit(cwd, 'card baseline with unreadable helper')
    git(cwd, 'branch', '-f', 'main', 'HEAD')
    write(cwd, card, source + '// Changed card source\n')
    commit(cwd, 'card-only change')

    expect(() => createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast'] }))
      .toThrow(/Cannot establish test consumer evidence.*broken\.ts/)
  })

  it('includes tested-commit changes beyond a documentation-only requested head', () => {
    const { cwd } = repository()
    write(cwd, 'README.md', 'Updated guide\n')
    const requestedHead = commit(cwd, 'documentation')
    write(cwd, 'shared/domain/example.ts', 'export const changedRule = true\n')
    const tested = commit(cwd, 'actual tested rule change')

    const plan = createRepositoryPlan({ cwd, base: 'main', head: requestedHead, fullTaskIds: ['quality', 'fast'] })

    expect(plan.identity).toMatchObject({ headSha: requestedHead, testedSha: tested })
    expect(plan.changes).toContainEqual({ status: 'M', path: 'shared/domain/example.ts' })
    expect(plan.mode).toBe('full')
    expect(plan.selections).toContainEqual({ scope: 'rules', paths: ['shared/domain/example.ts'], reason: 'Shared rule mechanisms require complete affected rule groups.' })
  })

  it('runs the same planner through the CLI, writes a human summary, and replaces stale output on failure', () => {
    const { cwd } = repository()
    write(cwd, 'README.md', 'Updated guide\n')
    commit(cwd, 'documentation')
    const summary = join(cwd, 'output/summary.md')
    const cliArgs = [fileURLToPath(import.meta.resolve('tsx/cli')), resolve(import.meta.dirname, '../verification-plan.ts'), '--base', 'main', '--json', '--summary', summary]
    const success = spawnSync(process.execPath, cliArgs, { cwd, encoding: 'utf8', timeout: 15_000 })
    expect(success.status, success.stderr).toBe(0)
    const planned: unknown = JSON.parse(success.stdout)
    expect(planned).toMatchObject({ status: 'planned', mode: 'scoped', checks: [{ kind: 'vitest', project: 'fast-scripts', files: ['scripts/__tests__/docs-budget.test.ts'] }] })
    expect(readFileSync(summary, 'utf8')).toContain('Ordinary documentation requires documentation constraints.')
    expect(readFileSync(summary, 'utf8')).toContain('This plan is not verification evidence.')

    write(cwd, 'client/components/Example.tsx', 'export const =')
    const failed = spawnSync(process.execPath, cliArgs, { cwd, encoding: 'utf8', timeout: 15_000 })
    expect(failed.status).toBe(1)
    const artifact: unknown = JSON.parse(readFileSync(join(cwd, 'output/verification/plan.json'), 'utf8'))
    expect(artifact).toMatchObject({ status: 'failed' })
    expect(artifact).not.toHaveProperty('checks')
    expect(readFileSync(summary, 'utf8')).toContain('Scope planning failed')
  }, 30_000)
})
