/**
 * Query-string plumbing for the lobby's game setup panel.
 *
 * Kept free of browser globals and transport imports so it stays testable in a
 * plain Node environment: this module may only use `URLSearchParams`.
 */

/**
 * Setup options for a local-hotseat game. Mirrors the room-creation options of
 * `sendRoomCommand('createRoom', ...)` so the lobby panel can offer the same
 * choices for both modes; the server maps them onto `InitialStateOptions`.
 */
export type HotseatGameOptions = {
  playerCount?: number
  customCardIds?: string[]
  enableCommunityDeck?: boolean
  enableParentCards?: boolean
  draftParents?: boolean
  enableThroughTheSeasons?: boolean
  enableFarmersOfTheMoor?: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
  draftMode?: 'none' | 'simultaneous'
  draftPoolSize?: number
}

/**
 * Read the simultaneous-draft options out of a game URL.
 *
 * - Unknown/missing `draftMode` → returns `undefined` (classic hand-deal).
 * - `draftMode=simultaneous` without a valid `draftPoolSize` → returns
 *   `{ draftMode: 'simultaneous' }` (server will clamp/apply default).
 * - `draftPoolSize` must be integer in [7, 10]; out-of-range values are dropped.
 */
export function parseDraftParamsFromQuery(
  search: string,
): { draftMode: 'simultaneous'; draftPoolSize?: number } | undefined {
  const params = new URLSearchParams(search)
  if (params.get('draftMode') !== 'simultaneous') return undefined
  const raw = params.get('draftPoolSize')
  const parsed = raw != null ? Number(raw) : NaN
  if (Number.isInteger(parsed) && parsed >= 7 && parsed <= 10) {
    return { draftMode: 'simultaneous', draftPoolSize: parsed }
  }
  return { draftMode: 'simultaneous' }
}

/** Query keys the lobby sets when it hands a hotseat setup to the game page. */
export const HOTSEAT_SETUP_PARAM_KEYS = [
  'hotseat',
  'maxPlayers',
  'draftMode',
  'draftPoolSize',
  'enableCommunityDeck',
  'customCards',
  'enableParentCards',
  'draftParents',
  'enableThroughTheSeasons',
  'enableFarmersOfTheMoor',
  'allowIncompleteFarmersOfTheMoorMinorDeal',
] as const

/**
 * `hotseat=1` asks for a fresh deal; once dealt the flag is rewritten to
 * `hotseat=live`, which marks the running game without re-dealing on reload.
 * Both mean "this is a hotseat game" — plain HTTP sessions (workshop sandbox,
 * E2E, debugging) carry no flag and keep their single-viewer behaviour.
 */
export const HOTSEAT_LIVE_VALUE = 'live'

export const isHotseatSetupQuery = (search: string): boolean =>
  new URLSearchParams(search).get('hotseat') === '1'

export const isHotseatModeQuery = (search: string): boolean => {
  const flag = new URLSearchParams(search).get('hotseat')
  return flag === '1' || flag === HOTSEAT_LIVE_VALUE
}

/**
 * Map the lobby's query string onto the setup payload for `/api/game/new`.
 * Mirrors the multiplayer `createRoom` params so both modes offer the same
 * player counts and expansions.
 */
export const parseHotseatSetupFromQuery = (search: string): HotseatGameOptions => {
  const params = new URLSearchParams(search)
  const rawPlayerCount = Number(params.get('maxPlayers'))
  const playerCount = Number.isFinite(rawPlayerCount)
    ? Math.min(Math.max(2, Math.floor(rawPlayerCount)), 6)
    : 2
  const enableCommunityDeck = params.get('enableCommunityDeck') === 'true'
  const customCards = params.get('customCards')
  const customCardIds = enableCommunityDeck && customCards
    ? customCards.split(',').map((id) => id.trim()).filter(Boolean)
    : []
  return {
    playerCount,
    enableCommunityDeck,
    ...(customCardIds.length > 0 ? { customCardIds } : {}),
    enableParentCards: params.get('enableParentCards') === 'true',
    ...(params.get('draftParents') === 'false' ? { draftParents: false } : {}),
    enableThroughTheSeasons: params.get('enableThroughTheSeasons') === 'true',
    enableFarmersOfTheMoor: params.get('enableFarmersOfTheMoor') === 'true',
    allowIncompleteFarmersOfTheMoorMinorDeal:
      params.get('allowIncompleteFarmersOfTheMoorMinorDeal') === 'true',
    ...(parseDraftParamsFromQuery(search) ?? {}),
  }
}

/**
 * Drop the setup keys once the game exists, so reloading resumes the running
 * hotseat game instead of dealing a fresh one, while keeping the mode flag.
 */
export const stripHotseatSetupParams = (search: string): string => {
  const params = new URLSearchParams(search)
  for (const key of HOTSEAT_SETUP_PARAM_KEYS) params.delete(key)
  params.set('hotseat', HOTSEAT_LIVE_VALUE)
  return params.toString()
}
