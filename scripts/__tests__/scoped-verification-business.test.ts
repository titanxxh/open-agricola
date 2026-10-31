import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RuleAssociationIndex } from '../ci/rule-verification'
import { planVerification, readTestInventory, type PlannedCheck, type TestInventory } from '../ci/verification-plan'
import { FULL_TASK_IDS } from '../ci/verification-tasks'

const identity = {
  baseRef: 'main', headRef: 'HEAD', baseSha: '1'.repeat(40), mergeBaseSha: '1'.repeat(40),
  headSha: '2'.repeat(40), testedSha: '2'.repeat(40), sourceFingerprint: '3'.repeat(64),
}

const encyclopediaProducerFiles = [
  'scripts/__tests__/card-encyclopedia-artifacts.test.ts',
  'scripts/__tests__/card-encyclopedia-catalog.test.ts',
  'scripts/__tests__/card-encyclopedia-facts.test.ts',
  'scripts/__tests__/card-encyclopedia-search.test.ts',
  'scripts/__tests__/card-encyclopedia-text.test.ts',
]

const inventory: TestInventory = {
  vitest: [
    { project: 'fast-shared', file: 'shared/contract/__tests__/authoritative-command.test.ts' },
    { project: 'fast-shared', file: 'shared/actions/payment/internal/__tests__/pay.test.ts' },
    { project: 'fast-client', file: 'client/services/__tests__/gameTransport-reconnect.test.ts' },
    { project: 'fast-client', file: 'client/app/__tests__/ReplayViewer.recovery.test.tsx' },
    { project: 'fast-server', file: 'server/__tests__/auth.test.ts' },
    { project: 'fast-server', file: 'server/connection/__tests__/ws-server.test.ts' },
    { project: 'fast-server', file: 'server/game/__tests__/room.test.ts' },
    { project: 'fast-tests', file: 'tests/game-sync-pipeline.test.ts' },
    { project: 'fast-tests', file: 'tests/replay-viewer-model.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/docs-budget.test.ts' },
  ],
  browser: [
    'e2e-tests/hosted-password-login.spec.ts', 'e2e-tests/oauth-onboarding.spec.ts',
    'e2e-tests/room-invitations.spec.ts', 'e2e-tests/ws-dual-player.spec.ts',
    'e2e-tests/frontend-browser-scenario-matrix.spec.ts',
  ],
}

const plan = (paths: string[], tests = inventory) => planVerification({
  identity, changes: paths.map(path => ({ status: 'M', path })), inventory: tests, fullTaskIds: FULL_TASK_IDS,
  ruleAssociations: {
    inventoryKey: JSON.stringify(tests), cards: [], expansionReasons: [],
    tests: [...tests.vitest.map(test => test.file), ...tests.browser].map(file => ({ file, subsystems: ['core'], safetyReasons: [] })),
  } satisfies RuleAssociationIndex,
})

const recoveryInventory: TestInventory = {
  vitest: [...inventory.vitest,
    { project: 'fast-card-runtime', file: 'shared/session/__tests__/serialization-cursor.test.ts' },
    { project: 'fast-card-runtime', file: 'shared/actions/effects/__tests__/pay-supply-token.test.ts' },
    { project: 'fast-server', file: 'server/game/persistence/__tests__/room-history-recovery.test.ts' },
    { project: 'fast-server', file: 'server/game/__tests__/replay-codec.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/publish-replay-viewer.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/replay-removal.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/room-commit-acceptance.test.ts' },
  ],
  browser: [...inventory.browser,
    'e2e-tests/game-context-recovery.spec.ts', 'e2e-tests/room-history-window.spec.ts',
    'e2e-tests/room-history-projection.spec.ts', 'e2e-tests/replay-viewer.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts',
  ],
}

const ruleInventory: TestInventory = {
  vitest: [...recoveryInventory.vitest,
    { project: 'fast-cards', file: 'shared/cards/__tests__/listener-purity-guard.test.ts' },
    { project: 'fast-cards', file: 'shared/cards/__tests__/A29_AleBenches.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/listener-purity-gate-session.test.ts' },
    { project: 'slow', file: 'server/__tests__/A029_AleBenches-session.test.ts' },
    { project: 'slow', file: 'server/__tests__/A27_OvenSite-session.test.ts' },
    { project: 'fast-tests', file: 'tests/cost-pay-parity.test.ts' },
  ],
  browser: [...recoveryInventory.browser,
    'e2e-tests/choice-previews.spec.ts', 'e2e-tests/listener-lifecycle-room.spec.ts',
    'e2e-tests/room-animal-holders.spec.ts', 'e2e-tests/local-sandbox.spec.ts',
  ],
}

const contractInventory: TestInventory = {
  ...ruleInventory,
  vitest: [...ruleInventory.vitest,
    ...encyclopediaProducerFiles.map(file => ({ project: 'fast-scripts', file })),
    { project: 'fast-client', file: 'client/services/__tests__/api-contract.test.ts' },
    { project: 'fast-tests', file: 'tests/serialization.test.ts' },
    { project: 'fast-tests', file: 'tests/protocol-types.test.ts' },
  ],
}

const workshopInventory: TestInventory = {
  vitest: [
    { project: 'fast-shared', file: 'shared/actions/payment/internal/__tests__/pay.test.ts' },
    { project: 'fast-shared', file: 'shared/custom-code/__tests__/contract-admission.test.ts' },
    { project: 'fast-shared', file: 'shared/projections/__tests__/workshop-generation.test.ts' },
    { project: 'fast-cards', file: 'shared/cards/__tests__/listener-purity-guard.test.ts' },
    { project: 'fast-cards', file: 'shared/cards/__tests__/A29_AleBenches.test.ts' },
    { project: 'fast-card-runtime', file: 'shared/actions/effects/__tests__/pay-supply-token.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/listener-purity-gate-session.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/workshop-timing-payment-session.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/workshop-composed-behaviors-session.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/workshop-capability-contract-session.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/workshop-sandbox-contract.test.ts' },
    { project: 'fast-tests', file: 'tests/cost-pay-parity.test.ts' },
    { project: 'slow', file: 'server/__tests__/A029_AleBenches-session.test.ts' },
    { project: 'slow', file: 'server/__tests__/A27_OvenSite-session.test.ts' },
    { project: 'fast-client', file: 'client/services/__tests__/generation-prompt.test.ts' },
    { project: 'fast-client', file: 'client/services/llm/generation/__tests__/references.test.ts' },
    { project: 'fast-client', file: 'client/local-sandbox/__tests__/card-test-runtime.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/docs-budget.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/listener-contract-admission.test.ts' },
  ],
  browser: [
    'e2e-tests/workshop-generation.spec.ts', 'e2e-tests/workshop-smoke.spec.ts',
    'e2e-tests/workshop-workspace-acceptance.spec.ts', 'e2e-tests/workshop-browser-card-tests.spec.ts',
    'e2e-tests/local-sandbox.spec.ts', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts',
  ],
}

describe('business verification groups', () => {
  it.each([
    ['shared/i18n/index.ts', 'client/services/__tests__/language-pack.test.ts'],
    ['shared/engine/engine.ts', 'client/hooks/__tests__/useFarmSelection.test.ts'],
  ])('selects the real complete client project for shared rule core %s', (path, consumer) => {
    const actual = readTestInventory(resolve(import.meta.dirname, '../..'))
    const selected = plan([path], actual)

    expect(selected.mode).toBe('scoped')
    expect(selected.expansionReasons).toEqual([])
    expect(selected.selections.map(selection => selection.scope)).toEqual(['rules'])
    const client = selected.checks.find(check => check.kind === 'vitest' && check.project === 'fast-client')
    expect(client).toMatchObject({ kind: 'vitest', project: 'fast-client', files: expect.arrayContaining([consumer]) })
    expect(client).toEqual({
      kind: 'vitest', project: 'fast-client',
      files: actual.vitest.filter(test => test.project === 'fast-client').map(test => test.file).sort(),
    })
  }, 30_000)

  it('runs the complete backend and client groups plus login, room and multiplayer browsers for a room change', () => {
    const selected = plan(['server/game/room.ts'])

    expect(selected.mode).toBe('scoped')
    expect(selected.expansionReasons).toEqual([])
    expect(selected.checks).toEqual([
      { kind: 'vitest', project: 'fast-shared', files: [
        'shared/actions/payment/internal/__tests__/pay.test.ts', 'shared/contract/__tests__/authoritative-command.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-client', files: [
        'client/app/__tests__/ReplayViewer.recovery.test.tsx', 'client/services/__tests__/gameTransport-reconnect.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-server', files: [
        'server/__tests__/auth.test.ts', 'server/connection/__tests__/ws-server.test.ts', 'server/game/__tests__/room.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-tests', files: ['tests/game-sync-pipeline.test.ts', 'tests/replay-viewer-model.test.ts'] },
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'browser', browser: 'chromium', files: [
        'e2e-tests/hosted-password-login.spec.ts', 'e2e-tests/oauth-onboarding.spec.ts',
        'e2e-tests/room-invitations.spec.ts', 'e2e-tests/ws-dual-player.spec.ts',
      ], grep: null },
      { kind: 'browser', browser: 'chromium', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@ws' },
      { kind: 'browser', browser: 'webkit', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@webkit' },
    ] satisfies PlannedCheck[])
    expect(selected.selections).toEqual([{
      scope: 'server', paths: ['server/game/room.ts'], reason: 'Server changes require their complete backend and multiplayer groups.',
    }])
  })

  it.each([
    'server/game/persistence/postgres-adapter.ts', 'server/game/replay-store.ts', 'server/game-context-routes.ts',
    'server/storage/s3-store.ts', 'server/game/room-committer.ts',
    'server/game/command-store.ts', 'server/game/game-creation-store.ts',
  ])('covers storage, shared serialization, transport and Replay consumers for %s', path => {
    const selected = plan([path], recoveryInventory)

    expect(selected.mode).toBe('scoped')
    expect(selected.selections.map(selection => selection.scope)).toEqual(['recovery'])
    expect(selected.checks).toEqual([
      { kind: 'vitest', project: 'fast-shared', files: [
        'shared/actions/payment/internal/__tests__/pay.test.ts', 'shared/contract/__tests__/authoritative-command.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-card-runtime', files: [
        'shared/actions/effects/__tests__/pay-supply-token.test.ts', 'shared/session/__tests__/serialization-cursor.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-client', files: [
        'client/app/__tests__/ReplayViewer.recovery.test.tsx', 'client/services/__tests__/gameTransport-reconnect.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-server', files: [
        'server/__tests__/auth.test.ts', 'server/connection/__tests__/ws-server.test.ts',
        'server/game/__tests__/replay-codec.test.ts', 'server/game/__tests__/room.test.ts',
        'server/game/persistence/__tests__/room-history-recovery.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-scripts', files: [
        'scripts/__tests__/publish-replay-viewer.test.ts', 'scripts/__tests__/replay-removal.test.ts',
        'scripts/__tests__/room-commit-acceptance.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-tests', files: ['tests/game-sync-pipeline.test.ts', 'tests/replay-viewer-model.test.ts'] },
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'browser', browser: 'chromium', files: [
        'e2e-tests/game-context-recovery.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts', 'e2e-tests/replay-viewer.spec.ts',
        'e2e-tests/room-history-projection.spec.ts', 'e2e-tests/room-history-window.spec.ts', 'e2e-tests/ws-dual-player.spec.ts',
      ], grep: null },
      { kind: 'browser', browser: 'chromium', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@ws' },
      { kind: 'browser', browser: 'webkit', files: [
        'e2e-tests/frontend-browser-scenario-matrix.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts',
      ], grep: '@webkit' },
    ] satisfies PlannedCheck[])
  })

  it.each([
    'shared/actions/hooks.ts', 'shared/actions/new-business/handler.ts',
    'shared/engine/engine.ts', 'shared/session/session-core.ts', 'server/game/authoritative-session.ts',
  ])('keeps every affected rule project, slow Session and complete browser lane for %s', path => {
    const selected = plan([path], ruleInventory)

    expect(selected.mode).toBe('scoped')
    expect(selected.checks).toEqual([
      { kind: 'vitest', project: 'fast-shared', files: [
        'shared/actions/payment/internal/__tests__/pay.test.ts', 'shared/contract/__tests__/authoritative-command.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-cards', files: [
        'shared/cards/__tests__/A29_AleBenches.test.ts', 'shared/cards/__tests__/listener-purity-guard.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-card-runtime', files: [
        'shared/actions/effects/__tests__/pay-supply-token.test.ts', 'shared/session/__tests__/serialization-cursor.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-client', files: [
        'client/app/__tests__/ReplayViewer.recovery.test.tsx', 'client/services/__tests__/gameTransport-reconnect.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-server', files: [
        'server/__tests__/auth.test.ts', 'server/__tests__/listener-purity-gate-session.test.ts',
        'server/connection/__tests__/ws-server.test.ts', 'server/game/__tests__/replay-codec.test.ts',
        'server/game/__tests__/room.test.ts', 'server/game/persistence/__tests__/room-history-recovery.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-tests', files: [
        'tests/cost-pay-parity.test.ts', 'tests/game-sync-pipeline.test.ts', 'tests/replay-viewer-model.test.ts',
      ] },
      { kind: 'vitest', project: 'slow', files: [
        'server/__tests__/A029_AleBenches-session.test.ts', 'server/__tests__/A27_OvenSite-session.test.ts',
      ] },
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'catalog', taskId: 'chromium-1' }, { kind: 'catalog', taskId: 'chromium-2' },
      { kind: 'catalog', taskId: 'chromium-3' }, { kind: 'catalog', taskId: 'chromium-4' },
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
    ] satisfies PlannedCheck[])
    expect(selected.selections.map(selection => selection.scope)).toEqual(['rules'])
  })

  it.each([
    'shared/contract/protocol/ws.ts', 'shared/projections/serialized-state.ts', 'shared/session/serialization.ts',
    'server/connection/envelope-builder.ts', 'client/services/rehydrate.ts', 'replay-viewer/src/model.ts',
    'server/payload-validation.ts', 'server/game/command-input.ts', 'shared/domain/player-panel-summary.ts',
  ])('verifies complete protocol producers, consumers and Replay when changing %s', path => {
    const selected = plan([path], contractInventory)

    expect(selected.mode).toBe('scoped')
    expect(selected.selections.map(selection => selection.scope)).toEqual(['contract'])
    expect(selected.checks.filter(check => check.kind === 'vitest').map(check => check.project)).toEqual([
      'fast-shared', 'fast-cards', 'fast-card-runtime', 'fast-client', 'fast-server', 'fast-scripts', 'fast-tests', 'slow',
    ])
    expect(selected.checks.find(check => check.kind === 'vitest' && check.project === 'fast-client')).toEqual({
      kind: 'vitest', project: 'fast-client', files: [
        'client/app/__tests__/ReplayViewer.recovery.test.tsx', 'client/services/__tests__/api-contract.test.ts',
        'client/services/__tests__/gameTransport-reconnect.test.ts',
      ],
    })
    expect(selected.checks.filter(check => check.kind === 'catalog')).toEqual([
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'catalog', taskId: 'chromium-1' }, { kind: 'catalog', taskId: 'chromium-2' },
      { kind: 'catalog', taskId: 'chromium-3' }, { kind: 'catalog', taskId: 'chromium-4' },
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
    ])
  })

  it.each([
    'shared/contract/card-encyclopedia.ts', 'shared/projections/card-encyclopedia-text.ts',
    'shared/projections/card-display-number.ts', 'shared/projections/card-text-icons.ts',
    'shared/projections/season-display.ts', 'shared/projections/moor-special-actions.ts',
  ])('retains the complete encyclopedia producer group for %s', path => {
    const selected = plan([path], contractInventory)

    expect(selected.mode).toBe('scoped')
    expect(selected.expansionReasons).toEqual([])
    expect(selected.checks.find(check => check.kind === 'vitest' && check.project === 'fast-scripts')).toEqual({
      kind: 'vitest', project: 'fast-scripts', files: encyclopediaProducerFiles,
    })
  })

  it.each(encyclopediaProducerFiles)('rejects a missing encyclopedia producer consumer %s', missing => {
    const tests = { ...contractInventory, vitest: contractInventory.vitest.filter(test => test.file !== missing) }
    expect(() => plan(['shared/contract/card-encyclopedia.ts'], tests)).toThrow(missing)
  })

  it.each([
    'client/services/llm/generation/prompt.ts', 'shared/contract/workshop.ts', 'server/workshop-sandbox-contract.ts',
    'client/local-sandbox/card-test-runtime.ts',
  ])('runs current Workshop behavior, sandbox and prompt checks without paid model calls for %s', path => {
    const selected = plan([path], workshopInventory)

    expect(selected.mode).toBe('scoped')
    expect(selected.selections.map(selection => selection.scope)).toEqual(['workshop'])
    expect(selected.checks).toEqual([
      { kind: 'vitest', project: 'fast-shared', files: [
        'shared/actions/payment/internal/__tests__/pay.test.ts', 'shared/custom-code/__tests__/contract-admission.test.ts',
        'shared/projections/__tests__/workshop-generation.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-cards', files: [
        'shared/cards/__tests__/A29_AleBenches.test.ts', 'shared/cards/__tests__/listener-purity-guard.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-card-runtime', files: ['shared/actions/effects/__tests__/pay-supply-token.test.ts'] },
      { kind: 'vitest', project: 'fast-client', files: [
        'client/local-sandbox/__tests__/card-test-runtime.test.ts', 'client/services/__tests__/generation-prompt.test.ts',
        'client/services/llm/generation/__tests__/references.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-server', files: [
        'server/__tests__/listener-purity-gate-session.test.ts', 'server/__tests__/workshop-capability-contract-session.test.ts',
        'server/__tests__/workshop-composed-behaviors-session.test.ts', 'server/__tests__/workshop-sandbox-contract.test.ts',
        'server/__tests__/workshop-timing-payment-session.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-scripts', files: [
        'scripts/__tests__/docs-budget.test.ts', 'scripts/__tests__/listener-contract-admission.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-tests', files: ['tests/cost-pay-parity.test.ts'] },
      { kind: 'vitest', project: 'slow', files: [
        'server/__tests__/A029_AleBenches-session.test.ts', 'server/__tests__/A27_OvenSite-session.test.ts',
      ] },
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'catalog', taskId: 'browser-sandbox' },
      { kind: 'browser', browser: 'chromium', files: [
        'e2e-tests/local-sandbox.spec.ts', 'e2e-tests/workshop-browser-card-tests.spec.ts',
        'e2e-tests/workshop-generation.spec.ts', 'e2e-tests/workshop-smoke.spec.ts',
        'e2e-tests/workshop-workspace-acceptance.spec.ts',
      ], grep: null },
      { kind: 'browser', browser: 'chromium', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@workshop' },
      { kind: 'browser', browser: 'webkit', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@webkit' },
    ] satisfies PlannedCheck[])
  })

  it.each([
    { path: 'README.md', consumers: ['scripts/__tests__/docs-budget.test.ts'] },
    { path: 'docs/test/new-workflow.md', consumers: ['scripts/__tests__/docs-budget.test.ts'] },
    { path: 'docs/CUSTOM_CARD_SANDBOX_zh.md', consumers: ['scripts/__tests__/docs-budget.test.ts'] },
    { path: 'docs/architecture/payment.md', consumers: ['client/services/llm/generation/__tests__/references.test.ts', 'scripts/__tests__/docs-budget.test.ts'] },
    { path: 'docs/CUSTOM_CARD_SANDBOX.md', consumers: [
      'client/services/llm/generation/__tests__/references.test.ts', 'scripts/__tests__/docs-budget.test.ts',
      'server/__tests__/workshop-composed-behaviors-session.test.ts', 'server/__tests__/workshop-timing-payment-session.test.ts',
    ] },
  ])('selects documentation readers and executable-contract consumers for $path', ({ path, consumers }) => {
    const selected = plan([path], workshopInventory)

    expect(selected.mode).toBe('scoped')
    expect(selected.selections.map(selection => selection.scope)).toEqual(['documentation'])
    expect(selected.checks.flatMap(check => check.kind === 'vitest' ? check.files : []).sort()).toEqual(consumers)
    expect(selected.checks.every(check => check.kind === 'vitest')).toBe(true)
  })

  it.each([
    'server/operations-accounts.ts', 'server/database/031-game-opening-facts.sql',
  ])('keeps monitoring path %s inside backend and dashboard consumers', path => {
    const tests: TestInventory = {
      vitest: [...inventory.vitest,
        { project: 'fast-server', file: 'server/__tests__/operations-accounts.test.ts' },
        { project: 'fast-server', file: 'server/__tests__/operations-openings.test.ts' },
      ],
      browser: [...inventory.browser, 'e2e-tests/operations-dashboard.spec.ts'],
    }
    const selected = plan([path], tests)

    expect(selected.mode).toBe('scoped')
    expect(selected.selections.map(selection => selection.scope)).toEqual(['operations'])
    expect(selected.checks.filter(check => check.kind === 'vitest')).toEqual([{
      kind: 'vitest', project: 'fast-server', files: tests.vitest.filter(test => test.project === 'fast-server').map(test => test.file).sort(),
    }])
    expect(selected.checks.filter(check => check.kind === 'catalog')).toEqual([
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
    ])
    expect(selected.checks.filter(check => check.kind === 'browser')).toEqual([{
      kind: 'browser', browser: 'chromium', files: ['e2e-tests/operations-dashboard.spec.ts'], grep: null,
    }])
  })

  it('unions room and recovery groups across one mixed diff', () => {
    const selected = plan(['server/game/room.ts', 'server/game/persistence/postgres-adapter.ts'], recoveryInventory)

    expect(selected.mode).toBe('scoped')
    expect(selected.selections.map(selection => selection.scope)).toEqual(['server', 'recovery'])
    expect(selected.checks.filter(check => check.kind === 'vitest').map(check => check.project)).toEqual([
      'fast-shared', 'fast-card-runtime', 'fast-client', 'fast-server', 'fast-scripts', 'fast-tests',
    ])
    expect(selected.checks.filter(check => check.kind === 'catalog')).toEqual([
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
    ])
    expect(selected.checks.filter(check => check.kind === 'browser')).toEqual([
      { kind: 'browser', browser: 'chromium', files: [
        'e2e-tests/game-context-recovery.spec.ts', 'e2e-tests/hosted-password-login.spec.ts',
        'e2e-tests/oauth-onboarding.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts', 'e2e-tests/replay-viewer.spec.ts',
        'e2e-tests/room-history-projection.spec.ts', 'e2e-tests/room-history-window.spec.ts',
        'e2e-tests/room-invitations.spec.ts', 'e2e-tests/ws-dual-player.spec.ts',
      ], grep: null },
      { kind: 'browser', browser: 'chromium', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@ws' },
      { kind: 'browser', browser: 'webkit', files: [
        'e2e-tests/frontend-browser-scenario-matrix.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts',
      ], grep: '@webkit' },
    ])
  })

  it('executes each mixed-scope project and identical browser selector once in stable file order', () => {
    const paths = ['README.md', 'server/game/persistence/postgres-adapter.ts', 'server/game/room.ts']
    const selected = plan(paths, recoveryInventory)

    expect(selected.mode).toBe('scoped')
    expect(selected.checks.filter(check => check.kind === 'vitest')).toEqual([
      { kind: 'vitest', project: 'fast-shared', files: [
        'shared/actions/payment/internal/__tests__/pay.test.ts', 'shared/contract/__tests__/authoritative-command.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-card-runtime', files: [
        'shared/actions/effects/__tests__/pay-supply-token.test.ts', 'shared/session/__tests__/serialization-cursor.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-client', files: [
        'client/app/__tests__/ReplayViewer.recovery.test.tsx', 'client/services/__tests__/gameTransport-reconnect.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-server', files: [
        'server/__tests__/auth.test.ts', 'server/connection/__tests__/ws-server.test.ts',
        'server/game/__tests__/replay-codec.test.ts', 'server/game/__tests__/room.test.ts',
        'server/game/persistence/__tests__/room-history-recovery.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-scripts', files: [
        'scripts/__tests__/docs-budget.test.ts', 'scripts/__tests__/publish-replay-viewer.test.ts',
        'scripts/__tests__/replay-removal.test.ts', 'scripts/__tests__/room-commit-acceptance.test.ts',
      ] },
      { kind: 'vitest', project: 'fast-tests', files: ['tests/game-sync-pipeline.test.ts', 'tests/replay-viewer-model.test.ts'] },
    ])
    expect(selected.checks.filter(check => check.kind === 'browser')).toEqual([
      { kind: 'browser', browser: 'chromium', files: [
        'e2e-tests/game-context-recovery.spec.ts', 'e2e-tests/hosted-password-login.spec.ts',
        'e2e-tests/oauth-onboarding.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts', 'e2e-tests/replay-viewer.spec.ts',
        'e2e-tests/room-history-projection.spec.ts', 'e2e-tests/room-history-window.spec.ts',
        'e2e-tests/room-invitations.spec.ts', 'e2e-tests/ws-dual-player.spec.ts',
      ], grep: null },
      { kind: 'browser', browser: 'chromium', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@ws' },
      { kind: 'browser', browser: 'webkit', files: [
        'e2e-tests/frontend-browser-scenario-matrix.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts',
      ], grep: '@webkit' },
    ])
    expect(plan([...paths].reverse(), {
      vitest: [...recoveryInventory.vitest].reverse(), browser: [...recoveryInventory.browser].reverse(),
    }).checks).toEqual(selected.checks)
  })

  it.each([
    'server/new-business/handler.ts', 'server/game/new-business/handler.ts', 'shared/new-business/handler.ts', 'shared/contract/new-protocol/codec.ts',
    'client/services/llm/new-provider/client.ts', 'e2e-tests/new-consumer.spec.ts',
    'shared/actions/payment/__tests__/fixtures.ts', 'server/__tests__/_helpers/session-fixtures.ts', 'server/database/schema.sql',
    'server/game/room-policy.json', 'shared/contract/runtime.yml',
  ])('expands unknown ownership or absent test consumer evidence for %s', path => {
    const selected = plan(['server/game/room.ts', path], contractInventory)

    expect(selected.mode).toBe('full')
    expect(selected.checks).toEqual([
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'fast' },
      { kind: 'catalog', taskId: 'slow' }, { kind: 'catalog', taskId: 'build' },
      { kind: 'catalog', taskId: 'chromium-1' }, { kind: 'catalog', taskId: 'chromium-2' },
      { kind: 'catalog', taskId: 'chromium-3' }, { kind: 'catalog', taskId: 'chromium-4' },
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
    ])
    expect(selected.expansionReasons.length).toBeGreaterThan(0)
  })

  it.each([
    { path: 'server/game/room.ts', tests: inventory, missing: 'client/services/__tests__/gameTransport-reconnect.test.ts' },
    { path: 'server/game/replay-store.ts', tests: recoveryInventory, missing: 'scripts/__tests__/publish-replay-viewer.test.ts' },
    { path: 'shared/contract/protocol/ws.ts', tests: contractInventory, missing: 'client/services/__tests__/api-contract.test.ts' },
    { path: 'server/workshop-sandbox-contract.ts', tests: workshopInventory, missing: 'server/__tests__/workshop-timing-payment-session.test.ts' },
    { path: 'docs/CUSTOM_CARD_SANDBOX.md', tests: workshopInventory, missing: 'scripts/__tests__/docs-budget.test.ts' },
    { path: 'docs/architecture/payment.md', tests: workshopInventory, missing: 'client/services/llm/generation/__tests__/references.test.ts' },
    { path: 'docs/CUSTOM_CARD_SANDBOX.md', tests: workshopInventory, missing: 'server/__tests__/workshop-composed-behaviors-session.test.ts' },
  ])('cannot omit the declared test $missing', ({ path, tests, missing }) => {
    expect(() => plan([path], { ...tests, vitest: tests.vitest.filter(test => test.file !== missing) })).toThrow(missing)
  })

  it.each([
    { path: 'server/game/room.ts', tests: inventory, missing: 'e2e-tests/frontend-browser-scenario-matrix.spec.ts' },
    { path: 'server/game/replay-store.ts', tests: recoveryInventory, missing: 'e2e-tests/replay-viewer.spec.ts' },
    { path: 'shared/contract/protocol/ws.ts', tests: contractInventory, missing: 'e2e-tests/replay-viewer-csp.spec.ts' },
    { path: 'server/workshop-sandbox-contract.ts', tests: workshopInventory, missing: 'e2e-tests/workshop-generation.spec.ts' },
  ])('cannot omit the declared browser $missing', ({ path, tests, missing }) => {
    expect(() => plan([path], { ...tests, browser: tests.browser.filter(file => file !== missing) })).toThrow(missing)
  })

  it('rejects a missing slow project and reassigned required protocol consumer', () => {
    expect(() => plan(['shared/contract/protocol/ws.ts'], {
      ...contractInventory, vitest: contractInventory.vitest.filter(test => test.project !== 'slow'),
    })).toThrow('slow')

    expect(() => plan(['shared/contract/protocol/ws.ts'], {
      ...contractInventory, vitest: contractInventory.vitest.map(test => test.file === 'client/services/__tests__/api-contract.test.ts'
        ? { ...test, project: 'fast-shared' } : test),
    })).toThrow('client/services/__tests__/api-contract.test.ts')
  })
})
