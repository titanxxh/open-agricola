import type { PlannedCheck, TestInventory } from './verification-plan'

type BrowserCheck = Extract<PlannedCheck, { kind: 'browser' }>
const browser = (files: string[], grep: string | null = null, engine: BrowserCheck['browser'] = 'chromium'): BrowserCheck => ({
  kind: 'browser', browser: engine, files: files.map(file => `e2e-tests/${file}.spec.ts`), grep,
})
const safari = () => browser(['frontend-browser-scenario-matrix'], '@webkit', 'webkit')
const groups = [
  {
    name: 'farm board',
    owns: /^(?:client\/components\/board\/(?:FarmBoard|PlayerFarmPanel|farmHandCenter)(?:[.-]|$)|client\/app\/(?:DesktopPublicFarms|farm-))/,
    checks: [
      browser(['farm-select', 'choice-previews', 'farm-card-targets', 'desktop-table-layout', 'mobile-game-layout']),
      browser(['frontend-browser-scenario-matrix'], '@viewport|@ws'), safari(),
    ],
  },
  {
    name: 'interaction',
    owns: /^(?:client\/components\/interaction\/|client\/app\/interaction-|client\/hooks\/use(?:CardPlayChoice|FarmSelection|RequestActivation))/,
    checks: [
      browser(['choice-previews', 'online-interaction-completion', 'interaction-focus', 'mobile-interaction-continuity']),
      browser(['frontend-browser-scenario-matrix'], '@viewport|@ws'), safari(),
    ],
  },
  {
    name: 'auth and transport',
    owns: /^client\/(?:contexts\/AuthContext|services\/(?:gameTransport|room-command-journal|room-creation|oauth-onboarding)|hooks\/useGameSync|app\/(?:LoginPage|OnboardingPage|PageRouter|RoomInvitePicker|WaitingRoomPlayers|LobbyPage|MyActiveGames|useAccountLinking|auth-errors|ws-status))(?:[.-]|$)/,
    checks: [
      browser(['hosted-password-login', 'oauth-onboarding', 'room-invitations', 'ws-dual-player']),
      browser(['frontend-browser-scenario-matrix'], '@ws'), safari(),
    ],
  },
  {
    name: 'locale',
    owns: /^client\/(?:contexts\/LocaleContext|services\/language-pack)(?:[.-]|$)/,
    checks: [
      browser(['interface-localization', 'interface-localization-fields', 'card-localization']),
      browser(['frontend-browser-scenario-matrix'], '@locale'), safari(),
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

export function frontendVerification(paths: string[], inventory: TestInventory): { checks: PlannedCheck[]; expansionReasons: string[] } {
  const files = inventory.vitest.filter(test => test.project === 'fast-client').map(test => test.file)
  if (!files.length || !inventory.browser.length) {
    return { checks: [], expansionReasons: ['Frontend test or browser consumers are missing; full verification is required.'] }
  }
  const selected = new Set<typeof groups[number]>()
  for (const path of paths) {
    const modulePath = path.replace('/__tests__/', '/')
    const group = groups.find(candidate => candidate.owns.test(modulePath))
    if (!group) return { checks: [], expansionReasons: [`Frontend module ownership is unknown for ${path}; full verification is required.`] }
    selected.add(group)
  }
  const browserChecks = [...selected].flatMap(group => group.checks)
  const missing = browserChecks.flatMap(check => check.files).filter(file => !inventory.browser.includes(file))
  if (missing.length) return { checks: [], expansionReasons: [`Declared frontend browser consumers are missing: ${[...new Set(missing)].join(', ')}; full verification is required.`] }
  return {
    checks: [
      { kind: 'vitest', project: 'fast-client', files },
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
      ...browserChecks,
    ],
    expansionReasons: [],
  }
}
