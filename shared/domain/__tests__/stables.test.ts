import { beforeEach, describe, expect, it } from 'vitest'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import {
  getEmptyUnfencedStableCountForCards,
  getOrdinaryStableCount,
  getStableCountForCards,
  getUnfencedStableCountForCards,
} from '../stables'
import { makeBlankPlayer } from './helpers'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry, withActiveRegistry } from '../../cards/active-registry'
import { B085_FarmHand } from '../../cards/B/B085_FarmHand'
import { listReturnableStableTiles, returnStableAtTile } from '../../cards/helpers/stable-removal'

beforeEach(() => {
  const registry = new CardRegistry()
  registry.loadImpl(B085_FarmHand.id, B085_FarmHand.impl)
  setActiveCardRegistry(registry)
})

it('counts and returns special stables through their owning sources', () => {
  const registry = new CardRegistry()
  for (const [cardId, position] of [
    ['CUSTOM_FirstStable', { row: 0, col: 2 }],
    ['CUSTOM_SecondStable', { row: 1, col: 3 }],
  ] as const) registry.loadImpl(cardId, { effect: {
    id: cardId,
    getBuiltSpecialStables: (p) => p.cardStates[cardId]?.flagged ? [{ ...position }] : [],
    returnSpecialStable: (p) => { p.cardStates[cardId]!.flagged = false; return true },
  } })
  const p = makeBlankPlayer({ occupationPlayed: ['CUSTOM_FirstStable', 'CUSTOM_SecondStable'] }) as unknown as PlayerState
  p.cardStates = { CUSTOM_FirstStable: { flagged: true }, CUSTOM_SecondStable: { flagged: true } }
  withActiveRegistry(registry, () => {
    expect(getStableCountForCards(p)).toBe(2)
    expect(listReturnableStableTiles(p)).toEqual([{ row: 0, col: 2 }, { row: 1, col: 3 }])
    expect(returnStableAtTile(p, { row: 0, col: 2 })).toBe('special')
    expect(getStableCountForCards(p)).toBe(1)
    expect(p.cardStates.CUSTOM_SecondStable?.flagged).toBe(true)
  })
})

const player = (overrides: {
  stableTiles?: FarmTilePosition[]
  pastures?: PlayerState['pastures']
  stableAnimals?: PlayerState['stableAnimals']
  farmHandPosition?: FarmTilePosition
}): PlayerState => {
  const base = makeBlankPlayer({
    stableTiles: overrides.stableTiles ?? [],
    pastures: overrides.pastures ?? [],
  }) as unknown as PlayerState
  base.stableAnimals = overrides.stableAnimals ?? {}
  if (overrides.farmHandPosition) {
    base.occupationPlayed = [B085_FarmHand.id]
    base.cardStates = {
      B085_FarmHand: { extraData: { position: overrides.farmHandPosition } },
    }
  }
  return base
}

describe('getOrdinaryStableCount', () => {
  it('counts only normal stable tiles', () => {
    const p = player({
      stableTiles: [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
      ],
    })
    expect(getOrdinaryStableCount(p)).toBe(2)
  })

  it('ignores the B85 FarmHand position', () => {
    const p = player({
      stableTiles: [{ row: 0, col: 0 }],
      farmHandPosition: { row: 2, col: 2 },
    })
    expect(getOrdinaryStableCount(p)).toBe(1)
  })
})

describe('getStableCountForCards', () => {
  it('adds the B85 FarmHand position to the ordinary count', () => {
    const p = player({
      stableTiles: [{ row: 0, col: 0 }],
      farmHandPosition: { row: 2, col: 2 },
    })
    expect(getStableCountForCards(p)).toBe(2)
  })

  it('equals the ordinary count when no B85 position exists', () => {
    const p = player({ stableTiles: [{ row: 0, col: 0 }] })
    expect(getStableCountForCards(p)).toBe(1)
  })
})

describe('getUnfencedStableCountForCards', () => {
  it('counts stables not inside any pasture', () => {
    const p = player({
      stableTiles: [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
      ],
      pastures: [
        {
          id: 'past1',
          size: 1,
          tiles: [{ row: 1, col: 0 }],
          stables: 1,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    expect(getUnfencedStableCountForCards(p)).toBe(1)
  })

  it('always includes the B85 FarmHand position as unfenced', () => {
    const p = player({
      stableTiles: [{ row: 0, col: 0 }],
      pastures: [
        {
          id: 'past1',
          size: 1,
          tiles: [{ row: 0, col: 0 }],
          stables: 1,
          animalType: null,
          animalCount: 0,
        },
      ],
      farmHandPosition: { row: 2, col: 2 },
    })
    expect(getUnfencedStableCountForCards(p)).toBe(1)
  })
})

describe('getEmptyUnfencedStableCountForCards', () => {
  it('counts only empty (animal-free) unfenced stables', () => {
    const p = player({
      stableTiles: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
      stableAnimals: { '0-0': 'sheep', '0-1': null },
    })
    expect(getEmptyUnfencedStableCountForCards(p)).toBe(1)
  })

  it('excludes fenced stables from the empty count', () => {
    const p = player({
      stableTiles: [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
      ],
      pastures: [
        {
          id: 'past1',
          size: 1,
          tiles: [{ row: 1, col: 0 }],
          stables: 1,
          animalType: null,
          animalCount: 0,
        },
      ],
      stableAnimals: {},
    })
    expect(getEmptyUnfencedStableCountForCards(p)).toBe(1)
  })

  it('always counts the B85 FarmHand position as one empty unfenced stable', () => {
    const p = player({
      stableTiles: [{ row: 0, col: 0 }],
      stableAnimals: { '0-0': 'cattle' },
      farmHandPosition: { row: 2, col: 2 },
    })
    expect(getEmptyUnfencedStableCountForCards(p)).toBe(1)
  })
})
