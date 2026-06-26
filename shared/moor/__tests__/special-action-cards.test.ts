import { describe, expect, it } from 'vitest'
import { createMoorSpecialActionCards } from '../special-action-cards'

const cardIdsFor = (playerCount: number) =>
  createMoorSpecialActionCards(playerCount).map((card) => card.id)

describe('Farmers of the Moor special action cards', () => {
  it('matches the scanned card player-count marks', () => {
    expect(cardIdsFor(2)).toEqual([
      'moor-special-1-2-terrain',
      'moor-special-1-2-market-work',
    ])
    expect(cardIdsFor(3)).toEqual([
      'moor-special-1-3-work-market',
      'moor-special-1-3-horse-terrain',
    ])
    expect(cardIdsFor(4)).toEqual([
      'moor-special-1-4-work-market',
      'moor-special-1-4-5-peat-burn',
      'moor-special-1-4-wood-horse',
    ])
    expect(cardIdsFor(5)).toEqual([
      'moor-special-1-5-6-market-work',
      'moor-special-1-5-6-horse',
      'moor-special-1-5-6-wood-hire',
      'moor-special-1-4-5-peat-burn',
    ])
    expect(cardIdsFor(6)).toEqual([
      'moor-special-1-5-6-market-work',
      'moor-special-6-peat',
      'moor-special-6-burn',
      'moor-special-1-5-6-horse',
      'moor-special-1-5-6-wood-hire',
    ])
  })
})
