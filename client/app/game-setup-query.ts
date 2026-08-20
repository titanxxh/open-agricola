/**
 * Query-string plumbing for the lobby's game setup panel.
 *
 * Kept free of browser globals and transport imports so it stays testable in a
 * plain Node environment: this module may only use `URLSearchParams`.
 */

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

/**
 * The lobby's hotseat entry asks for a room where one device plays every seat.
 * It only matters while creating the room; afterwards the server's `roomJoined`
 * answer is what tells the client the game is a hotseat one.
 */
export const isHotseatSetupQuery = (search: string): boolean =>
  new URLSearchParams(search).get('hotseat') === '1'
