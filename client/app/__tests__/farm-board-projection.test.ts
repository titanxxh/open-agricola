import { describe, expect, it } from 'vitest'

import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import type { PlayerState, Resource } from '../../../shared/contract/types'
import { buildFarmBoardProjection } from '../farm-board-projection'

const resources = (): Resource => ({
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
})

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  color: 'red',
  resources: resources(),
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: {
    placedFarmers: 0,
    firstPlayerCount: 0,
    totalRoomsBuilt: 0,
    totalMajorBuilt: 0,
    totalMinorBuilt: 0,
    totalOccupationBuilt: 0,
    harvestedGrain: 0,
    harvestedVegetable: 0,
    resourcesFromBoard: {},
    resourcesFromCards: {},
    resourcesConverted: {},
    foodFromConversion: {},
    draftHistory: [],
    draftDiscarded: [],
  },
  parentCards: { mother: null, father: null },
  ...overrides,
})

const idleInteraction = (): ClientInteractionState => ({
  stateId: 'idle',
  allowedCommands: [],
  anytimeActions: [],
})

describe('buildFarmBoardProjection', () => {
  it('projects farm layout cells and occupied room field stable fence sets', () => {
    const stacks = [{ kind: 'grain' as const, remaining: 2 }]
    const player = createPlayer({
      roomTiles: [{ row: 2, col: 0 }],
      fields: [{ row: 0, col: 1, stacks }],
      stableTiles: [{ row: -1, col: 0 }],
      farmyardExtensions: [{
        id: 'ext-1',
        sourceCardId: 'M050_FarmExtension',
        tiles: [{ row: -1, col: 0 }, { row: -1, col: 1 }],
      }],
      fenceSegments: [
        { edge: 'H-0-0', type: 'fence' },
        { edge: 'V--1-0', type: 'palisade' },
      ],
    })

    const projection = buildFarmBoardProjection({
      displayPlayer: player,
      interaction: idleInteraction(),
      selectionInteraction: null,
      players: [player],
    })

    expect(projection.farmGridColumns).toBe(11)
    expect(projection.farmCells).toHaveLength(99)
    expect(projection.farmCells).toContainEqual({
      key: '1-1',
      type: 'tile',
      tileRow: -1,
      tileCol: 0,
      fenceId: undefined,
    })
    expect(projection.farmCells).toContainEqual({
      key: '0-1',
      type: 'fence-h',
      tileRow: undefined,
      tileCol: undefined,
      fenceId: 'H--1-0',
    })
    expect(projection.roomPositions).toEqual(new Set(['2-0']))
    expect(projection.fieldMap.get('0-1')).toEqual({ stacks })
    expect(projection.stablePositions).toEqual(new Set(['-1-0']))
    expect(projection.existingFenceSet).toEqual(new Set(['H-0-0', 'V--1-0']))
  })

  it('expands layout to include active farm-position selection candidates', () => {
    const player = createPlayer()
    const interaction: ClientInteractionState = {
      stateId: 'wait',
      playerIndex: 0,
      request: {
        kind: 'selection',
        selection: {
          selectionType: 'farm-position',
          selectablePositions: [{ row: -2, col: 5 }],
          maxSelections: 1,
        },
      },
      selection: {
        kind: 'farm-position',
        selectablePositions: [{ row: -2, col: 5 }],
        maxSelections: 1,
      },
      allowedCommands: ['commitSelection'],
      anytimeActions: [],
    }

    const projection = buildFarmBoardProjection({
      displayPlayer: player,
      interaction,
      selectionInteraction: interaction.selection,
      players: [player],
    })

    expect(projection.farmGridColumns).toBe(13)
    expect(projection.farmCells).toContainEqual({
      key: '1-11',
      type: 'tile',
      tileRow: -2,
      tileCol: 5,
      fenceId: undefined,
    })
  })
})
