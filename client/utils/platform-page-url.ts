export type PlatformPage = 'login' | 'lobby' | 'workshop' | 'game' | 'settings' | 'onboarding'

const PAGE_SCOPED_QUERY_KEYS = [
  'card',
  'view',
  'room',
  'player',
  'playerId',
  'transport',
  'hotseat',
  'maxPlayers',
  'draftMode',
  'draftPoolSize',
  'enableCommunityDeck',
  'enableParentCards',
  'draftParents',
  'enableThroughTheSeasons',
  'enableFarmersOfTheMoor',
  'allowIncompleteFarmersOfTheMoorMinorDeal',
  'enableSnakeOpening',
  'customCards',
  'embedded',
  'devMode',
  'authMode',
  'context',
  'step',
  'frame',
  'perspective',
  'layout',
  'bugReportConnection',
]

export function buildPlatformPageUrl(
  page: PlatformPage,
  extraParams?: Record<string, string>,
) {
  const params = new URLSearchParams(window.location.search)
  for (const key of PAGE_SCOPED_QUERY_KEYS) params.delete(key)
  if (page === 'lobby') params.delete('page')
  else params.set('page', page)
  for (const [key, value] of Object.entries(extraParams ?? {})) params.set(key, value)
  const search = params.toString()
  return `${window.location.pathname}${search ? `?${search}` : ''}`
}

export function setPage(page: PlatformPage, extraParams?: Record<string, string>) {
  const newUrl = buildPlatformPageUrl(page, extraParams)
  window.history.pushState(null, '', newUrl)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
