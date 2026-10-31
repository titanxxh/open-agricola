import type { PlannedCheck, TestInventory } from './verification-plan'

type BrowserCheck = Extract<PlannedCheck, { kind: 'browser' }>
const browser = (files: string[], grep: string | null = null, engine: BrowserCheck['browser'] = 'chromium'): BrowserCheck => ({
  kind: 'browser', browser: engine, files: files.map(file => `e2e-tests/${file}.spec.ts`), grep,
})
const safari = (additionalFiles: string[] = []) => browser(['frontend-browser-scenario-matrix', ...additionalFiles], '@webkit', 'webkit')
const groups = [
  {
    name: 'game shell, header and opening',
    owns: /^client\/(?:app\/(?:GameContainerApi|GameEndControls|HotseatHandoff|hotseat-seat|game-container-helpers|game-setup-query|solo\/|draft\/|parents\/)|components\/header\/|styles\/(?:components\/game-end|pages\/(?:game|draft|solo)))/,
    checks: [
      browser(['game-end', 'hosted-password-login', 'ws-dual-player', 'draft-opening-order', 'hotseat-public-farms', 'standard-solo-ui', 'setup-navigation', 'encyclopedia-in-game']),
      browser(['frontend-browser-scenario-matrix'], '@viewport|@ws'), safari(),
    ],
  },
  {
    name: 'farm board',
    owns: /^(?:client\/components\/board\/|client\/app\/(?:GameContainerApi\.|DesktopPublicFarms|farm-))/,
    checks: [
      browser(['farm-select', 'choice-previews', 'farm-card-targets', 'desktop-table-layout', 'mobile-game-layout', 'encyclopedia-faces', 'encyclopedia-in-game']),
      browser(['frontend-browser-scenario-matrix'], '@viewport|@ws'), safari(),
    ],
  },
  {
    name: 'scoring presentation',
    owns: /^client\/(?:components\/board\/Scoring|app\/(?:GameContainerApi\.|.*scor)|styles\/components\/scor)/i,
    checks: [browser(['source-aware-scoring', 'mobile-scoring-pad']), safari()],
  },
  {
    name: 'interaction',
    owns: /^(?:client\/components\/interaction\/|client\/app\/(?:GameContainerApi\.|interaction-)|client\/hooks\/use(?:CardPlayChoice|FarmSelection|RequestActivation))/,
    checks: [
      browser(['choice-previews', 'online-interaction-completion', 'interaction-focus', 'mobile-interaction-continuity', 'encyclopedia-in-game']),
      browser(['frontend-browser-scenario-matrix'], '@viewport|@ws'), safari(),
    ],
  },
  {
    name: 'auth and transport',
    owns: /^client\/(?:contexts\/AuthContext|services\/(?:gameTransport|room-command-journal|room-creation|oauth-onboarding)|hooks\/useGameSync|app\/(?:LoginPage|OnboardingPage|PageRouter|RoomInvitePicker|WaitingRoomPlayers|LobbyPage|MyActiveGames|useAccountLinking|auth-errors|ws-status))(?:[.-]|$)/,
    checks: [
      browser(['hosted-password-login', 'oauth-onboarding', 'room-invitations', 'ws-dual-player', 'encyclopedia-entry', 'encyclopedia', 'encyclopedia-in-game']),
      browser(['frontend-browser-scenario-matrix'], '@ws'), safari(['encyclopedia']),
    ],
  },
  {
    name: 'locale',
    owns: /^client\/(?:contexts\/LocaleContext|services\/language-pack)(?:[.-]|$)/,
    checks: [
      browser(['interface-localization', 'interface-localization-fields', 'card-localization', 'encyclopedia-search', 'encyclopedia', 'encyclopedia-pages']),
      browser(['frontend-browser-scenario-matrix'], '@locale'), safari(['encyclopedia']),
    ],
  },
  {
    name: 'replay',
    owns: /^(?:replay-viewer\/(?:src\/|index\.html$)|client\/app\/(?:Replay(?:Shell|Board|Viewer)|replay-))/,
    checks: [
      browser(['replay-viewer', 'replay-viewer-csp', 'game-context-recovery']),
      browser(['replay-viewer-csp'], '@webkit', 'webkit'),
    ],
  },
]

const sharedPresentation = /^client\/(?:components\/(?:common|effects|dev)\/|styles\/|hooks\/useElementWidth\.|(?:App|main)\.|app\/(?:AppErrorBoundary|AppShellLoadScreen|GameContextRouter|game-load-progress|SettingsPage|BugReportBar|OperationsPage|public-event-|private-event-|action-log-|anytime-exchange|bake-exchange|exchange-|animal-reorg-)|services\/(?:observability|bug-report-diagnostics|card-meta|parent-assets|solo-creation-configuration)\.)/

export function frontendOwnership(path: string): string[] {
  const modulePath = path.replace('/__tests__/', '/')
  const owners = groups.filter(candidate => candidate.owns.test(modulePath)).map(group => group.name)
  if (!owners.length && sharedPresentation.test(modulePath)) owners.push('shared frontend presentation')
  return owners
}

export function frontendVerification(paths: string[], inventory: TestInventory): { checks: PlannedCheck[]; expansionReasons: string[] } {
  const files = inventory.vitest.filter(test => test.project === 'fast-client').map(test => test.file)
  if (!files.length || !inventory.browser.length) {
    return { checks: [], expansionReasons: ['Frontend test or browser consumers are missing; full verification is required.'] }
  }
  const selected = new Set<typeof groups[number]>()
  let completeBrowserLayer = false
  const expansionReasons: string[] = []
  for (const path of paths) {
    const modulePath = path.replace('/__tests__/', '/')
    const owned = groups.filter(candidate => candidate.owns.test(modulePath))
    if (!owned.length && sharedPresentation.test(modulePath)) completeBrowserLayer = true
    else if (!owned.length) expansionReasons.push(`Frontend module ownership is unknown for ${path}; full verification is required.`)
    owned.forEach(group => selected.add(group))
  }
  const declaredChecks = [
    ...[...selected].flatMap(group => group.checks),
    ...(completeBrowserLayer ? [safari(['encyclopedia', 'replay-viewer-csp'])] : []),
  ]
  const browserChecks: PlannedCheck[] = completeBrowserLayer
    ? [browser(inventory.browser.map(file => file.replace(/^e2e-tests\//, '').replace(/\.spec\.ts$/, ''))),
      { kind: 'catalog', taskId: 'webkit' }]
    : declaredChecks
  const missing = [...new Set([...declaredChecks, ...browserChecks].flatMap(check => check.kind === 'browser' ? check.files : []))]
    .filter(file => !inventory.browser.includes(file))
  if (missing.length) throw new Error(`Declared frontend browser consumers are missing: ${[...new Set(missing)].join(', ')}`)
  return {
    checks: [
      { kind: 'vitest', project: 'fast-client', files },
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      ...browserChecks,
    ],
    expansionReasons,
  }
}
