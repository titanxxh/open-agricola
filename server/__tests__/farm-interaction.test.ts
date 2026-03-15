import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../shared/game/types.ts'
import {
  buildPlowFarmInteraction,
  buildRoomFarmInteraction,
  buildStableFarmInteraction,
} from '../farm-interaction.ts'

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  familySize: 2,
  workersAvailable: 2,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
})

describe('farm interaction builders', () => {
  it('limits room maxSelections using discounted room cost', () => {
    const player = createPlayer()
    player.resources.wood = 4
    player.resources.reed = 2

    const interaction = buildRoomFarmInteraction(player, { wood: -3 })

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.costPerRoom).toEqual({ wood: 2, reed: 2 })
    expect(interaction.maxSelections).toBe(1)
  })

  it('limits stable maxSelections using discounted stable cost', () => {
    const player = createPlayer()
    player.resources.wood = 2

    const interaction = buildStableFarmInteraction(player, { wood: -1 })

    expect(interaction.farmType).toBe('stable')
    if (interaction.farmType !== 'stable') return
    expect(interaction.maxSelections).toBe(2)
  })

  it('returns no plow tiles when surcharge cannot be paid', () => {
    const player = createPlayer()
    player.fields = [{ crop: null, remaining: 0, row: 2, col: 1 }]
    player.resources.food = 0

    const interaction = buildPlowFarmInteraction(player, { food: 1 })

    expect(interaction.farmType).toBe('plow')
    if (interaction.farmType !== 'plow') return
    expect(interaction.selectableTiles).toEqual([])
  })
})
