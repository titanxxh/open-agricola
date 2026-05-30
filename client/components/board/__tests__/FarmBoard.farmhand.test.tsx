// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'

import type { PlayerState, Resource } from '../../../../shared/contract/types'
import { FarmBoard, type FarmBoardProps } from '../FarmBoard'

afterEach(() => cleanup())

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

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'Player A',
  color: 'red',
  resources: resources(),
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
})

const createProps = (
  player: PlayerState,
  overrides: Partial<FarmBoardProps> = {},
): FarmBoardProps => ({
  locale: 'en',
  players: [player],
  currentPlayer: player,
  displayPlayer: player,
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
})

describe('FarmBoard farmHand center overlay interaction', () => {
  it('toggles farmHand with the 2x2 top-left when the center overlay is clicked', () => {
    const player = createPlayer()
    const toggleFarmHand = vi.fn()
    const { container } = render(
      <FarmBoard
        {...createProps(player, {
          farmCells: [
            { key: 'tile-1-1', type: 'tile', tileRow: 1, tileCol: 1 },
            { key: '4-6', type: 'post' },
          ],
          farmHandSelectableSet: new Set(['1-2']),
          toggleFarmHand,
        })}
      />,
    )

    const overlay = container.querySelector('[data-farmhand-center-key="1-2"]')
    expect(overlay).not.toBeNull()
    expect(overlay?.querySelector('.res-icon-barn')).toBeNull()
    fireEvent.click(overlay!)
    expect(toggleFarmHand).toHaveBeenCalledTimes(1)
    expect(toggleFarmHand).toHaveBeenCalledWith({ row: 1, col: 2 })
  })

  it('does not toggle farmHand when the 2x2 top-left tile is clicked', () => {
    const player = createPlayer()
    const toggleFarmHand = vi.fn()
    const { container } = render(
      <FarmBoard
        {...createProps(player, {
          farmCells: [
            { key: 'tile-1-1', type: 'tile', tileRow: 1, tileCol: 1 },
            { key: '4-4', type: 'post' },
          ],
          farmHandSelectableSet: new Set(['1-1']),
          toggleFarmHand,
        })}
      />,
    )

    const tile = container.querySelector('[data-farm-tile-key="1-1"]')
    expect(tile).not.toBeNull()
    fireEvent.click(tile!)
    expect(toggleFarmHand).not.toHaveBeenCalled()
  })

  it('renders one independent center overlay per candidate', () => {
    const player = createPlayer()
    const { container } = render(
      <FarmBoard
        {...createProps(player, {
          farmCells: [
            { key: '2-2', type: 'post' },
            { key: '4-6', type: 'post' },
          ],
          farmHandSelectableSet: new Set(['0-0', '1-2']),
        })}
      />,
    )

    expect(
      container.querySelectorAll('.farmhand-center-overlay').length,
    ).toBe(2)
    expect(
      container.querySelector('[data-farmhand-center-key="0-0"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-farmhand-center-key="1-2"]'),
    ).not.toBeNull()
  })

})

describe('FarmBoard built special-stable center overlay', () => {
  it('renders a solid built overlay at the 2x2 center for a built special stable', () => {
    const player = { ...createPlayer(), color: 'green' as const }
    const { container } = render(
      <FarmBoard
        {...createProps(player, {
          players: [player],
          currentPlayer: player,
          displayPlayer: player,
          farmCells: [{ key: '2-2', type: 'post' }],
          builtSpecialStableKeys: new Set(['0-0']),
        })}
      />,
    )

    const overlay = container.querySelector('[data-farmhand-center-key="0-0"]')
    expect(overlay).not.toBeNull()
    expect(overlay?.classList.contains('farmhand-center-built')).toBe(true)
    expect(overlay?.querySelector('.res-icon-barn')).not.toBeNull()
    expect(overlay?.classList.contains('farmhand-center-candidate')).toBe(false)
    expect(overlay?.classList.contains('farmhand-center-selected')).toBe(false)
    expect(overlay?.getAttribute('data-player-color')).toBe('green')
  })

  it('does not toggle farmHand when a built overlay is clicked (not selectable)', () => {
    const player = createPlayer()
    const toggleFarmHand = vi.fn()
    const { container } = render(
      <FarmBoard
        {...createProps(player, {
          farmCells: [{ key: '2-2', type: 'post' }],
          builtSpecialStableKeys: new Set(['0-0']),
          toggleFarmHand,
        })}
      />,
    )

    const overlay = container.querySelector('[data-farmhand-center-key="0-0"]')
    expect(overlay).not.toBeNull()
    fireEvent.click(overlay!)
    expect(toggleFarmHand).not.toHaveBeenCalled()
    expect(overlay?.classList.contains('farmhand-center-candidate')).toBe(false)
  })

  it('renders the built overlay even when the board is not interactive', () => {
    const player = createPlayer()
    const { container } = render(
      <FarmBoard
        {...createProps(player, {
          isInteractive: false,
          farmCells: [{ key: '2-2', type: 'post' }],
          builtSpecialStableKeys: new Set(['0-0']),
        })}
      />,
    )

    const overlay = container.querySelector('[data-farmhand-center-key="0-0"]')
    expect(overlay?.classList.contains('farmhand-center-built')).toBe(true)
  })
})
