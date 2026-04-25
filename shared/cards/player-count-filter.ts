/**
 * Decide whether a card declared with `players: <field>` should be eligible
 * for the current game's player count.
 *
 * Recognized formats:
 *   - undefined / empty   → always eligible
 *   - "N+"                → playerCount >= N
 *   - "N-M"               → N <= playerCount <= M
 *   - "N"                 → playerCount === N
 *
 * Unknown formats fail open (return true) so a malformed `players` value
 * never silently deletes a card from the pool.
 */
export const cardAllowedForPlayerCount = (
  playersField: string | undefined,
  playerCount: number,
): boolean => {
  if (!playersField) return true
  const s = playersField.trim()
  if (s === '') return true

  const plus = /^(\d+)\+$/.exec(s)
  if (plus) return playerCount >= Number(plus[1])

  const range = /^(\d+)-(\d+)$/.exec(s)
  if (range) {
    const lo = Number(range[1])
    const hi = Number(range[2])
    return playerCount >= lo && playerCount <= hi
  }

  const exact = /^(\d+)$/.exec(s)
  if (exact) return playerCount === Number(exact[1])

  return true
}
