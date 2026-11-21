import type { PlatformPage } from '../utils/platform-page-url'

const NAMED_PAGES: readonly PlatformPage[] = [
  'prerelease-handoff', 'game', 'workshop', 'lobby', 'settings', 'login', 'onboarding', 'reset-password', 'operations', 'encyclopedia',
]

/**
 * The platform page a URL opens. Startup reads it before the app chunk loads, so it takes the hot-seat setup check as an
 * argument instead of importing it; without one, a hot-seat setup link reads as the lobby.
 */
export function platformPageFromSearch(search: string, isHotseatSetup: (search: string) => boolean = () => false): PlatformPage {
  const params = new URLSearchParams(search)
  const page = params.get('page')
  if (page && (NAMED_PAGES as readonly string[]).includes(page)) return page as PlatformPage
  if (params.get('context')) return 'game'
  if (params.get('room') || params.get('transport') === 'ws') return 'game'
  if (isHotseatSetup(search)) return 'game'
  return 'lobby'
}
