import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { positionKey } from '../../domain/farm'
import { collectBuiltSpecialStables, getCardEffect } from '../card-effects'

/** Return ordinary tiles directly and delegate special tiles to their owning source. */
const removeStableAtTile = (
  player: PlayerState,
  tile: FarmTilePosition,
): boolean => {
  const targetKey = positionKey(tile)
  const index = player.stableTiles.findIndex(
    (existing) => positionKey(existing) === targetKey,
  )
  if (index === -1) return false
  player.stableTiles.splice(index, 1)

  for (const pasture of player.pastures ?? []) {
    if ((pasture.stables ?? 0) <= 0) continue
    if (pasture.tiles?.some((t) => positionKey(t) === targetKey)) {
      pasture.stables = Math.max(0, pasture.stables - 1)
      break
    }
  }

  return true
}

/**
 * Selection-candidate list for "return-a-stable" flows: normal stables
 * first, then source-tagged special stables. Useful as `selectableTiles`
 * input to a farm-position selection action.
 */
export const listReturnableStableTiles = (
  player: PlayerState,
): FarmTilePosition[] => {
  const tiles: FarmTilePosition[] = player.stableTiles.map((t) => ({
    row: t.row,
    col: t.col,
  }))
  for (const { position } of collectBuiltSpecialStables(player)) {
    if (!tiles.some((tile) => positionKey(tile) === positionKey(position))) tiles.push({ ...position })
  }
  return tiles
}

export type ReturnedStableKind = 'normal' | 'special'

/** Return the unique source at this position; ambiguous overlaps are rejected without mutation. */
export const returnStableAtTile = (
  player: PlayerState,
  tile: FarmTilePosition,
): ReturnedStableKind | null => {
  const special = collectBuiltSpecialStables(player).filter((entry) => positionKey(entry.position) === positionKey(tile))
  const ordinary = player.stableTiles.some((entry) => positionKey(entry) === positionKey(tile))
  if (special.length > 1 || (special.length > 0 && ordinary)) return null
  if (special.length === 1) {
    const source = special[0]!
    return getCardEffect(source.sourceCardId)?.returnSpecialStable?.(player, tile) ? 'special' : null
  }
  return removeStableAtTile(player, tile) ? 'normal' : null
}
