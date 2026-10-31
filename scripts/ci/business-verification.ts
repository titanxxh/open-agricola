import type { PlannedCheck, TestInventory, VerificationScope } from './verification-plan'
import type { TestConsumerIndex } from './test-consumers'
import { assertConsumerCoverage } from './support-verification'

type BrowserCheck = Extract<PlannedCheck, { kind: 'browser' }>
type BusinessGroup = {
  name: string
  scope: Extract<VerificationScope, 'server' | 'recovery' | 'rules' | 'contract' | 'workshop' | 'operations'>
  owns: RegExp
  projects: string[]
  requiredTests: TestInventory['vitest']
  requiredBrowsers: string[]
  files: TestInventory['vitest']
  checks: PlannedCheck[]
}
const browser = (names: string[], grep: string | null = null, engine: BrowserCheck['browser'] = 'chromium'): BrowserCheck => ({
  kind: 'browser', browser: engine, files: names.map(name => `e2e-tests/${name}.spec.ts`), grep,
})

const ruleProjects = ['fast-shared', 'fast-cards', 'fast-card-runtime', 'fast-client', 'fast-server', 'fast-tests', 'slow']
const ruleTests = [
  { project: 'fast-shared', file: 'shared/actions/payment/internal/__tests__/pay.test.ts' },
  { project: 'fast-cards', file: 'shared/cards/__tests__/listener-purity-guard.test.ts' },
  { project: 'fast-card-runtime', file: 'shared/actions/effects/__tests__/pay-supply-token.test.ts' },
  { project: 'fast-server', file: 'server/__tests__/listener-purity-gate-session.test.ts' },
  { project: 'fast-tests', file: 'tests/cost-pay-parity.test.ts' },
]
const ruleBrowsers = browser([
  'choice-previews', 'listener-lifecycle-room', 'room-animal-holders', 'frontend-browser-scenario-matrix',
  'game-context-recovery', 'replay-viewer-csp', 'local-sandbox',
]).files
const completeBrowsers: PlannedCheck[] = ['chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit']
  .map(taskId => ({ kind: 'catalog', taskId }))
type Mapping = { checks: PlannedCheck[]; expansionReasons: string[]; wideningReasons: string[] }
const operationsTests: TestInventory['vitest'] = [
  { project: 'fast-server', file: 'server/__tests__/operations-accounts.test.ts' },
  { project: 'fast-server', file: 'server/__tests__/operations-openings.test.ts' },
  { project: 'fast-server', file: 'server/game/persistence/__tests__/opening-facts.test.ts' },
  { project: 'fast-server', file: 'server/__tests__/observability-http.test.ts' },
  { project: 'fast-scripts', file: 'scripts/__tests__/operations-deployment.test.ts' },
  { project: 'fast-scripts', file: 'scripts/__tests__/local-services.test.ts' },
  { project: 'fast-scripts', file: 'scripts/__tests__/wechat-community.test.ts' },
]
const operationsBrowsers = browser(['operations-dashboard', 'wechat-community']).files
const operationsEntry = /^operations\/(?:accounts-exporter\.ts|database-access\.ts|opening-metrics\.ts|provision\.ts|prometheus\.mjs|deploy\.mjs|Dockerfile|compose\.(?:local|prod)\.yml|grafana\/.+\.(?:json|ini|ya?ml))$/
const operationsBridge = /(?:^|\/)(?:deploy-operations\.sh|scripts\/(?:observability|local-services)\.mjs|server\/__tests__\/_helpers\/operations-reader\.ts)$/
const operationsPath = (file: string) => file.startsWith('operations/') || operationsBridge.test(file)
const operationsLiteral = (literal: string) => /^(?:\.\.?\/)*operations(?:\/|$)/.test(literal)
  || operationsBridge.test(literal) || /^(?:observability|local-services)\.mjs$/.test(literal)

function operationsVerification(paths: string[], inventory: TestInventory, consumers?: TestConsumerIndex): Mapping {
  const missing = [...operationsTests.filter(required => !inventory.vitest.some(test =>
    test.file === required.file && test.project === required.project)).map(test => test.file),
  ...operationsBrowsers.filter(file => !inventory.browser.includes(file))]
  if (missing.length) throw new Error(`Required operations consumers are missing: ${missing.join(', ')}`)
  const unknown = paths.find(path => !operationsEntry.test(path))
  if (unknown) return { checks: [], wideningReasons: [], expansionReasons: [
    `Operations entry ownership is unknown for ${unknown}; full verification is required.`,
  ] }
  const selected = new Set(operationsTests.map(test => test.file))
  operationsBrowsers.forEach(file => selected.add(file))
  const wideningReasons: string[] = []
  if (!consumers) {
    inventory.vitest.forEach(test => selected.add(test.file))
    wideningReasons.push('Operations consumer evidence is missing; verification retains the complete discovered unit inventory and complete browser lanes.')
  } else {
    for (const test of consumers.tests) {
      const associated = /(?:^|\/)(?:operations|ops)(?:[-/])/.test(test.file)
        || test.dependencies.some(operationsPath) || test.literals.some(operationsLiteral)
      const unknownLoader = test.uncertaintyReasons.some(reason =>
        /^(?:Computed module|Unresolved module|Unknown module loader|Indirect module)/.test(reason))
      if (associated || unknownLoader) selected.add(test.file)
      if (unknownLoader) wideningReasons.push(`Operations retains the complete uncertain module consumer ${test.file} alongside its declared behavior safety group.`)
    }
  }
  const checks: PlannedCheck[] = [...new Set(inventory.vitest.filter(test => selected.has(test.file)).map(test => test.project))]
    .map(project => ({ kind: 'vitest', project, files: inventory.vitest
      .filter(test => test.project === project && selected.has(test.file)).map(test => test.file).sort() }))
  if (!consumers) checks.push(...completeBrowsers)
  else {
    const files = inventory.browser.filter(file => selected.has(file)).sort()
    checks.push({ kind: 'browser', browser: 'chromium', files, grep: null })
    const webkit = files.filter(file => consumers.tests.find(test => test.file === file)?.literals.some(literal => /@webkit\b/.test(literal)))
    if (webkit.length) checks.push({ kind: 'browser', browser: 'webkit', files: webkit, grep: '@webkit' })
  }
  return { checks, expansionReasons: [], wideningReasons }
}

const groups: BusinessGroup[] = [{
  name: 'operations metrics and dashboards',
  scope: 'operations',
  owns: /^(?:operations\/|server\/(?:operations-(?:accounts|openings)\.[cm]?[jt]sx?$|database\/031-game-opening-facts\.sql$))/,
  projects: ['fast-server'],
  requiredTests: [
    { project: 'fast-server', file: 'server/__tests__/operations-accounts.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/operations-openings.test.ts' },
  ],
  requiredBrowsers: ['e2e-tests/operations-dashboard.spec.ts'],
  files: [],
  checks: [browser(['operations-dashboard'])],
}, {
  name: 'Workshop generation, sandbox contracts and references',
  scope: 'workshop',
  owns: /^(?:docs\/(?:CUSTOM_CARD_SANDBOX|CARD_TEST_TEMPLATE|ARCHITECTURE|card_implementation_status|community-card-examples)(?:_zh)?\.md|docs\/architecture\/[a-z-]+(?:_zh)?\.md|docs\/test\/llm-card-gen\.md|client\/sandbox\/README\.md|(?:client\/(?:local-sandbox\/[^/]+|sandbox\/[^/]+|app\/workshop\/[^/]+|app\/WorkshopPage|services\/(?:workshop-pr|generation-prompt|llm(?:\/(?:generation|providers))?\/[^/]+))|server\/(?:custom-code\/[^/]+|workshop(?:-[^/]+)?|(?:workshop-pr|workshop-review)\/[^/]+|game\/(?:custom-session-[^/]+|sandbox-authority|workshop-room-cards))|shared\/(?:custom-code\/[^/]+|contract\/workshop(?:-[^/]+)?|projections\/workshop-generation))(?:[.-])[^/]*)$/,
  projects: ruleProjects,
  requiredTests: [...ruleTests,
    { project: 'fast-shared', file: 'shared/custom-code/__tests__/contract-admission.test.ts' },
    { project: 'fast-shared', file: 'shared/projections/__tests__/workshop-generation.test.ts' },
    { project: 'fast-client', file: 'client/services/__tests__/generation-prompt.test.ts' },
    { project: 'fast-client', file: 'client/services/llm/generation/__tests__/references.test.ts' },
    { project: 'fast-client', file: 'client/local-sandbox/__tests__/card-test-runtime.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/workshop-capability-contract-session.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/workshop-composed-behaviors-session.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/workshop-timing-payment-session.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/workshop-sandbox-contract.test.ts' },
  ],
  requiredBrowsers: [],
  files: [
    { project: 'fast-scripts', file: 'scripts/__tests__/docs-budget.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/listener-contract-admission.test.ts' },
  ],
  checks: [
    { kind: 'catalog', taskId: 'browser-sandbox' },
    browser(['workshop-generation', 'workshop-smoke', 'workshop-workspace-acceptance', 'workshop-browser-card-tests', 'local-sandbox']),
    browser(['frontend-browser-scenario-matrix'], '@workshop'),
    browser(['frontend-browser-scenario-matrix'], '@webkit', 'webkit'),
  ],
}, {
  name: 'protocol, serialization and display projections',
  scope: 'contract',
  owns: /^(?:shared\/(?:contract(?:\/protocol)?|projections)\/[^/]+|shared\/session\/(?:serialization|sync-payload|interaction-state-adapter|interaction-privacy)|shared\/events\/(?:log-cache|log-mapper|log-player-names|public-event-presentation)|shared\/domain\/player-panel-summary|server\/(?:payload-validation|connection\/(?:envelope-builder|history-presentation)|game\/(?:replay-codec|command-input))|client\/(?:services\/rehydrate|types\/[^/]+)|replay-viewer\/src\/(?:model|types))(?:[.-])[^/]*$/,
  projects: ruleProjects,
  requiredTests: [...ruleTests,
    { project: 'fast-card-runtime', file: 'shared/session/__tests__/serialization-cursor.test.ts' },
    { project: 'fast-client', file: 'client/services/__tests__/api-contract.test.ts' },
    { project: 'fast-tests', file: 'tests/protocol-types.test.ts' },
    { project: 'fast-tests', file: 'tests/serialization.test.ts' },
  ],
  requiredBrowsers: ruleBrowsers,
  files: [],
  checks: completeBrowsers,
}, {
  name: 'storage, recovery and Replay',
  scope: 'recovery',
  owns: /^(?:server\/(?:game-context-routes|replay-routes|game\/(?:persistence\/[^/]+|room-committer|room-persistence-checkpoint|room-authority|room-directory|private-cursor-comparison|game-context-store|command-store|game-creation-store|replay-[^/]+)|storage\/[^/]+)|shared\/session\/(?:state-recovery|recovery-catalog|history-streams|history-window)|client\/hooks\/useRoomHistory)(?:[.-])[^/]*$/,
  projects: ['fast-shared', 'fast-card-runtime', 'fast-client', 'fast-server', 'fast-tests'],
  requiredTests: [
    { project: 'fast-card-runtime', file: 'shared/session/__tests__/serialization-cursor.test.ts' },
    { project: 'fast-client', file: 'client/app/__tests__/ReplayViewer.recovery.test.tsx' },
    { project: 'fast-server', file: 'server/game/persistence/__tests__/room-history-recovery.test.ts' },
    { project: 'fast-server', file: 'server/game/__tests__/replay-codec.test.ts' },
    { project: 'fast-tests', file: 'tests/replay-viewer-model.test.ts' },
    { project: 'fast-tests', file: 'tests/game-sync-pipeline.test.ts' },
  ],
  requiredBrowsers: [],
  files: [
    { project: 'fast-scripts', file: 'scripts/__tests__/publish-replay-viewer.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/replay-removal.test.ts' },
    { project: 'fast-scripts', file: 'scripts/__tests__/room-commit-acceptance.test.ts' },
  ],
  checks: [
    browser(['game-context-recovery', 'room-history-window', 'room-history-projection', 'replay-viewer', 'replay-viewer-csp', 'ws-dual-player']),
    browser(['frontend-browser-scenario-matrix'], '@ws'),
    browser(['frontend-browser-scenario-matrix', 'replay-viewer-csp'], '@webkit', 'webkit'),
  ],
}, {
  name: 'authentication, connections and rooms',
  scope: 'server',
  owns: /^server\/(?:auth(?:-cookies)?|anonymous-access|client-ip|email|http-origin|invites|lobby-my-rooms|frontend-hosting|payload-validation|ingress|rate-limit|oauth\/(?:providers|store|handler|github|google|types)|connection\/(?:ws-server|room-router|broadcaster|connection-ctx)|game\/(?:room|room-registry|room-access|lobby|creation-configuration|game-setup-options|game-creation-store|room-directory|room-discovery|room-authority|room-queue|command-input|command-store|execution-access|development-room-slots|game-end))(?:[.-])[^/]*$/,
  projects: ['fast-shared', 'fast-client', 'fast-server', 'fast-tests'],
  requiredTests: [
    { project: 'fast-shared', file: 'shared/contract/__tests__/authoritative-command.test.ts' },
    { project: 'fast-client', file: 'client/services/__tests__/gameTransport-reconnect.test.ts' },
    { project: 'fast-server', file: 'server/__tests__/auth.test.ts' },
    { project: 'fast-server', file: 'server/connection/__tests__/ws-server.test.ts' },
    { project: 'fast-server', file: 'server/game/__tests__/room.test.ts' },
    { project: 'fast-tests', file: 'tests/game-sync-pipeline.test.ts' },
  ],
  requiredBrowsers: [],
  files: [],
  checks: [
    browser(['hosted-password-login', 'oauth-onboarding', 'room-invitations', 'ws-dual-player']),
    browser(['frontend-browser-scenario-matrix'], '@ws'),
    browser(['frontend-browser-scenario-matrix'], '@webkit', 'webkit'),
  ],
}, {
  name: 'shared rules, actions, engine and Session',
  scope: 'rules',
  owns: /^(?:server\/game\/authoritative-session\.[cm]?[jt]s|shared\/(?:actions(?:\/(?:effects(?:\/internal)?|factories|helpers|payment(?:\/internal)?|plans))?|domain|draft|engine(?:\/nodes)?|events|moor|parents(?:\/cards)?|seasons|session(?:\/phases)?|utils|i18n)\/[^/]+\.[cm]?[jt]sx?)$/,
  projects: ruleProjects,
  requiredTests: ruleTests,
  requiredBrowsers: ruleBrowsers,
  files: [],
  checks: completeBrowsers,
}]

function groupFor(path: string): BusinessGroup | undefined {
  if (!/^(?:operations\/|server\/database\/031-game-opening-facts\.sql$)/.test(path)
    && !/\.[cm]?[jt]sx?$/.test(path) && !/^(?:docs\/.+|client\/sandbox\/README)\.md$/.test(path)) return undefined
  return groups.find(group => group.owns.test(path.replaceAll('/__tests__/', '/')))
}

export function businessScopeFor(path: string): BusinessGroup['scope'] | null {
  return groupFor(path)?.scope ?? null
}

export function businessVerification(paths: string[], inventory: TestInventory, consumers?: TestConsumerIndex): Mapping {
  if (consumers) assertConsumerCoverage(inventory, consumers)
  const selected = new Set<BusinessGroup>()
  const expansionReasons: string[] = []
  for (const path of paths) {
    if (path.startsWith('operations/')) continue
    const group = groupFor(path)
    if (group) selected.add(group)
    else expansionReasons.push(`Business module ownership is unknown for ${path}; full verification is required.`)
  }
  for (const group of selected) {
    const missingTests = [...group.requiredTests, ...group.files]
      .filter(required => !inventory.vitest.some(test => test.file === required.file && test.project === required.project))
    const missingProjects = group.projects.filter(project => !inventory.vitest.some(test => test.project === project))
    const missingBrowsers = [...group.requiredBrowsers, ...group.checks.flatMap(check => check.kind === 'browser' ? check.files : [])]
      .filter(file => !inventory.browser.includes(file))
    if (missingTests.length || missingProjects.length || missingBrowsers.length) {
      throw new Error(`Required consumers for ${group.name} are missing: ${[...missingProjects, ...missingTests.map(test => test.file), ...missingBrowsers].join(', ')}`)
    }
  }
  const operations = paths.filter(path => path.startsWith('operations/'))
  const mapping = operations.length ? operationsVerification(operations, inventory, consumers)
    : { checks: [], expansionReasons: [], wideningReasons: [] }
  expansionReasons.push(...mapping.expansionReasons)
  if (expansionReasons.length) return { checks: [], expansionReasons, wideningReasons: mapping.wideningReasons }
  const checks: PlannedCheck[] = [...mapping.checks]
  for (const group of selected) {
    checks.push(...group.projects.map((project): PlannedCheck => ({
      kind: 'vitest', project,
      files: inventory.vitest.filter(test => test.project === project).map(test => test.file).sort(),
    })), ...[...new Set(group.files.map(test => test.project))].map((project): PlannedCheck => ({
      kind: 'vitest', project,
      files: group.files.filter(test => test.project === project).map(test => test.file).sort(),
    })), ...group.checks)
  }
  return {
    checks: [
      ...checks.filter(check => check.kind === 'vitest'),
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      ...checks.filter(check => check.kind !== 'vitest'),
    ],
    expansionReasons: [],
    wideningReasons: mapping.wideningReasons,
  }
}
