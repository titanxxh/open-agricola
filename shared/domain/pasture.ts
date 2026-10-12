import type { Pasture as PastureState, PlayerState } from '../contract/types'
import { positionKey } from './farmyard-geometry'

/** Read-only pasture facts derived from the current farm, never stored. */
export type Pasture = Readonly<PastureState> & {
  readonly size: number
  readonly stables: number
  readonly capacity: number
  readonly hasWell: boolean
}

export const getPastureSize = (pasture: Pick<PastureState, 'tiles'>): number =>
  pasture.tiles.length

export const getPastureStableCount = (
  player: Pick<PlayerState, 'stableTiles'>,
  pasture: Pick<PastureState, 'tiles'>,
): number => {
  const stableKeys = new Set(player.stableTiles.map(positionKey))
  return pasture.tiles.filter(tile => stableKeys.has(positionKey(tile))).length
}

/** Base capacity; animal-zone queries apply card capacity modifiers afterwards. */
export const getPastureCapacity = (
  player: Pick<PlayerState, 'stableTiles'>,
  pasture: Pick<PastureState, 'tiles'>,
): number => getPastureSize(pasture) * 2 * 2 ** getPastureStableCount(player, pasture)

export const getFencedStableCount = (
  player: Pick<PlayerState, 'pastures' | 'stableTiles'>,
): number => player.pastures.reduce((sum, pasture) => sum + getPastureStableCount(player, pasture), 0)

export const getPastureViews = (player: Pick<PlayerState, 'pastures' | 'stableTiles'>): Pasture[] =>
  player.pastures.map(pasture => ({
    ...pasture,
    tiles: pasture.tiles.map(tile => ({ ...tile })),
    size: getPastureSize(pasture),
    stables: getPastureStableCount(player, pasture),
    capacity: getPastureCapacity(player, pasture),
    hasWell: false,
  }))
