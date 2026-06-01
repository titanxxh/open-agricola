import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FenceSegment, GameState, PlayerState, Resource } from '../../../../shared/contract/types'
import { FarmBoard, type FarmBoardProps } from '../FarmBoard'

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

const stats = (): PlayerState['stats'] => ({
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
})

const ownFence = (ownerPlayerId: string, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'own', ownerPlayerId },
})

const borrowedFence = (ownerPlayerId: string, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'borrowed', ownerPlayerId },
})

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: overrides.id ?? 'p1',
  name: overrides.name ?? 'Alice',
  color: overrides.color ?? 'red',
  resources: resources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
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
  stats: stats(),
  supplyTokensConsumed: {},
  ...overrides,
})

const farmBoardProps = (
  state: GameState,
  viewedPlayerId: string,
  overrides: Partial<FarmBoardProps> = {},
): FarmBoardProps => {
  const currentPlayer = state.players[state.currentPlayerIndex]!
  const displayPlayer = state.players.find((p) => p.id === viewedPlayerId)!
  return {
    locale: 'en',
    players: state.players,
    currentPlayer,
    displayPlayer,
    devMode: false,
    currentStartPlayerId: '',
    nextStartPlayerId: '',
    playedCards: [],
    farmCells: [],
    roomPositions: new Set(),
    fieldPositions: new Set(),
    fieldMap: new Map(),
    stablePositions: new Set(),
    pendingRoomSet: new Set(),
    pendingStableSet: new Set(),
    roomSelectableSet: new Set(),
    stableSelectableSet: new Set(),
    farmHandSelectableSet: new Set(),
    pendingFarmHandKey: null,
    builtSpecialStableKeys: new Set(),
    maxStableSelections: 0,
    plowSelectableSet: new Set(),
    pendingPlowTile: null,
    positionSelectableSet: new Set(),
    pendingPositionSelections: new Set(),
    togglePositionSelection: () => {},
    pendingSowSelections: {},
    sowRemaining: { grain: 0, vegetable: 0, wood: 0, stone: 0 },
    sowSelectableMap: new Map(),
    extraSowTargets: [],
    pastureTiles: new Map(),
    pastureDisplayMap: new Map(),
    pastureCapacityMap: new Map(),
    houseDisplay: { animalType: null, animalCount: 0 },
    stableDisplayMap: new Map(),
    isReorgActive: false,
    reorgRemaining: null,
    hasReorgOverflow: false,
    animalReorg: null,
    pendingFenceSet: new Set(),
    existingFenceSet: new Set(),
    fenceSelectableSet: new Set(),
    toggleRoomTile: () => {},
    toggleStableTile: () => {},
    toggleFarmHand: () => {},
    togglePlowTile: () => {},
    updateSowSelection: () => {},
    toggleFenceEdge: () => {},
    adjustReorgAnimal: () => {},
    confirmAnimalReorg: () => {},
    cancelAnimalDiscardPrompt: () => {},
    setViewPlayerId: () => {},
    isSelectingMinor: false,
    isSelectingOccupation: false,
    isSelectingImprovementAny: false,
    selectableMinorIds: new Set(),
    selectableOccupationIds: new Set(),
    cardAvailability: {},
    futureCardResources: {},
    resolveChoice: () => {},
    isInteractive: true,
    ...overrides,
  }
}

describe('FarmBoard fence summary display', () => {
  it('renders the viewed borrower and donor fence ratios from player panel summary', () => {
    const borrower = player({
      fenceSegments: [
        ...Array.from({ length: 15 }, (_, index) => ownFence('p1', `H-0-${index}`)),
        borrowedFence('p2', 'V-0-0'),
        borrowedFence('p2', 'V-0-1'),
      ],
    })
    const donor = player({
      id: 'p2',
      name: 'Bob',
      color: 'blue',
      supplyTokensConsumed: { fence: 2 },
    })
    const state = { players: [borrower, donor], currentPlayerIndex: 0 } as GameState

    const borrowerHtml = renderToStaticMarkup(
      <FarmBoard {...farmBoardProps(state, 'p1')} />,
    )
    const donorHtml = renderToStaticMarkup(
      <FarmBoard {...farmBoardProps(state, 'p2')} />,
    )

    expect(borrowerHtml).toContain('>17/17<')
    expect(donorHtml).toContain('>0/13<')
  })

  it('keeps borrowed fence edges colored by the donor while showing borrower capacity', () => {
    const borrower = player({
      fenceSegments: [borrowedFence('p2', 'V-0-0')],
    })
    const donor = player({
      id: 'p2',
      name: 'Bob',
      color: 'blue',
      supplyTokensConsumed: { fence: 1 },
    })
    const state = { players: [borrower, donor], currentPlayerIndex: 0 } as GameState

    const html = renderToStaticMarkup(
      <FarmBoard
        {...farmBoardProps(state, 'p1', {
          farmCells: [{ key: 'fence-v-0-0', type: 'fence-v', fenceId: 'V-0-0' }],
          existingFenceSet: new Set(['V-0-0']),
        })}
      />,
    )

    expect(html).toContain('>1/16<')
    expect(html).toMatch(/farm-fence-v[^"]*\bactive\b[^"]*\bfence\b/)
    expect(html).toContain('data-player-color="blue"')
  })
})
