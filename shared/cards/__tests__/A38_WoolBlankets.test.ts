import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, Pasture } from '../../contract/types'

import { A038_WoolBlankets_impl } from '../A/A038_WoolBlankets'

const CARD_ID = 'A038_WoolBlankets'

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [], rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

const makePasture = (size: number, animalCount: number, animalType: 'sheep' | 'boar' | 'cattle' | null = 'sheep'): Pasture => ({
  id: `p${size}`, size, tiles: [], stables: 0, animalType, animalCount,
})

const fakeState = {} as unknown as GameState

describe('A038_WoolBlankets prerequisite (5 Sheep)', () => {
  it('is NOT satisfied with 4 sheep on board', () => {
    const player = createPlayer({
      pastures: [makePasture(2, 4, 'sheep')],
      resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    })
    expect(A038_WoolBlankets_impl.prerequisiteCheck!(player)).toBe(false)
  })

  it('IS satisfied with 5 sheep in a single pasture', () => {
    const player = createPlayer({
      pastures: [makePasture(4, 5, 'sheep')],
    })
    expect(A038_WoolBlankets_impl.prerequisiteCheck!(player)).toBe(true)
  })

  it('IS satisfied with 4 pasture sheep + 1 house sheep', () => {
    const player = createPlayer({
      pastures: [makePasture(2, 4, 'sheep')],
      houseAnimalType: 'sheep', houseAnimalCount: 1,
    })
    expect(A038_WoolBlankets_impl.prerequisiteCheck!(player)).toBe(true)
  })

  it('IS satisfied counting stableAnimals (3 pasture + 2 stable sheep)', () => {
    const player = createPlayer({
      pastures: [makePasture(2, 3, 'sheep')],
      stableAnimals: { 's1': 'sheep', 's2': 'sheep' },
    })
    expect(A038_WoolBlankets_impl.prerequisiteCheck!(player)).toBe(true)
  })

  it('does NOT count boar/cattle towards the 5 sheep threshold', () => {
    const player = createPlayer({
      pastures: [makePasture(2, 4, 'sheep'), makePasture(2, 4, 'boar')],
    })
    expect(A038_WoolBlankets_impl.prerequisiteCheck!(player)).toBe(false)
  })
})

describe('A038_WoolBlankets bonus VP', () => {
  const effect = getCardEffect(CARD_ID)!

  it('awards 3 bonus VP for wooden house', () => {
    const player = createPlayer({ houseType: 'wood' })
    expect(effect.computeBonusScore!(fakeState, player, {} as never)).toBe(3)
  })

  it('awards 2 bonus VP for clay house', () => {
    const player = createPlayer({ houseType: 'clay' })
    expect(effect.computeBonusScore!(fakeState, player, {} as never)).toBe(2)
  })

  it('awards 0 bonus VP for stone house', () => {
    const player = createPlayer({ houseType: 'stone' })
    expect(effect.computeBonusScore!(fakeState, player, {} as never)).toBe(0)
  })
})
