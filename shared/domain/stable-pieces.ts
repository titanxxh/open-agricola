import type { PlayerState } from '../contract/types'
import { positionKey } from './farmyard-geometry'

export const getOrdinaryStableCount = (player: Pick<PlayerState, 'stableTiles'>): number => player.stableTiles.length

/** Preserve standing tokens and reuse the first returned token for the next build. */
export function assignStablePieceIds(player: PlayerState): Record<string, number> {
  const pieces: Record<string, number> = {}
  const used = new Set<number>()
  for (const tile of player.stableTiles) {
    const key = positionKey(tile)
    const existing = player.stablePieceIds?.[key]
    if (existing !== undefined && Number.isInteger(existing) && existing >= 0 && !used.has(existing)) {
      pieces[key] = existing
      used.add(existing)
    }
  }
  for (const tile of player.stableTiles) {
    const key = positionKey(tile)
    if (pieces[key] !== undefined) continue
    let piece = 0
    while (used.has(piece)) piece++
    pieces[key] = piece
    used.add(piece)
  }
  player.stablePieceIds = pieces
  return pieces
}
