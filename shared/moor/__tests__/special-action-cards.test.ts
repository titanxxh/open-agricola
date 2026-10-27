import { describe, expect, it } from 'vitest'
import { createMoorSpecialActionCards, normalizeMoorSpecialActionCards } from '../special-action-cards'
import { createFarmersOfTheMoorState, normalizeFarmersOfTheMoorState } from '../state'

const cardIdsFor = (playerCount: number) =>
  createMoorSpecialActionCards(playerCount).map((card) => card.id)

describe('Farmers of the Moor special action cards', () => {
  it('preserves the complete solo pile order, in-progress card and paid round through normalization', () => {
    const state = createFarmersOfTheMoorState(['p1'], 7)
    state.soloRetentionPaid = true
    state.specialActionCards.forEach((card, index) => {
      card.location = index === 0 ? { kind: 'solo-current', inUse: true }
        : index < 4 ? { kind: 'solo-discard', order: index + 10 }
          : { kind: 'solo-draw', order: 20 - index }
    })
    expect(normalizeFarmersOfTheMoorState(JSON.parse(JSON.stringify(state)), ['p1'], 99)).toEqual(state)
  })

  it('rejects an incomplete or ambiguous solo supply instead of rebuilding a market', () => {
    const state = createFarmersOfTheMoorState(['p1'], 7)
    expect(() => normalizeMoorSpecialActionCards(state.specialActionCards.slice(1), 1)).toThrow('Invalid solo Moor supply')
    state.specialActionCards[0]!.location = { kind: 'solo-current' }
    state.specialActionCards[1]!.location = { kind: 'solo-current' }
    expect(() => normalizeMoorSpecialActionCards(state.specialActionCards, 1)).toThrow('Invalid solo Moor current card')
    state.specialActionCards[1]!.location = { kind: 'solo-draw', order: 8 }
    state.specialActionCards[2]!.location = { kind: 'solo-draw', order: 8 }
    expect(() => normalizeMoorSpecialActionCards(state.specialActionCards, 1)).toThrow('Duplicate solo Moor pile order')
  })

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
