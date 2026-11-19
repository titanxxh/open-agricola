import { countRoomAnimals } from '../../domain/animals'
import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../contract/types'
import { positionKey } from '../../domain/farm'

const CARD_ID = 'E071_CowPatty'

const countCattleOnBoard = (player: PlayerState): number => {
  let total = 0
  for (const pasture of player.pastures) {
    if (pasture.animalType === 'cattle') total += pasture.animalCount
  }
  total += countRoomAnimals(player, 'cattle')
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal.animalType === 'cattle') total += animal.animalCount
  }
  return total
}

/**
 * E71 Cow Patty (Minor Improvement):
 * Each time you sow in a field that is orthogonally adjacent to a pasture,
 * you can place 1 additional good of the planted type in it.
 *
 * Prerequisite: 1 Cattle (checked at play time, not at trigger time).
 *
 * Implementation: optional Sow amount modifier, chosen inside the Sow before placement.
 */

const isAdjacentToPasture = (player: PlayerState, row: number, col: number): boolean => {
  const pastureTileKeys = new Set(player.pastures.flatMap((pasture) => pasture.tiles.map(positionKey)))
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].some((neighbor) => pastureTileKeys.has(positionKey(neighbor)))
}

const cardImpl = {
  prerequisiteCheck: (player) => countCattleOnBoard(player) >= 1,
  effect: {
    id: CARD_ID,
    modifySowAmount: ({ player, crop, target }) =>
      (crop === 'grain' || crop === 'vegetable') && target.kind === 'farmyard'
        && isAdjacentToPasture(player, target.row, target.col)
        ? { delta: 1, optional: true }
        : undefined,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E071_CowPatty = defineMinorCard({
  presentation: { stack: true },
  meta: {
    id: 'E071_CowPatty',
    name: 'Cow Patty',
    deck: 'E',
    number: 71,
    desc: ['Each time you sow in a <FIELD> that is orthogonally adjacent to a pasture, you can place 1 additional good of the planted type in it.'],
    cost: {},
    vp: 1,
    prerequisite: '1 Cattle',
    implemented: true,
    category: 'CROPS_-_GRAIN_AND_VEGETABLE',
  },
  impl: cardImpl,
})

export const E071_CowPatty_impl = E071_CowPatty.impl
