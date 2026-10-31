import type { FarmTerrainKind } from '../../../shared/moor/types'
import { tileVariant } from './farm-tile-variants'

const EMPTY_SLOT_VARIANTS = [
  [4, 0, 1, 2, 6],
  [5, 1, 6, 5, 4],
  [3, 3, 2, 1, 0],
] as const

/** The bare ground of a farm space: printed terrain, or one of the empty-slot drawings. */
export function FarmGroundSprite({ terrain, row, col }: { terrain?: FarmTerrainKind | null; row: number; col: number }) {
  return terrain
    ? <div className={`farm-terrain-sprite farm-terrain-sprite-${terrain}`} />
    : <div className={`empty-node empty-node-${tileVariant(EMPTY_SLOT_VARIANTS, row, col)}`} />
}
