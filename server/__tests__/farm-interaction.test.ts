import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../shared/game/types.ts'
import {
  buildFarmPositionSelectionInteraction,
  buildPlowFarmInteraction,
  buildRoomFarmInteraction,
  buildSowFarmInteraction,
  buildStableFarmInteraction,
} from '../farm-interaction.ts'
import { A14_CarpentersHammer } from '../../shared/cards/A/A14_CarpentersHammer'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'

const stableTradeModifiers: PlayerState['activeModifiers'] = [
  {
    type: 'trade',
    cardId: 'Test_Stable_Clay',
    appliesTo: ['stables'],
    from: { clay: 2 },
    to: { wood: 2 },
    max: 2,
  },
  {
    type: 'trade',
    cardId: 'Test_Stable_Stone',
    appliesTo: ['stables'],
    from: { stone: 2 },
    to: { wood: 2 },
    max: 2,
  },
]

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
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
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
    expect(interaction.maxSelections).toBe(1)
  })

  it('respects explicit room limit from action context', () => {
    const player = createPlayer()
    player.resources.wood = 15
    player.resources.reed = 6

    const interaction = buildRoomFarmInteraction(player, undefined, { maxRooms: 1 })

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.maxSelections).toBe(1)
  })

  it('counts frame builder replacement costs when computing room selections', () => {
    const player = createPlayer()
    player.houseType = 'clay'
    player.resources.wood = 2
    player.resources.clay = 6
    player.resources.reed = 4
    player.activeModifiers = [...((A123_FrameBuilder as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? [])]

    const interaction = buildRoomFarmInteraction(player)

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.maxSelections).toBe(2)
  })

  it('counts Carpenter\'s Hammer discounts when computing room selections', () => {
    const player = createPlayer()
    player.resources.wood = 8
    player.resources.reed = 2
    player.activeModifiers = [...((A14_CarpentersHammer as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? [])]

    const interaction = buildRoomFarmInteraction(player)

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.maxSelections).toBe(2)
  })

  it('limits stable maxSelections using discounted stable cost', () => {
    const player = createPlayer()
    player.resources.wood = 2

    const interaction = buildStableFarmInteraction(player, { wood: -1 })

    expect(interaction.farmType).toBe('stable')
    if (interaction.farmType !== 'stable') return
    expect(interaction.maxSelections).toBe(2)
  })

  it('counts stable payment alternatives when computing maxSelections', () => {
    const player = createPlayer()
    player.resources.clay = 2
    player.resources.stone = 2
    player.activeModifiers = [...stableTradeModifiers]

    const interaction = buildStableFarmInteraction(player)

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

  it('limits sow selectable fields using maxSelections and exclusions', () => {
    const player = createPlayer()
    player.resources.grain = 3
    player.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
      { row: 1, col: 0, stacks: [] },
    ]

    const interaction = buildSowFarmInteraction(player, {
      maxSelections: 2,
      excludedFields: [{ row: 0, col: 1 }],
    })

    expect(interaction.farmType).toBe('sow')
    if (interaction.farmType !== 'sow') return
    expect(interaction.maxSelections).toBe(2)
    expect(interaction.selectableFields).toHaveLength(2)
    expect(interaction.selectableFields).toContainEqual({
      tile: { row: 0, col: 0 },
      allowedCrops: ['grain'],
    })
    expect(interaction.selectableFields).not.toContainEqual({
      tile: { row: 0, col: 1 },
      allowedCrops: ['grain'],
    })
  })

  it('builds farm-position selection interaction with positionFilter', () => {
    const player = createPlayer()
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ] as typeof player.fields

    const interaction = buildFarmPositionSelectionInteraction(player, {
      selectionKind: 'farm-position',
      positionFilter: 'has-grain',
      maxSelections: 1,
      minSelections: 0,
    })

    expect(interaction.kind).toBe('farm-position')
    expect(interaction.selectablePositions).toEqual([{ row: 0, col: 0 }])
    expect(interaction.maxSelections).toBe(1)
    expect(interaction.minSelections).toBe(0)
  })
})
