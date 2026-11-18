import type { PlayerState } from '../../contract/types'
import { playerHasCardCapability } from './card-type'

/** Authoritative hand discard; plays, transfers and passes must not call this. */
export const discardHandCards = (
  player: PlayerState,
  kind: 'minor' | 'occupation',
  ids: readonly string[],
): boolean => {
  const zone = kind === 'minor' ? 'minorHand' : 'occupationHand'
  if (playerHasCardCapability(player, 'preventsHandDiscard')) return false
  if (new Set(ids).size !== ids.length || !ids.every((id) => player[zone].includes(id)))
    return false
  const discarded = new Set(ids)
  player[zone] = player[zone].filter((id) => !discarded.has(id))
  player.discardedHandCardCount = (player.discardedHandCardCount ?? 0) + ids.length
  return true
}
