import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PlayerState, Resource } from '../../../../shared/contract/types'
import type { PlayerPanelSupplySummary } from '../../../../shared/domain/player-panel-summary'
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

const player = (id: string, name: string, color: PlayerState['color']): PlayerState => ({
  id,
  name,
  color,
  resources: resources(),
  workers: [
    { id: '1', isActive: true },
    { id: '2', isActive: true },
    { id: '3', isActive: false },
    { id: '4', isActive: false },
    { id: '5', isActive: false },
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
})

const summary = (stable: PlayerPanelSupplySummary['stable']): PlayerPanelSupplySummary => ({
  family: { used: 2, limit: 5 },
  rooms: { count: 2 },
  housingCapacity: { value: 2 },
  fence: { used: 0, limit: 15 },
  stable,
})

const props = (
  players: PlayerState[],
  currentPlayer: PlayerState,
  displayPlayer: PlayerState,
  playerPanelSummary: PlayerPanelSupplySummary,
): FarmBoardProps => ({
  locale: 'en',
  players,
  currentPlayer,
  displayPlayer,
  playerPanelSummary,
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
})

describe('FarmBoard stable supply summary', () => {
  it('renders the viewed player stable ratio from playerPanelSummary', () => {
    const current = player('p1', 'Alice', 'red')
    const viewed = player('p2', 'Bob', 'blue')

    const html = renderToStaticMarkup(
      <FarmBoard {...props([current, viewed], current, viewed, summary({ used: 3, limit: 4 }))} />,
    )

    expect(html).toContain('Bob')
    expect(html).toMatch(/res-icon-barn[\s\S]*>3\/4</)
    expect(html).not.toMatch(/res-icon-barn[\s\S]*>0\/4</)
  })
})
