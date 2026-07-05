// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PlayerState, Resource } from '../../../../shared/contract/types'
import { FarmBoard, type FarmBoardProps } from '../FarmBoard'
import {
  __resetCardsManifestCache,
  loadCardsManifest,
  type CardsManifestPayload,
} from '../../../services/card-meta'
import { buildFarmBoardProjection } from '../../../app/farm-board-projection'

const manifestEntry = (
  id: string,
  name: string,
  type: 'occupation' | 'minor',
): CardsManifestPayload[string] => ({
  meta: { id, name, deck: id[0] ?? 'A', number: Number(id.slice(1, 4)) || 0, type },
  module: '',
  reaches: [],
})

beforeAll(async () => {
  const manifest: CardsManifestPayload = {
    A102_Grocer: manifestEntry('A102_Grocer', 'Grocer', 'occupation'),
    A105_BarrowPusher: manifestEntry('A105_BarrowPusher', 'Barrow Pusher', 'occupation'),
    A106_SlurrySpreader: manifestEntry('A106_SlurrySpreader', 'Slurry Spreader', 'occupation'),
    A108_MushroomCollector: manifestEntry('A108_MushroomCollector', 'Mushroom Collector', 'occupation'),
    B034_SpecialFood: manifestEntry('B034_SpecialFood', 'Special Food', 'minor'),
    C022_BasketChair: manifestEntry('C022_BasketChair', 'Basket Chair', 'minor'),
    C011_WildlifeReserve: manifestEntry('C011_WildlifeReserve', 'Wildlife Reserve', 'minor'),
    C148_MudWallower: manifestEntry('C148_MudWallower', 'Mud Wallower', 'occupation'),
    C146_WorkshopAssistant: manifestEntry('C146_WorkshopAssistant', 'Workshop Assistant', 'occupation'),
    D075_WoodField: manifestEntry('D075_WoodField', 'Wood Field', 'minor'),
    M027_GardenPath: manifestEntry('M027_GardenPath', 'Garden Path', 'minor'),
    M033_NightPasture: manifestEntry('M033_NightPasture', 'Night Pasture', 'minor'),
    M034_HomeWood: manifestEntry('M034_HomeWood', 'Home Wood', 'minor'),
    M035_HorseTrough: manifestEntry('M035_HorseTrough', 'Horse Trough', 'minor'),
    M084_BogPony: manifestEntry('M084_BogPony', 'Bog Pony', 'minor'),
  }
  __resetCardsManifestCache()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => manifest,
  }))
  await loadCardsManifest()
})

afterAll(() => {
  __resetCardsManifestCache()
  vi.unstubAllGlobals()
})

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

const createPlayer = (id: string, name: string, color: PlayerState['color']): PlayerState => ({
  id,
  name,
  color,
  resources: { ...resources(), wood: 2 },
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
  fences: 0,
  roomTiles: [],
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

const createFarmBoardProps = (
  player: PlayerState,
  viewOverrides: Partial<FarmBoardProps['view']> = {},
  actionOverrides: Partial<FarmBoardProps['actions']> = {},
): FarmBoardProps => {
  const projected = buildFarmBoardProjection({
    displayPlayer: player,
    interaction: { stateId: 'idle', allowedCommands: [], anytimeActions: [] },
    selectionInteraction: null,
    players: [player],
  })
  return {
    view: {
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
    isSelectingMinor: false,
    isSelectingOccupation: false,
    isSelectingImprovementAny: false,
    selectableMinorIds: new Set(),
    selectableOccupationIds: new Set(),
    cardAvailability: {},
    futureCardResources: {},
    isInteractive: true,
    lockedTileKeys: projected.lockedTileKeys,
    publicCardMarkers: projected.publicCardMarkers,
    farmTerrainMarkerMap: projected.farmTerrainMarkerMap,
    parentCardDisplays: projected.parentCardDisplays,
    playedCardDisplays: projected.playedCardDisplays,
    ...viewOverrides,
  },
  actions: {
    togglePositionSelection: () => {},
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
    resolveChoice: () => {},
    ...actionOverrides,
  },
  }
}

describe('FarmBoard', () => {
  it('renders extension spaces inside the farm grid and submits real coordinates', () => {
    const player = createPlayer('p1', 'Player 1', 'red')
    player.farmyardExtensions = [{
      id: 'ext-1',
      sourceCardId: 'M050_FarmExtension',
      tiles: [{ row: -1, col: 0 }, { row: -1, col: 1 }],
    }]
    const togglePositionSelection = vi.fn()

    const { container } = render(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmGridColumns: 3,
          farmCells: [
            { key: '0-0', type: 'post' },
            { key: '0-1', type: 'fence-h', fenceId: 'H--1-0' },
            { key: '0-2', type: 'post' },
            { key: '1-0', type: 'fence-v', fenceId: 'V--1-0' },
            { key: '1-1', type: 'tile', tileRow: -1, tileCol: 0 },
            { key: '1-2', type: 'fence-v', fenceId: 'V--1-1' },
            { key: '2-0', type: 'post' },
            { key: '2-1', type: 'fence-h', fenceId: 'H-0-0' },
            { key: '2-2', type: 'post' },
          ],
          positionSelectableSet: new Set(['-1-0']),
        }, {
          togglePositionSelection,
        })}
      />,
    )
    const grid = container.querySelector('.farm-grid')
    const tile = container.querySelector('[data-farm-tile-key="-1-0"]')

    expect(grid).not.toBeNull()
    expect(tile).not.toBeNull()
    expect(grid!.contains(tile)).toBe(true)
    expect(tile).toHaveAttribute('title', 'Empty')

    fireEvent.click(tile!)
    expect(togglePositionSelection).toHaveBeenCalledWith({ row: -1, col: 0 })
  })

  it('renders a subtle selected icon inside selected farm-position tiles', () => {
    const player = createPlayer('p1', 'Player 1', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: '1-1', type: 'tile', tileRow: -1, tileCol: 0 }],
          positionSelectableSet: new Set(['-1-0']),
          pendingPositionSelections: new Set(['-1-0']),
        })}
      />,
    )

    expect(html).toMatch(/farm-tile[^"]*\bposition-selected\b/)
    expect(html).toContain('farm-position-selected-icon')
  })

  it('renders supply capacities with icons in the compact resource panel', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard {...createFarmBoardProps(player)} />,
    )

    expect(html).toContain('res-icon-child')
    expect(html).toContain('res-icon-room-wood')
    expect(html).toContain('res-icon-child-free')
    expect(html).toContain('>2/5<')
    expect(html).toContain('>0/15<')
    expect(html).toContain('>0/4<')
    expect(html).not.toContain('res-compact-label')
  })

  it('renders Farmers of the Moor terrain and resource chips when present', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.resources = { ...player.resources, fuel: 0, horse: 0 }
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'moor' },
    ]

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [
            { key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 },
            { key: 'tile-0-1', type: 'tile', tileRow: 0, tileCol: 1 },
          ],
        })}
      />,
    )

    expect(html).toContain('farm-terrain-forest')
    expect(html).toContain('farm-terrain-moor')
    expect(html).toContain('farm-terrain-sprite-forest')
    expect(html).toContain('farm-terrain-sprite-moor')
    expect(html).toContain('Forest')
    expect(html).toContain('Moor')
    expect(html).toContain('res-icon-fuel')
    expect(html).toContain('res-icon-horse')
  })

  it('renders card terrain markers inside their terrain tiles', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'forest' },
    ]
    player.cardStates = {
      M053_ForestHut: {
        counters: {},
        infobox: undefined,
        stack: [],
        extraData: {
          farmTerrainMarkers: [{
            row: 0,
            col: 0,
            kind: 'person',
            workerId: '3',
            sourceCard: 'M053_ForestHut',
          }],
        },
      },
    }

    const boardOverrides = {
      farmCells: [
        { key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 },
        { key: 'tile-0-1', type: 'tile', tileRow: 0, tileCol: 1 },
      ],
    }
    const htmlWith = renderToStaticMarkup(
      <FarmBoard {...createFarmBoardProps(player, boardOverrides)} />,
    )
    expect(htmlWith).toContain('data-testid="farm-terrain-marker-M053_ForestHut-0-0"')
    expect(htmlWith).not.toContain('data-testid="farm-terrain-marker-M053_ForestHut-0-1"')

    const playerWithoutMarker: PlayerState = {
      ...player,
      cardStates: {
        M053_ForestHut: {
          counters: {},
          infobox: undefined,
          stack: [],
          extraData: { farmTerrainMarkers: [] },
        },
      },
    }
    const htmlWithout = renderToStaticMarkup(
      <FarmBoard {...createFarmBoardProps(playerWithoutMarker, boardOverrides)} />,
    )
    expect(htmlWithout).not.toContain('farm-terrain-marker-M053_ForestHut')
  })

  it('renders public card markers in the player summary area', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.cardStates = {
      M027_GardenPath: {
        counters: {},
        infobox: undefined,
        stack: [],
        extraData: {
          publicCardMarkers: [{
            id: 'garden-path',
            label: 'Garden Path',
            score: -1,
            sourceCardId: 'M027_GardenPath',
            sourcePlayerId: 'p2',
          }],
        },
      },
    }

    const html = renderToStaticMarkup(
      <FarmBoard {...createFarmBoardProps(player)} />,
    )

    expect(html).toContain('data-testid="player-public-card-markers"')
    expect(html).toContain('data-testid="public-card-marker-M027_GardenPath-garden-path"')
    expect(html).toContain('Garden Path')
    expect(html).not.toContain('farm-terrain-marker-M027_GardenPath')
  })

  it('renders horse as a house animal and reorg control when Farmers of the Moor is enabled', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.houseAnimalType = 'horse'
    player.houseAnimalCount = 1
    player.roomTiles = [{ row: 0, col: 0 }]

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [
            { key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 },
          ],
          roomPositions: new Set(['0-0']),
          isReorgActive: true,
          houseDisplay: { animalType: 'horse', animalCount: 1 },
          reorgRemaining: { sheep: 0, boar: 0, cattle: 0, horse: 1 },
        })}
      />,
    )

    expect(html).toContain('res-icon-horse')
    expect(html).toContain('Horse')
  })

  it('counts horses when disabling over-capacity card-zone controls', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['C011_WildlifeReserve']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['C011_WildlifeReserve'],
          isReorgActive: true,
          reorgRemaining: { sheep: 1, boar: 0, cattle: 0, horse: 0 },
          cardDisplayMap: new Map([
            ['C011_WildlifeReserve', {
              zoneId: 'card:C011_WildlifeReserve',
              capacity: 3,
              animalType: null,
              animalCount: 3,
              animalCounts: { sheep: 1, boar: 1, horse: 1 },
              isReorgDraft: true,
            }],
          ]),
        })}
      />,
    )

    expect(html).toContain(
      '<span class="pasture-control-label">Sheep</span><button>-</button><span class="pasture-control-value">1</span><button disabled="">+</button>',
    )
  })

  it('renders farm-position card animal zones on the farm tile instead of the played card', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['M034_HomeWood']
    player.farmTerrain = [{ row: 0, col: 0, kind: 'forest' }]

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['M034_HomeWood'],
          farmCells: [
            { key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 },
          ],
          isReorgActive: true,
          reorgRemaining: { sheep: 0, boar: 0, cattle: 0, horse: 1 },
          farmCardDisplayMap: new Map([
            ['0-0', {
              zoneId: 'card:M034_HomeWood@0-0',
              capacity: 1,
              animalType: 'horse',
              animalCount: 1,
              isReorgDraft: true,
            }],
          ]),
        })}
      />,
    )

    expect(html).toContain('data-testid="farm-card-reorg-card:M034_HomeWood@0-0"')
    expect(html).toContain('res-icon-horse')
    expect(html).not.toContain('played-card-reorg')
  })

  it('renders empty farm-position card animal zones outside reorg', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['M035_HorseTrough']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['minor:M035_HorseTrough'],
          farmCells: [
            { key: 'tile-1-2', type: 'tile', tileRow: 1, tileCol: 2 },
          ],
          farmCardDisplayMap: new Map([
            ['1-2', {
              zoneId: 'card:M035_HorseTrough@1-2',
              capacity: 2,
              animalType: 'horse',
              animalCount: 0,
              allowedAnimalType: 'horse',
              isReorgDraft: false,
            }],
          ]),
        })}
      />,
    )

    expect(html).toContain('data-testid="farm-card-reorg-card:M035_HorseTrough@1-2"')
    expect(html).toContain('res-icon-horse')
    expect(html).toContain('/2')
    expect(html).not.toContain('pasture-controls')
  })

  it('disables farm-position card animal controls rejected by zone metadata', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['M034_HomeWood']
    player.farmTerrain = [{ row: 0, col: 0, kind: 'forest' }]

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['M034_HomeWood'],
          farmCells: [
            { key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 },
          ],
          isReorgActive: true,
          reorgRemaining: { sheep: 1, boar: 1, cattle: 0, horse: 1 },
          farmCardDisplayMap: new Map([
            ['0-0', {
              zoneId: 'card:M034_HomeWood@0-0',
              capacity: 1,
              animalType: null,
              animalCount: 0,
              allowedAnimalTypes: ['boar', 'cattle', 'horse'],
              isReorgDraft: true,
            }],
          ]),
        })}
      />,
    )

    expect(html).toContain(
      '<span class="pasture-control-label">Sheep</span><button disabled="">-</button><span class="pasture-control-value">0</span><button disabled="">+</button>',
    )
    expect(html).toContain(
      '<span class="pasture-control-label">Boar</span><button disabled="">-</button><span class="pasture-control-value">0</span><button>+</button>',
    )
  })

  it('renders kept Parent Cards from portrait assets', () => {
    const player = {
      ...createPlayer('p1', 'Player A', 'red'),
      parentCards: { mother: 'PR01', father: 'PS01' },
      cardStates: {
        PS01: { infobox: 'Completed', extraData: { fatherCompletedTier: 2 } },
      },
    } as PlayerState

    const html = renderToStaticMarkup(
      <FarmBoard {...createFarmBoardProps(player)} />,
    )

    expect(html).toContain('class="parent-cards-row"')
    expect(html).toContain('data-card-id="PR01"')
    expect(html).toContain('/assets/parents/portrait/PR01.png')
    expect(html).not.toContain('/assets/parents/cards/PR01.png')
    expect(html).toContain('data-card-id="PS01"')
    expect(html).toContain('/assets/parents/portrait/PS01.png')
    expect(html).not.toContain('/assets/parents/cards/PS01.png')
    expect(html).toContain('Completed')
    expect(html.match(/parent-card-face__slash-segment is-completed/g)).toHaveLength(2)
  })

  it('shows an enlarged portrait-built Parent Card preview on hover', () => {
    vi.useFakeTimers()
    try {
      const player = {
        ...createPlayer('p1', 'Player A', 'red'),
        parentCards: { mother: 'PR01', father: 'PS01' },
      } as PlayerState

      const { container, unmount } = render(
        <FarmBoard {...createFarmBoardProps(player)} />,
      )
      const tile = container.querySelector('[data-card-id="PR01"]')
      expect(tile).toBeTruthy()

      fireEvent.pointerOver(tile!, { pointerType: 'mouse' })
      act(() => {
        vi.advanceTimersByTime(251)
      })

      const preview = document.body.querySelector(
        '.card-hover-preview.parent-card-hover-preview',
      ) as HTMLElement | null
      expect(preview).toBeTruthy()
      expect(preview?.style.width).toBe('320px')
      expect(preview?.querySelector('img')?.getAttribute('src')).toContain(
        '/assets/parents/portrait/PR01.png',
      )

      fireEvent.pointerOut(tile!, { pointerType: 'mouse' })
      act(() => {
        vi.advanceTimersByTime(121)
      })
      expect(
        document.body.querySelector('.card-hover-preview.parent-card-hover-preview'),
      ).toBeNull()

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the Parent Card id in dev-mode hover previews', () => {
    vi.useFakeTimers()
    try {
      const player = {
        ...createPlayer('p1', 'Player A', 'red'),
        parentCards: { mother: 'PR01', father: 'PS01' },
      } as PlayerState

      const { container, unmount } = render(
        <FarmBoard {...createFarmBoardProps(player, { devMode: true })} />,
      )
      const tile = container.querySelector('[data-card-id="PR01"]')
      expect(tile).toBeTruthy()

      fireEvent.pointerOver(tile!, { pointerType: 'mouse' })
      act(() => {
        vi.advanceTimersByTime(251)
      })

      expect(document.body.querySelector('.card-hover-preview-id')?.textContent).toBe('PR01')

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets the active pending player choose a minor improvement from hand when the turn cursor has advanced', () => {
    const activePlayer = {
      ...createPlayer('p1', 'Player A', 'red'),
      minorHand: ['B034_SpecialFood'],
    }
    const turnPlayer = createPlayer('p2', 'Player B', 'blue')
    const resolveChoice = vi.fn()

    const { container } = render(
      <FarmBoard
        {...createFarmBoardProps(activePlayer, {
          players: [activePlayer, turnPlayer],
          currentPlayer: turnPlayer,
          displayPlayer: activePlayer,
          activePlayerId: activePlayer.id,
          isSelectingMinor: true,
          isSelectingImprovementAny: true,
          selectableMinorIds: new Set(['B034_SpecialFood']),
        }, {
          resolveChoice,
        })}
      />,
    )

    fireEvent.click(container.querySelector('[data-id="B034_SpecialFood"]')!)

    expect(resolveChoice).toHaveBeenCalledWith('B034_SpecialFood')
  })

  it('renders reorg controls for card animal zones', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.occupationPlayed = ['C148_MudWallower']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['occupation:C148_MudWallower'],
          isReorgActive: true,
          reorgRemaining: { sheep: 0, boar: 0, cattle: 0 },
          cardDisplayMap: new Map([
            [
              'C148_MudWallower',
              {
                animalType: 'boar',
                animalCount: 1,
                capacity: 1,
                zoneId: 'card:C148_MudWallower',
                isReorgDraft: true,
              },
            ],
          ]),
        })}
      />,
    )

    expect(html).toContain('played-card-reorg')
    expect(html).toContain('res-icon-boar')
    expect(html).toContain('>1<span')
  })

  it('renders owned played-card animal zones outside reorg as read-only capacity', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['M033_NightPasture']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['minor:M033_NightPasture'],
          cardDisplayMap: new Map([
            [
              'M033_NightPasture',
              {
                animalType: null,
                animalCount: 0,
                capacity: 3,
                zoneId: 'card:M033_NightPasture:owner:p1:animalOwner:p1',
                isReorgDraft: false,
              },
            ],
          ]),
        })}
      />,
    )

    expect(html).toContain('played-card-readonly-animals')
    expect(html).toContain('0/3')
    expect(html).not.toContain('played-card-reorg')
  })

  it('renders mixed animals in owned played-card animal zones outside reorg', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['M033_NightPasture']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['minor:M033_NightPasture'],
          cardDisplayMap: new Map([
            [
              'M033_NightPasture',
              {
                animalType: null,
                animalCount: 2,
                animalCounts: { sheep: 1, horse: 1 },
                capacity: 3,
                zoneId: 'card:M033_NightPasture:owner:p1:animalOwner:p1',
                isReorgDraft: false,
              },
            ],
          ]),
        })}
      />,
    )

    expect(html).toContain('played-card-readonly-animals')
    expect(html).toContain('res-icon-sheep')
    expect(html).toContain('res-icon-horse')
    expect(html).toContain('/3')
  })

  it('renders mixed animals in played-card draft zones while reorganizing', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['M033_NightPasture']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['minor:M033_NightPasture'],
          isReorgActive: true,
          reorgRemaining: { sheep: 0, boar: 0, cattle: 0, horse: 0 },
          cardDisplayMap: new Map([
            [
              'M033_NightPasture',
              {
                animalType: null,
                animalCount: 2,
                animalCounts: { sheep: 1, horse: 1 },
                capacity: 3,
                zoneId: 'card:M033_NightPasture:owner:p1:animalOwner:p1',
                isReorgDraft: true,
              },
            ],
          ]),
        })}
      />,
    )

    expect(html).toContain('played-card-reorg')
    expect(html).toContain('res-icon-sheep')
    expect(html).toContain('res-icon-horse')
    expect(html).toContain('/3')
  })

  it('renders borrowed played-card animal zones from other players outside reorg', () => {
    const owner = createPlayer('p1', 'Owner', 'red')
    const viewer = createPlayer('p2', 'Viewer', 'blue')
    owner.minorPlayed = ['M033_NightPasture']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(viewer, {
          players: [owner, viewer],
          currentPlayer: viewer,
          displayPlayer: viewer,
          borrowedPlayedCardDisplays: [
            {
              animalType: null,
              animalCount: 0,
              capacity: 1,
              zoneId: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
              cardId: 'M033_NightPasture',
              cardType: 'minor',
              ownerPlayerId: 'p1',
              animalOwnerPlayerId: 'p2',
              displayOwnerName: 'Owner',
              displaySource: 'borrowed-played-card',
              isReorgDraft: false,
            },
          ],
        })}
      />,
    )

    expect(html).toContain('played-cards-by-others')
    expect(html).toContain('data-id="M033_NightPasture"')
    expect(html).toContain('0/1')
    expect(html).not.toContain('played-card-reorg')
  })

  it('renders mixed animals in borrowed played-card zones outside reorg', () => {
    const owner = createPlayer('p1', 'Owner', 'red')
    const viewer = createPlayer('p2', 'Viewer', 'blue')
    owner.minorPlayed = ['M033_NightPasture']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(viewer, {
          players: [owner, viewer],
          currentPlayer: viewer,
          displayPlayer: viewer,
          borrowedPlayedCardDisplays: [
            {
              animalType: null,
              animalCount: 2,
              animalCounts: { sheep: 1, horse: 1 },
              capacity: 3,
              zoneId: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
              cardId: 'M033_NightPasture',
              cardType: 'minor',
              ownerPlayerId: 'p1',
              animalOwnerPlayerId: 'p2',
              displayOwnerName: 'Owner',
              displaySource: 'borrowed-played-card',
              isReorgDraft: false,
            },
          ],
        })}
      />,
    )

    expect(html).toContain('played-cards-by-others')
    expect(html).toContain('res-icon-sheep')
    expect(html).toContain('res-icon-horse')
    expect(html).toContain('/3')
  })

  it('renders reorg controls for borrowed played-card animal draft zones', () => {
    const owner = createPlayer('p1', 'Owner', 'red')
    const viewer = createPlayer('p2', 'Viewer', 'blue')
    owner.minorPlayed = ['M033_NightPasture']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(viewer, {
          players: [owner, viewer],
          currentPlayer: viewer,
          displayPlayer: viewer,
          isReorgActive: true,
          reorgRemaining: { sheep: 0, boar: 0, cattle: 0, horse: 0 },
          borrowedPlayedCardDisplays: [
            {
              animalType: 'horse',
              animalCount: 1,
              capacity: 1,
              zoneId: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
              cardId: 'M033_NightPasture',
              cardType: 'minor',
              ownerPlayerId: 'p1',
              animalOwnerPlayerId: 'p2',
              displayOwnerName: 'Owner',
              displaySource: 'borrowed-played-card',
              isReorgDraft: true,
            },
          ],
        })}
      />,
    )

    expect(html).toContain('played-cards-by-others')
    expect(html).toContain('played-card-reorg')
    expect(html).toContain('res-icon-horse')
    expect(html).toContain(
      '<span class="pasture-control-label">Horse</span><button>-</button><span class="pasture-control-value">1</span>',
    )
  })

  it('renders M084 lying horses as read-only played-card state', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['M084_BogPony']
    player.cardStates = {
      M084_BogPony: { extraData: { lyingHorseCount: 2 } },
    }

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['minor:M084_BogPony'],
        })}
      />,
    )

    expect(html).toContain('played-card-readonly-animals')
    expect(html).toContain('res-icon-horse')
    expect(html).toContain('>2</span>')
    expect(html).not.toContain('played-card-reorg')
  })

  it('keeps compact panel icon values grouped with accessible labels and the animation anchor', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playerPanelSummary: {
            family: { used: 2, limit: 5 },
            rooms: { count: 2 },
            housingCapacity: { value: 2 },
            fence: { used: 17, limit: 17 },
            stable: { used: 3, limit: 4 },
          },
        })}
      />,
    )

    expect(html).toContain('data-player-resource-anchor="p1"')
    expect(html).toContain('aria-label="Family capacity: 2/5"')
    expect(html).not.toContain('aria-label="Infirmary workers:')
    expect(html).toContain('aria-label="Rooms: 2"')
    expect(html).toContain('aria-label="Housing capacity: 2"')
    expect(html).toContain('aria-label="Fence capacity: 17/17"')
    expect(html).toContain('aria-label="Stable supply: 3/4"')
    expect(html).toMatch(/res-compact-item[\s\S]*res-icon-fence-icon[\s\S]*>17\/17</)
    expect(html).toMatch(/res-compact-item[\s\S]*res-icon-barn[\s\S]*>3\/4</)
  })

  it('shows workers currently placed in the Infirmary in the compact resource panel', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard {...createFarmBoardProps(player, { infirmaryWorkerCount: 2 })} />,
    )

    expect(html).toContain('aria-label="Infirmary workers: 2"')
    expect(html).toMatch(/res-compact-item[\s\S]*res-icon-infirmary-worker[\s\S]*>2</)
  })

  it('marks highlighted farm tiles', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 }],
          highlightedFarmTileKeys: new Set(['0-0']),
        })}
      />,
    )

    expect(html).toMatch(/farm-tile[^"]*\bevent-highlight\b/)
  })

  it('renders BGA-style image layers for empty, room, and field farm tiles', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [
            { key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 },
            { key: 'tile-0-1', type: 'tile', tileRow: 0, tileCol: 1 },
            { key: 'tile-0-2', type: 'tile', tileRow: 0, tileCol: 2 },
          ],
          roomPositions: new Set(['0-0']),
          fieldPositions: new Set(['0-1']),
        })}
      />,
    )

    expect(html).toContain('farm-node-background')
    expect(html).toContain('empty-node empty-node-')
    expect(html).toContain('meeple-roomWood')
    expect(html).toContain('meeple-field')
    expect(html).not.toContain('farm-tile-text">Wood room')
    expect(html).not.toContain('farm-tile-text">Field')
    expect(html).not.toContain('farm-tile-text">Empty')
  })

  it('renders a B85 farmHand candidate as a clickable frame at the 2x2 center post', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [
            { key: 'tile-1-1', type: 'tile', tileRow: 1, tileCol: 1 },
            { key: '4-4', type: 'post' },
          ],
          farmHandSelectableSet: new Set(['1-1']),
        })}
      />,
    )

    // Center overlay sits on the geometric-center post (grid key 4-4 for top-left 1-1).
    expect(html).toMatch(/farmhand-center-overlay[^"]*\bfarmhand-center-candidate\b/)
    expect(html).toContain('data-farmhand-center-key="1-1"')
    // The 2x2 top-left tile itself is no longer the farmHand click target.
    expect(html).not.toMatch(/farm-tile[^"]*\bfarmhand-selectable\b/)
  })

  it('marks the selected B85 farmHand candidate overlay as selected', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [
            { key: 'tile-1-1', type: 'tile', tileRow: 1, tileCol: 1 },
            { key: '4-4', type: 'post' },
          ],
          farmHandSelectableSet: new Set(['1-1']),
          pendingFarmHandKey: '1-1',
        })}
      />,
    )

    expect(html).toMatch(/farmhand-center-overlay[^"]*\bfarmhand-center-selected\b/)
    expect(html).not.toMatch(/farm-tile[^"]*\bfarmhand-selected\b/)
  })

  it('renders a top-left barn icon on a built stable tile instead of the stable label', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 }],
          stablePositions: new Set(['0-0']),
        })}
      />,
    )

    expect(html).toContain('stable-barn-icon')
    expect(html).toContain('res-icon-barn')
    expect(html).not.toContain('farm-tile-text">Stable</span>')
  })

  it('colors the built stable barn icon by the display player color', () => {
    const player = createPlayer('p1', 'Player B', 'blue')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 }],
          stablePositions: new Set(['0-0']),
        })}
      />,
    )

    expect(html).toMatch(/stable-barn-icon[^>]*data-player-color="blue"/)
  })

  it('keeps the animal badge on a built stable tile alongside the barn icon', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 }],
          stablePositions: new Set(['0-0']),
          stableDisplayMap: new Map([['0-0', { animalType: 'sheep', animalCount: 1 }]]),
        })}
      />,
    )

    expect(html).toContain('stable-barn-icon')
    expect(html).toContain('pasture-info')
  })

  it('keeps the empty capacity badge on a built stable tile alongside the barn icon', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 }],
          stablePositions: new Set(['0-0']),
          stableDisplayMap: new Map([['0-0', { animalType: null, animalCount: 0 }]]),
        })}
      />,
    )

    expect(html).toContain('stable-barn-icon')
    expect(html).toContain('>0/1<')
  })

  it('does not render a barn icon on a buildable stable candidate tile', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 }],
          stableSelectableSet: new Set(['0-0']),
          maxStableSelections: 1,
        })}
      />,
    )

    expect(html).toMatch(/farm-tile[^"]*\bstable-selectable\b/)
    expect(html).not.toContain('stable-barn-icon')
  })

  it('marks highlighted fence edges', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: 'fence-h-0-0', type: 'fence-h', fenceId: 'h-0-0' }],
          highlightedFenceEdgeIds: new Set(['h-0-0']),
        })}
      />,
    )

    expect(html).toMatch(/farm-fence-h[^"]*\bevent-highlight\b/)
  })

  it('colors own fence segments by the displayed farm owner and borrowed segments by source owner', () => {
    const player = {
      ...createPlayer('p1', 'Player A', 'red'),
      fenceSegments: [
        { edge: 'H-0-0', type: 'fence' as const },
        { edge: 'V-0-0', type: 'fence' as const, source: { kind: 'borrowed' as const, ownerPlayerId: 'p2' } },
      ],
    }
    const donor = createPlayer('p2', 'Player B', 'blue')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          players: [player, donor],
          farmCells: [
            { key: 'fence-h-0-0', type: 'fence-h', fenceId: 'H-0-0' },
            { key: 'fence-v-0-0', type: 'fence-v', fenceId: 'V-0-0' },
          ],
          existingFenceSet: new Set(['H-0-0', 'V-0-0']),
        })}
      />,
    )

    expect(html).toMatch(/farm-fence-h[^>]*data-player-color="red"/)
    expect(html).toMatch(/farm-fence-v[^>]*data-player-color="blue"/)
  })

  it('renders farm fences with BGA fence orientation classes and color tokens', () => {
    const player = {
      ...createPlayer('p1', 'Player A', 'red'),
      fenceSegments: [
        { edge: 'H-0-0', type: 'fence' as const },
        { edge: 'V-0-0', type: 'fence' as const, source: { kind: 'borrowed' as const, ownerPlayerId: 'p2' } },
      ],
    }
    const donor = createPlayer('p2', 'Player B', 'blue')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          players: [player, donor],
          farmCells: [
            { key: 'fence-h-0-0', type: 'fence-h', fenceId: 'H-0-0' },
            { key: 'fence-v-0-0', type: 'fence-v', fenceId: 'V-0-0' },
          ],
          existingFenceSet: new Set(['H-0-0', 'V-0-0']),
        })}
      />,
    )

    expect(html).toMatch(/farm-fence-h[^"]*\bmeeple-fence\b[^"]*\bfence-hor\b[^>]*data-color="ff0000"/)
    expect(html).toMatch(/farm-fence-v[^"]*\bmeeple-fence\b[^"]*\bfence-ver\b[^>]*data-color="72c3b1"/)
  })

  it('previews pending borrowed fence edges with the selected donor color', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    const donor = createPlayer('p2', 'Player B', 'blue')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          players: [player, donor],
          farmCells: [{ key: 'fence-h-0-0', type: 'fence-h', fenceId: 'H-0-0' }],
          pendingFenceSet: new Set(['H-0-0']),
          pendingFenceSourceMap: { 'H-0-0': 'p2' },
          fenceSelectableSet: new Set(['H-0-0']),
        })}
      />,
    )

    expect(html).toMatch(/farm-fence-h[^>]*selected[^>]*data-player-color="blue"/)
  })

  it('renders off-board sow targets in a tray below the farm grid', () => {
    const player = createPlayer('p1', 'Player A', 'red')

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: '1-1', type: 'tile', tileRow: 0, tileCol: 0 }],
          sowRemaining: { grain: 0, vegetable: 0, wood: 2, stone: 0 },
          extraSowTargets: [
            {
              key: '-1-68',
              tile: { row: -1, col: 68 },
              allowedCrops: ['wood'],
              sourceCard: 'E068_CherryOrchard',
            },
          ],
        })}
      />,
    )

    expect(html).toContain('extra-sow-tray')
    expect(html).toContain('Cherry Orchard')
    expect(html).toContain('-1-68-sow-choice')
  })

  it('renders sow controls on on-board extra sow targets that are not fields', () => {
    const player = createPlayer('p1', 'Player 1', 'red')
    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: 'tile-0-0', type: 'tile', tileRow: 0, tileCol: 0 }],
          sowRemaining: { grain: 1, vegetable: 0, wood: 0, stone: 0 },
          sowSelectableMap: new Map([['0-0', ['grain']]]),
        })}
      />,
    )

    expect(html).toContain('0-0-sow-choice')
    expect(html).not.toContain('extra-sow-tray')
  })

  it('renders held-worker overlay when cardStates.heldWorkerId is set', () => {
    const player: PlayerState = {
      ...createPlayer('p1', 'Player A', 'red'),
      minorPlayed: ['C022_BasketChair'],
      cardStates: {
        C022_BasketChair: { counters: {}, infobox: undefined, stack: [], extraData: { heldWorkerId: '1' } },
      },
    }

    // With heldWorkerId — overlay must be present
    const htmlWith = renderToStaticMarkup(
      <FarmBoard {...createFarmBoardProps(player, { playedCards: ['minor:C022_BasketChair'] })} />,
    )
    expect(htmlWith).toContain('data-testid="played-card-held-worker-C022_BasketChair"')

    // Without heldWorkerId — overlay must be absent
    const playerNoWorker: PlayerState = {
      ...player,
      cardStates: {
        C022_BasketChair: { counters: {}, infobox: undefined, stack: [], extraData: {} },
      },
    }
    const htmlWithout = renderToStaticMarkup(
      <FarmBoard {...createFarmBoardProps(playerNoWorker, { playedCards: ['minor:C022_BasketChair'] })} />,
    )
    expect(htmlWithout).not.toContain('data-testid="played-card-held-worker-C022_BasketChair"')
  })

  it('applies palisade class to fence cells whose edge is in the palisade pending set', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    const edgeId = 'edge-test-palisade'

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [
            { key: 'fh-1', type: 'fence-h', fenceId: edgeId },
          ],
          pendingPalisadeSet: new Set([edgeId]),
          fenceSelectableSet: new Set([edgeId]),
        })}
      />,
    )

    // The farm-fence-h cell for the pending-palisade edge must carry the
    // `palisade` class marker so CSS can style it distinctly.
    expect(html).toMatch(/farm-fence-h[^"]*\bpalisade\b/)
    expect(html).toContain('selected')
  })

  it('renders stone sow button when allowedCrops includes stone and player has stone', () => {
    const player: PlayerState = {
      ...createPlayer('p1', 'Player A', 'red'),
      resources: { ...resources(), stone: 2 },
    }

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          farmCells: [{ key: '1-1', type: 'tile', tileRow: 0, tileCol: 0 }],
          sowRemaining: { grain: 0, vegetable: 0, wood: 0, stone: 2 },
          extraSowTargets: [
            {
              key: '-80-0',
              tile: { row: -80, col: 0 },
              allowedCrops: ['stone'],
              sourceCard: 'E080_RockGarden',
              groupKey: 'E080_RockGarden',
            },
          ],
        })}
      />,
    )

    // The extra-sow-tray for the E80 slot must include a sow-choice button
    // whose inner icon span carries the stone class. We assert via a regex
    // that finds a `<button class="sow-choice-button..."` followed by a
    // `res-icon-stone` icon span before the closing button tag.
    expect(html).toMatch(/sow-choice-button[^<]*<span class="res-icon res-icon-stone/)
    // Sow-choice radiogroup must exist for the E80 slot key.
    expect(html).toContain('-80-0-sow-choice')
  })

  it('renders 2 wood stacks on D75 card when cardFieldStacks has 2 entries', () => {
    const player: PlayerState = {
      ...createPlayer('p1', 'Player A', 'red'),
      minorPlayed: ['D075_WoodField'],
      cardStates: {
        D075_WoodField: {
          counters: {},
          infobox: undefined,
          stack: [],
          extraData: {
            cardFieldStacks: [
              { crop: 'wood', remaining: 3 },
              { crop: 'wood', remaining: 2 },
            ],
          },
        },
      },
    }

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['minor:D075_WoodField'],
        })}
      />,
    )

    // Each stack renders a separate `field-crop-segment` span. With 2 wood
    // stacks we expect 2 segments to be present (multi-stack render path).
    const segments = html.match(/field-crop-segment/g) ?? []
    expect(segments.length).toBeGreaterThanOrEqual(2)
  })

  it('renders C146 stored pairs from extraData as resource-pair stack on the played card', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.occupationPlayed = ['C146_WorkshopAssistant']
    player.cardStates = {
      C146_WorkshopAssistant: {
        extraData: { pairs: ['WC', 'CS'] },
      },
    }

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['occupation:C146_WorkshopAssistant'],
        })}
      />,
    )

    expect(html).toContain('card-stack-pair')
    expect(html).toContain('res-icon-wood')
    expect(html).toContain('res-icon-clay')
    expect(html).toContain('res-icon-stone')
    expect(html).not.toContain('res-icon-WC')
    expect(html).not.toContain('res-icon-CS')
  })

  it('renders bonus VP counters directly on played cards', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    player.minorPlayed = ['B034_SpecialFood']
    player.cardStates = {
      B034_SpecialFood: {
        counters: { bonusVp: 2 },
      },
    }

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['minor:B034_SpecialFood'],
        })}
      />,
    )

    expect(html).toContain('resource-chip resource-bonusVp')
    expect(html).toContain('res-icon-bonusVp')
    expect(html).toContain('resource-chip-count">2</span>')
  })
})

// ---------------------------------------------------------------------------
// Occupation-hand multi-select mode (Task 5.1)
// ---------------------------------------------------------------------------

const BASE_OCC_HAND = ['A102_Grocer', 'A105_BarrowPusher', 'A106_SlurrySpreader', 'A108_MushroomCollector']

const renderWithOccSelection = (
  occupationHandSelection?: {
    kind: 'occupation-hand'
    selectableCards: string[]
    minSelections: number
    maxSelections: number
  },
  overrides: Partial<{ onConfirmOccupationHandSelection: (ids: string[]) => void }> = {},
) => {
  const player = createPlayer('p1', 'Player A', 'red')
  const displayPlayer = { ...player, occupationHand: BASE_OCC_HAND }

  return renderToStaticMarkup(
    <FarmBoard
      {...createFarmBoardProps(displayPlayer, {
        occupationHandSelection,
      }, {
        onConfirmOccupationHandSelection: overrides.onConfirmOccupationHandSelection,
      })}
    />,
  )
}

describe('FarmBoard occupation-hand multi-select mode', () => {
  it('renders confirm button (disabled at 0 selections) when occupationHandSelection is active', () => {
    const html = renderWithOccSelection({
      kind: 'occupation-hand',
      selectableCards: BASE_OCC_HAND.slice(0, 3),
      minSelections: 3,
      maxSelections: 3,
    })

    // Confirm button should be present with the testid
    expect(html).toContain('data-testid="occupation-hand-confirm"')

    // Starts at 0 selected < min=3, so button must be disabled
    expect(html).toContain('disabled=""')
  })

  it('marks selectable cards with selectable class and non-selectable cards with unselectable', () => {
    const selectableCards = [BASE_OCC_HAND[0], BASE_OCC_HAND[1], BASE_OCC_HAND[2]]
    const nonSelectableCard = BASE_OCC_HAND[3]

    const html = renderWithOccSelection({
      kind: 'occupation-hand',
      selectableCards,
      minSelections: 1,
      maxSelections: 3,
    })

    // Selectable cards should get the selectable class
    expect(html).toMatch(/\bselectable\b/)

    // The non-selectable card should not appear with selectable class and should be disabled
    // We verify via unselectable class applied to disabled cards
    expect(html).toMatch(/\bunselectable\b/)

    // The non-selectable card ID should still appear in the HTML (card is rendered)
    expect(html).toContain(nonSelectableCard)
  })

  it('does not render confirm button when occupationHandSelection is undefined', () => {
    const html = renderWithOccSelection(undefined)

    // No multi-select mode — confirm button must be absent
    expect(html).not.toContain('data-testid="occupation-hand-confirm"')
    expect(html).not.toContain('hand-select-confirm')
  })
})
