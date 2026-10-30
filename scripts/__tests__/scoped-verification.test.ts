import { describe, expect, it } from 'vitest'
import { planVerification } from '../ci/verification-plan'
import { routinePlanManifest } from '../ci/scoped-verification'
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
  'replay-viewer', 'replay-viewer-csp', 'game-context-recovery',
].map(name => `e2e-tests/${name}.spec.ts`)
const inventory = {
  vitest: [{ file: 'client/services/__tests__/gameTransport.test.ts', project: 'fast-client' }],
  browser: consumers,
}

describe('routine verification scope', () => {
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
        'e2e-tests/choice-previews.spec.ts', 'e2e-tests/desktop-table-layout.spec.ts', 'e2e-tests/farm-card-targets.spec.ts',
        'e2e-tests/farm-select.spec.ts', 'e2e-tests/mobile-game-layout.spec.ts',
      ], grep: null },
      { kind: 'browser', browser: 'chromium', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@viewport|@ws' },
      { kind: 'browser', browser: 'webkit', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@webkit' },
    ])
  })

  it.each(['docs/HOW_TO_DEPLOY.md', 'docs/operations/ci-checks.md', 'docs/prompts/card-generation.md', 'replay-viewer/vite.config.ts'])(
    'keeps runtime contracts and nested build configuration broad: %s', path => {
      const plan = planVerification({
        identity, changes: [{ status: 'M', path }],
        inventory: { vitest: [{ file: 'scripts/__tests__/docs-budget.test.ts', project: 'fast-scripts' }], browser: [] },
        fullTaskIds: FULL_TASK_IDS,
      })
      expect(plan.mode).toBe('full')
      expect(plan.checks).toHaveLength(10)
    },
  )

  it.each([
    { path: 'client/services/gameTransport.ts', files: ['hosted-password-login', 'oauth-onboarding', 'room-invitations', 'ws-dual-player'], tag: '@ws' },
    { path: 'client/contexts/__tests__/LocaleContext.test.tsx', files: ['card-localization', 'interface-localization', 'interface-localization-fields'], tag: '@locale' },
    { path: 'client/components/interaction/InteractionBar.tsx', files: ['choice-previews', 'interaction-focus', 'mobile-interaction-continuity', 'online-interaction-completion'], tag: '@viewport|@ws' },
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
    'client/components/common/Button.tsx', 'client/components/board/ScoringPad.tsx', 'client/styles/tokens.css',
    'client/app/workshop/Prompt.tsx', 'server/game/room.ts', 'shared/cards/A/A029_AleBenches.ts',
    'shared/contract/interaction.ts', 'client/components/board/__tests__/fixtures.ts',
  ])('retains full fallback for unknown modules, shared contracts, and unfinished domains: %s', path => {
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

  it('expands instead of dropping a missing declared browser consumer', () => {
    const plan = planVerification({
      identity, changes: [{ status: 'M', path: 'client/components/board/FarmBoard.tsx' }],
      inventory: { ...inventory, browser: consumers.filter(file => file !== 'e2e-tests/farm-select.spec.ts') }, fullTaskIds: FULL_TASK_IDS,
    })
    expect(plan.mode).toBe('full')
    expect(plan.expansionReasons).toContain('Declared frontend browser consumers are missing: e2e-tests/farm-select.spec.ts; full verification is required.')
  })
})
