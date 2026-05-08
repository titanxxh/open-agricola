import type { PlayerState, FarmTilePosition } from '../contract/types.ts'

/**
 * Readonly view of a fenced pasture region. Projects the persisted
 * `PlayerState.pastures` entries into a domain value type.
 *
 * We reuse the persisted view (computed upstream by
 * `validateFenceSelection`) rather than re-running geometry from
 * `fenceSegments`; that keeps the `stables` factor honest so capacity
 * matches the legacy authority
 * `actions/helpers/animal-zones.getPastureCapacity`
 * (`size * 2 * 2^stables`).
 */
export type Pasture = {
  readonly id: string
  readonly tiles: ReadonlyArray<FarmTilePosition>
  readonly capacity: number
  readonly stables: number
  readonly hasWell: boolean
}

/**
 * Project `player.pastures` into the domain `Pasture` value type.
 *
 * Name retained for migration stability — `player.pastures` is itself
 * derived from `fenceSegments` upstream by `validateFenceSelection`,
 * so the "from fences" framing is still accurate at one remove.
 */
export function computePasturesFromFences(player: PlayerState): Pasture[] {
  return (player.pastures ?? []).map((p) => ({
    id: p.id,
    tiles: p.tiles ?? [],
    capacity: p.size * 2 * Math.pow(2, p.stables ?? 0),
    stables: p.stables ?? 0,
    hasWell: false,
  }))
}
