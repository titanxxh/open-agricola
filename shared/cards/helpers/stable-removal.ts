import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { positionKey } from '../../domain/farm'
import {
  clearFarmHandStablePosition,
  getFarmHandStablePosition,
} from '../../domain/stables'

/**
 * Stable-tile return helpers — the single abstraction layer for "put a
 * stable back in the supply" across both normal stables and the B85
 * FarmHand special stable.
 *
 * Cards that return stables (D102 Sample Stable Maker, E76 Lumber Pile,
 * or any future card) go through these helpers and remain agnostic to
 * where the FarmHand stable is stored. See
 * `docs/superpowers/specs/2026-04-24-c150-and-farmhand-model-design.md`
 * §3.5.1 for the encapsulation rule.
 *
 * The B85 FarmHand storage detail is encapsulated by `shared/domain/stables.ts`.
 */

/**
 * Remove a normal stable at the given tile. Returns false when no normal
 * stable sits on that tile (e.g. when the tile belongs to the FarmHand
 * stable instead). Cards should prefer {@link removeStableOrFarmHandAtTile}
 * to handle both kinds uniformly.
 */
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
 * first, then the FarmHand stable (if present). Useful as `selectableTiles`
 * input to a farm-position selection action.
 */
export const listReturnableStableTiles = (
  player: PlayerState,
): FarmTilePosition[] => {
  const tiles: FarmTilePosition[] = player.stableTiles.map((t) => ({
    row: t.row,
    col: t.col,
  }))
  const farmHand = getFarmHandStablePosition(player)
  if (farmHand) {
    // Avoid listing the same coordinate twice when the FarmHand tile
    // coincides with a normal stable (shouldn't happen by construction
    // but the guard keeps the list a set-in-spirit).
    const farmHandKey = positionKey(farmHand)
    if (!tiles.some((t) => positionKey(t) === farmHandKey)) {
      tiles.push({ row: farmHand.row, col: farmHand.col })
    }
  }
  return tiles
}

export type ReturnedStableKind = 'normal' | 'farmhand'

/**
 * Remove whichever stable (normal or FarmHand) sits at the given tile.
 * Returns the kind removed, or null when no stable is there.
 *
 * Callers should treat the two kinds identically for payout purposes —
 * The reference and rulings apply the same resource gain to both.
 */
export const removeStableOrFarmHandAtTile = (
  player: PlayerState,
  tile: FarmTilePosition,
): ReturnedStableKind | null => {
  const farmHand = getFarmHandStablePosition(player)
  if (farmHand && farmHand.row === tile.row && farmHand.col === tile.col) {
    clearFarmHandStablePosition(player)
    return 'farmhand'
  }
  return removeStableAtTile(player, tile) ? 'normal' : null
}
