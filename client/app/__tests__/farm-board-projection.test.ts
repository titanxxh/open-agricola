import { describe, expect, it } from 'vitest'

import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import type {
  GameState,
  FarmTilePosition,
  InteractionAnimalReorgZone,
  InteractionFarmSelection,
  PlayerState,
  Resource,
} from '../../../shared/contract/types'
import { buildFarmBoardProjection, type FarmBoardProjectionInput } from '../farm-board-projection'

const resources = (overrides: Partial<Resource> = {}): Resource => ({
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
  ...overrides,
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

const createState = (players: PlayerState[], currentPlayerIndex = 0): GameState => ({
  players,
  currentPlayerIndex,
} as GameState)

type PlayerStateWithSpecialStables = PlayerState & {
  specialStables: { sourceCardId: string; position: FarmTilePosition }[]
}

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

  it('does not expand layout for another player farm-position selection', () => {
    const activePlayer = createPlayer({ id: 'p1' })
    const displayPlayer = createPlayer({ id: 'p2' })
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
      displayPlayer,
      interaction,
      selectionInteraction: interaction.selection,
      players: [activePlayer, displayPlayer],
    })

    expect(projection.farmGridColumns).toBe(11)
    expect(projection.farmCells).not.toContainEqual({
      key: '1-11',
      type: 'tile',
      tileRow: -2,
      tileCol: 5,
      fenceId: undefined,
    })
  })

  it('projects farm board selection display props', () => {
    const player: PlayerStateWithSpecialStables = {
      ...createPlayer({
        roomTiles: [{ row: 0, col: 0 }],
      }),
      specialStables: [{ sourceCardId: 'B085_FarmHand', position: { row: 2, col: 2 } }],
    }
    const buildSelectionProjection = (
      farmInteraction: InteractionFarmSelection | null,
      extras: Partial<FarmBoardProjectionInput> = {},
    ) => buildFarmBoardProjection({
      displayPlayer: player,
      interaction: idleInteraction(),
      selectionInteraction: null,
      players: [player],
      farmInteraction,
      ...extras,
    })

    const roomProjection = buildSelectionProjection(
      {
        farmType: 'room',
        selectableTiles: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
        maxSelections: 2,
      },
      { pendingRoomTiles: [{ row: 1, col: 1 }] },
    )
    expect(roomProjection.pendingRoomSet).toEqual(new Set(['1-1']))
    expect(roomProjection.roomSelectableSet).toEqual(new Set(['0-1', '1-1']))

    const stableProjection = buildSelectionProjection(
      {
        farmType: 'stable',
        selectableTiles: [{ row: 0, col: 1 }, { row: 2, col: 2 }],
        maxSelections: 1,
        farmHandPositions: [{ row: 2, col: 2 }],
      },
      {
        pendingStableTiles: [{ row: 0, col: 1 }],
        pendingFarmHand: { row: 2, col: 2 },
      },
    )
    expect(stableProjection.pendingStableSet).toEqual(new Set(['0-1']))
    expect(stableProjection.stableSelectableSet).toEqual(new Set(['0-1', '2-2']))
    expect(stableProjection.farmHandSelectableSet).toEqual(new Set(['2-2']))
    expect(stableProjection.pendingFarmHandKey).toBe('2-2')
    expect(stableProjection.builtSpecialStableKeys).toEqual(new Set(['2-2']))

    const fenceProjection = buildSelectionProjection({
      farmType: 'fence',
      selectableEdges: ['H-0-0', 'V-0-1'],
    })
    expect(fenceProjection.fenceSelectableSet).toEqual(new Set(['H-0-0', 'V-0-1']))

    const positionProjection = buildFarmBoardProjection({
      displayPlayer: player,
      interaction: idleInteraction(),
      selectionInteraction: {
        kind: 'farm-position',
        selectablePositions: [{ row: -1, col: 0 }, { row: 2, col: 4 }],
        maxSelections: 2,
      },
      players: [player],
    })
    expect(positionProjection.positionSelectableSet).toEqual(new Set(['-1-0', '2-4']))

    const sowProjection = buildSelectionProjection({
      farmType: 'sow',
      selectableFields: [
        { tile: { row: 0, col: 1 }, allowedCrops: ['grain'] },
        {
          tile: { row: 3, col: 0 },
          allowedCrops: ['wood'],
          sourceCard: 'B108_Forester',
          groupKey: 'forest',
        },
      ],
    })
    expect(sowProjection.sowSelectableMap).toEqual(new Map([['0-1', ['grain']]]))
    expect(sowProjection.extraSowTargets).toEqual([
      {
        key: '3-0',
        tile: { row: 3, col: 0 },
        allowedCrops: ['wood'],
        sourceCard: 'B108_Forester',
        groupKey: 'forest',
      },
    ])
  })

  it('projects animal displays for farm board props', () => {
    const displayPlayer = createPlayer({
      resources: resources({ sheep: 4, boar: 2, cattle: 1, horse: 1 }),
      pastures: [{
        id: 'pasture-1',
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        animalType: 'sheep',
        animalCount: 2,
      }],
      houseAnimalType: 'boar',
      houseAnimalCount: 1,
      stableTiles: [{ row: 1, col: 0 }],
      stableAnimals: { '1-0': 'cattle' },
    })
    const owner = createPlayer({
      id: 'owner',
      name: 'Owner',
      occupationPlayed: ['O001_Test'],
    })
    const zones: InteractionAnimalReorgZone[] = [
      {
        id: 'pasture-1',
        zoneType: 'pasture',
        animalType: 'cattle',
        animalCount: 1,
        capacity: 5,
      },
      {
        id: 'house',
        zoneType: 'house',
        animalType: 'sheep',
        animalCount: 1,
        capacity: 1,
      },
      {
        id: 'stable:1-0',
        zoneType: 'stable',
        animalType: 'boar',
        animalCount: 1,
        capacity: 1,
      },
      {
        id: 'card:CARD1',
        zoneType: 'card',
        cardId: 'CARD1',
        animalType: 'horse',
        animalCount: 1,
        capacity: 2,
      },
      {
        id: 'card:FARMCARD',
        zoneType: 'card',
        cardId: 'FARMCARD',
        animalType: 'sheep',
        animalCount: 2,
        capacity: 3,
        farmPosition: { row: 2, col: 1 },
      },
      {
        id: 'card:O001_Test:owner:owner:animalOwner:p1',
        zoneType: 'card',
        cardId: 'O001_Test',
        ownerPlayerId: 'owner',
        animalOwnerPlayerId: 'p1',
        displayOwnerName: 'Owner',
        displaySource: 'borrowed-played-card',
        animalType: 'boar',
        animalCount: 1,
        capacity: 2,
      },
    ]

    const projection = buildFarmBoardProjection({
      displayPlayer,
      interaction: idleInteraction(),
      selectionInteraction: null,
      players: [displayPlayer, owner],
      state: createState([displayPlayer, owner]),
      pastureCapacities: { p1: { 'pasture-1': 5 } },
      animalReorg: { zones, confirmDiscard: false },
      pendingAnimalReorg: { playerIndex: 0, spaceId: 'animal-reorg' },
    })

    expect(projection.pastureTiles).toEqual(new Map([
      ['0-0', { pastureId: 'pasture-1', isCorner: false }],
      ['0-1', { pastureId: 'pasture-1', isCorner: true }],
    ]))
    expect(projection.pastureDisplayMap.get('pasture-1')).toEqual({
      animalType: 'cattle',
      animalCount: 1,
    })
    expect(projection.pastureCapacityMap).toEqual(new Map([['pasture-1', 5]]))
    expect(projection.houseDisplay).toEqual({ animalType: 'sheep', animalCount: 1 })
    expect(projection.stableDisplayMap.get('1-0')).toEqual({ animalType: 'boar', animalCount: 1 })
    expect(projection.cardDisplayMap.get('CARD1')).toMatchObject({
      animalType: 'horse',
      animalCount: 1,
      capacity: 2,
      zoneId: 'card:CARD1',
      isReorgDraft: true,
    })
    expect(projection.farmCardDisplayMap.get('2-1')).toMatchObject({
      animalType: 'sheep',
      animalCount: 2,
      capacity: 3,
      zoneId: 'card:FARMCARD',
      isReorgDraft: true,
    })
    expect(projection.borrowedPlayedCardDisplays).toEqual([
      expect.objectContaining({
        cardId: 'O001_Test',
        cardType: 'occupation',
        displayOwnerName: 'Owner',
        animalType: 'boar',
        animalCount: 1,
        isReorgDraft: true,
      }),
    ])
    expect(projection.reorgRemaining).toEqual({
      sheep: 1,
      boar: 0,
      cattle: 0,
      horse: 0,
    })
  })
})
