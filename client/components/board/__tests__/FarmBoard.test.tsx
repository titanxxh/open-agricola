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
    B34_SpecialFood: manifestEntry('B34_SpecialFood', 'Special Food', 'minor'),
    C22_BasketChair: manifestEntry('C22_BasketChair', 'Basket Chair', 'minor'),
    C11_WildlifeReserve: manifestEntry('C11_WildlifeReserve', 'Wildlife Reserve', 'minor'),
    C148_MudWallower: manifestEntry('C148_MudWallower', 'Mud Wallower', 'occupation'),
    C146_WorkshopAssistant: manifestEntry('C146_WorkshopAssistant', 'Workshop Assistant', 'occupation'),
    D75_WoodField: manifestEntry('D75_WoodField', 'Wood Field', 'minor'),
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

describe('FarmBoard', () => {
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
    expect(html).toContain('Forest')
    expect(html).toContain('Moor')
    expect(html).toContain('res-icon-fuel')
    expect(html).toContain('res-icon-horse')
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
    player.minorPlayed = ['C11_WildlifeReserve']

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['C11_WildlifeReserve'],
          isReorgActive: true,
          reorgRemaining: { sheep: 1, boar: 0, cattle: 0, horse: 0 },
          cardDisplayMap: new Map([
            ['C11_WildlifeReserve', {
              zoneId: 'card:C11_WildlifeReserve',
              capacity: 3,
              animalType: null,
              animalCount: 3,
              animalCounts: { sheep: 1, boar: 1, horse: 1 },
            }],
          ]),
        })}
      />,
    )

    expect(html).toContain(
      '<span class="pasture-control-label">Sheep</span><button>-</button><span class="pasture-control-value">1</span><button disabled="">+</button>',
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
      minorHand: ['B34_SpecialFood'],
    }
    const turnPlayer = createPlayer('p2', 'Player B', 'blue')
    const resolveChoice = vi.fn()

    const { container } = render(
      <FarmBoard
        {...createFarmBoardProps(activePlayer, {
          players: [activePlayer, turnPlayer],
          currentPlayer: turnPlayer,
          displayPlayer: activePlayer,
          isSelectingMinor: true,
          isSelectingImprovementAny: true,
          selectableMinorIds: new Set(['B34_SpecialFood']),
          resolveChoice,
        })}
        activePlayerId={activePlayer.id}
      />,
    )

    fireEvent.click(container.querySelector('[data-id="B34_SpecialFood"]')!)

    expect(resolveChoice).toHaveBeenCalledWith('minor:B34_SpecialFood')
  })

  it('renders reorg controls for card animal zones', () => {
    const player = createPlayer('p1', 'Player A', 'red')

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
    expect(html).toContain('aria-label="Rooms: 2"')
    expect(html).toContain('aria-label="Housing capacity: 2"')
    expect(html).toContain('aria-label="Fence capacity: 17/17"')
    expect(html).toContain('aria-label="Stable supply: 3/4"')
    expect(html).toMatch(/res-compact-item[\s\S]*res-icon-fence-icon[\s\S]*>17\/17</)
    expect(html).toMatch(/res-compact-item[\s\S]*res-icon-barn[\s\S]*>3\/4</)
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
        locale="en"
        players={[player]}
        currentPlayer={player}
        displayPlayer={player}
        devMode={false}
        currentStartPlayerId=""
        nextStartPlayerId=""
        playedCards={[]}
        farmCells={[{ key: '1-1', type: 'tile', tileRow: 0, tileCol: 0 }]}
        roomPositions={new Set()}
        fieldPositions={new Set()}
        fieldMap={new Map()}
        stablePositions={new Set()}
        pendingRoomSet={new Set()}
        pendingStableSet={new Set()}
        roomSelectableSet={new Set()}
        stableSelectableSet={new Set()}
        farmHandSelectableSet={new Set()}
        pendingFarmHandKey={null}
        builtSpecialStableKeys={new Set()}
        maxStableSelections={0}
        plowSelectableSet={new Set()}
        pendingPlowTile={null}
        positionSelectableSet={new Set()}
        pendingPositionSelections={new Set()}
        togglePositionSelection={() => {}}
        pendingSowSelections={{}}
        sowRemaining={{ grain: 0, vegetable: 0, wood: 2, stone: 0 }}
        sowSelectableMap={new Map()}
        pastureTiles={new Map()}
        pastureDisplayMap={new Map()}
        pastureCapacityMap={new Map()}
        houseDisplay={{ animalType: null, animalCount: 0 }}
        stableDisplayMap={new Map()}
        isReorgActive={false}
        reorgRemaining={null}
        hasReorgOverflow={false}
        animalReorg={null}
        pendingFenceSet={new Set()}
        existingFenceSet={new Set()}
        fenceSelectableSet={new Set()}
        toggleRoomTile={() => {}}
        toggleStableTile={() => {}}
        toggleFarmHand={() => {}}
        togglePlowTile={() => {}}
        updateSowSelection={() => {}}
        toggleFenceEdge={() => {}}
        adjustReorgAnimal={() => {}}
        confirmAnimalReorg={() => {}}
        cancelAnimalDiscardPrompt={() => {}}
        setViewPlayerId={() => {}}
        isSelectingMinor={false}
        isSelectingOccupation={false}
        isSelectingImprovementAny={false}
        selectableMinorIds={new Set()}
        selectableOccupationIds={new Set()}
        cardAvailability={{}}
        futureCardResources={{}}
        resolveChoice={() => {}}
        isInteractive={true}
        {...({
          extraSowTargets: [
            {
              key: '-1-68',
              tile: { row: -1, col: 68 },
              allowedCrops: ['wood'],
              sourceCard: 'E68_CherryOrchard',
            },
          ],
        } as any)}
      />,
    )

    expect(html).toContain('extra-sow-tray')
    expect(html).toContain('Cherry Orchard')
    expect(html).toContain('-1-68-sow-choice')
  })

  it('renders held-worker overlay when cardStates.heldWorkerId is set', () => {
    const player: PlayerState = {
      ...createPlayer('p1', 'Player A', 'red'),
      minorPlayed: ['C22_BasketChair'],
      cardStates: {
        C22_BasketChair: { counters: {}, infobox: undefined, stack: [], extraData: { heldWorkerId: '1' } },
      },
    }

    const commonProps = {
      locale: 'en' as const,
      players: [player],
      currentPlayer: player,
      displayPlayer: player,
      devMode: false,
      currentStartPlayerId: '',
      nextStartPlayerId: '',
      playedCards: ['minor:C22_BasketChair'],
      farmCells: [],
      roomPositions: new Set<string>(),
      fieldPositions: new Set<string>(),
      fieldMap: new Map(),
      stablePositions: new Set<string>(),
      pendingRoomSet: new Set<string>(),
      pendingStableSet: new Set<string>(),
      roomSelectableSet: new Set<string>(),
      stableSelectableSet: new Set<string>(),
      farmHandSelectableSet: new Set<string>(),
      pendingFarmHandKey: null,
      builtSpecialStableKeys: new Set<string>(),
      maxStableSelections: 0,
      plowSelectableSet: new Set<string>(),
      pendingPlowTile: null,
      positionSelectableSet: new Set<string>(),
      pendingPositionSelections: new Set<string>(),
      togglePositionSelection: () => {},
      pendingSowSelections: {},
      sowRemaining: { grain: 0, vegetable: 0, wood: 0, stone: 0 },
      sowSelectableMap: new Map(),
      pastureTiles: new Map(),
      pastureDisplayMap: new Map(),
      pastureCapacityMap: new Map(),
      houseDisplay: { animalType: null, animalCount: 0 },
      stableDisplayMap: new Map(),
      isReorgActive: false,
      reorgRemaining: null,
      hasReorgOverflow: false,
      animalReorg: null,
      pendingFenceSet: new Set<string>(),
      existingFenceSet: new Set<string>(),
      fenceSelectableSet: new Set<string>(),
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
      selectableMinorIds: new Set<string>(),
      selectableOccupationIds: new Set<string>(),
      cardAvailability: {},
      futureCardResources: {},
      resolveChoice: () => {},
      isInteractive: true,
    }

    const extraProps = { extraSowTargets: [] }

    // With heldWorkerId — overlay must be present
    const htmlWith = renderToStaticMarkup(
      <FarmBoard {...(commonProps as any)} {...(extraProps as any)} />,
    )
    expect(htmlWith).toContain('data-testid="played-card-held-worker-C22_BasketChair"')

    // Without heldWorkerId — overlay must be absent
    const playerNoWorker: PlayerState = {
      ...player,
      cardStates: {
        C22_BasketChair: { counters: {}, infobox: undefined, stack: [], extraData: {} },
      },
    }
    const htmlWithout = renderToStaticMarkup(
      <FarmBoard {...({ ...commonProps, displayPlayer: playerNoWorker } as any)} {...(extraProps as any)} />,
    )
    expect(htmlWithout).not.toContain('data-testid="played-card-held-worker-C22_BasketChair"')
  })

  it('applies palisade class to fence cells whose edge is in the palisade pending set', () => {
    const player = createPlayer('p1', 'Player A', 'red')
    const edgeId = 'edge-test-palisade'

    const html = renderToStaticMarkup(
      <FarmBoard
        locale="en"
        players={[player]}
        currentPlayer={player}
        displayPlayer={player}
        devMode={false}
        currentStartPlayerId=""
        nextStartPlayerId=""
        playedCards={[]}
        farmCells={[
          { key: 'fh-1', type: 'fence-h', fenceId: edgeId } as never,
        ]}
        roomPositions={new Set()}
        fieldPositions={new Set()}
        fieldMap={new Map()}
        stablePositions={new Set()}
        pendingRoomSet={new Set()}
        pendingStableSet={new Set()}
        roomSelectableSet={new Set()}
        stableSelectableSet={new Set()}
        farmHandSelectableSet={new Set()}
        pendingFarmHandKey={null}
        builtSpecialStableKeys={new Set()}
        maxStableSelections={0}
        plowSelectableSet={new Set()}
        pendingPlowTile={null}
        positionSelectableSet={new Set()}
        pendingPositionSelections={new Set()}
        togglePositionSelection={() => {}}
        pendingSowSelections={{}}
        sowRemaining={{ grain: 0, vegetable: 0, wood: 0, stone: 0 }}
        sowSelectableMap={new Map()}
        pastureTiles={new Map()}
        pastureDisplayMap={new Map()}
        pastureCapacityMap={new Map()}
        houseDisplay={{ animalType: null, animalCount: 0 }}
        stableDisplayMap={new Map()}
        isReorgActive={false}
        reorgRemaining={null}
        hasReorgOverflow={false}
        animalReorg={null}
        pendingFenceSet={new Set()}
        pendingPalisadeSet={new Set([edgeId])}
        existingFenceSet={new Set()}
        fenceSelectableSet={new Set([edgeId])}
        toggleRoomTile={() => {}}
        toggleStableTile={() => {}}
        toggleFarmHand={() => {}}
        togglePlowTile={() => {}}
        updateSowSelection={() => {}}
        toggleFenceEdge={() => {}}
        adjustReorgAnimal={() => {}}
        confirmAnimalReorg={() => {}}
        cancelAnimalDiscardPrompt={() => {}}
        setViewPlayerId={() => {}}
        isSelectingMinor={false}
        isSelectingOccupation={false}
        isSelectingImprovementAny={false}
        selectableMinorIds={new Set()}
        selectableOccupationIds={new Set()}
        cardAvailability={{}}
        futureCardResources={{}}
        resolveChoice={() => {}}
        isInteractive={true}
        {...({ extraSowTargets: [] } as any)}
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
        locale="en"
        players={[player]}
        currentPlayer={player}
        displayPlayer={player}
        devMode={false}
        currentStartPlayerId=""
        nextStartPlayerId=""
        playedCards={[]}
        farmCells={[{ key: '1-1', type: 'tile', tileRow: 0, tileCol: 0 }]}
        roomPositions={new Set()}
        fieldPositions={new Set()}
        fieldMap={new Map()}
        stablePositions={new Set()}
        pendingRoomSet={new Set()}
        pendingStableSet={new Set()}
        roomSelectableSet={new Set()}
        stableSelectableSet={new Set()}
        farmHandSelectableSet={new Set()}
        pendingFarmHandKey={null}
        builtSpecialStableKeys={new Set()}
        maxStableSelections={0}
        plowSelectableSet={new Set()}
        pendingPlowTile={null}
        positionSelectableSet={new Set()}
        pendingPositionSelections={new Set()}
        togglePositionSelection={() => {}}
        pendingSowSelections={{}}
        sowRemaining={{ grain: 0, vegetable: 0, wood: 0, stone: 2 }}
        sowSelectableMap={new Map()}
        pastureTiles={new Map()}
        pastureDisplayMap={new Map()}
        pastureCapacityMap={new Map()}
        houseDisplay={{ animalType: null, animalCount: 0 }}
        stableDisplayMap={new Map()}
        isReorgActive={false}
        reorgRemaining={null}
        hasReorgOverflow={false}
        animalReorg={null}
        pendingFenceSet={new Set()}
        existingFenceSet={new Set()}
        fenceSelectableSet={new Set()}
        toggleRoomTile={() => {}}
        toggleStableTile={() => {}}
        toggleFarmHand={() => {}}
        togglePlowTile={() => {}}
        updateSowSelection={() => {}}
        toggleFenceEdge={() => {}}
        adjustReorgAnimal={() => {}}
        confirmAnimalReorg={() => {}}
        cancelAnimalDiscardPrompt={() => {}}
        setViewPlayerId={() => {}}
        isSelectingMinor={false}
        isSelectingOccupation={false}
        isSelectingImprovementAny={false}
        selectableMinorIds={new Set()}
        selectableOccupationIds={new Set()}
        cardAvailability={{}}
        futureCardResources={{}}
        resolveChoice={() => {}}
        isInteractive={true}
        {...({
          extraSowTargets: [
            {
              key: '-80-0',
              tile: { row: -80, col: 0 },
              allowedCrops: ['stone'],
              sourceCard: 'E80_RockGarden',
              groupKey: 'E80_RockGarden',
            },
          ],
        } as any)}
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
      minorPlayed: ['D75_WoodField'],
      cardStates: {
        D75_WoodField: {
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
        locale="en"
        players={[player]}
        currentPlayer={player}
        displayPlayer={player}
        devMode={false}
        currentStartPlayerId=""
        nextStartPlayerId=""
        playedCards={['minor:D75_WoodField']}
        farmCells={[]}
        roomPositions={new Set()}
        fieldPositions={new Set()}
        fieldMap={new Map()}
        stablePositions={new Set()}
        pendingRoomSet={new Set()}
        pendingStableSet={new Set()}
        roomSelectableSet={new Set()}
        stableSelectableSet={new Set()}
        farmHandSelectableSet={new Set()}
        pendingFarmHandKey={null}
        builtSpecialStableKeys={new Set()}
        maxStableSelections={0}
        plowSelectableSet={new Set()}
        pendingPlowTile={null}
        positionSelectableSet={new Set()}
        pendingPositionSelections={new Set()}
        togglePositionSelection={() => {}}
        pendingSowSelections={{}}
        sowRemaining={{ grain: 0, vegetable: 0, wood: 0, stone: 0 }}
        sowSelectableMap={new Map()}
        pastureTiles={new Map()}
        pastureDisplayMap={new Map()}
        pastureCapacityMap={new Map()}
        houseDisplay={{ animalType: null, animalCount: 0 }}
        stableDisplayMap={new Map()}
        isReorgActive={false}
        reorgRemaining={null}
        hasReorgOverflow={false}
        animalReorg={null}
        pendingFenceSet={new Set()}
        existingFenceSet={new Set()}
        fenceSelectableSet={new Set()}
        toggleRoomTile={() => {}}
        toggleStableTile={() => {}}
        toggleFarmHand={() => {}}
        togglePlowTile={() => {}}
        updateSowSelection={() => {}}
        toggleFenceEdge={() => {}}
        adjustReorgAnimal={() => {}}
        confirmAnimalReorg={() => {}}
        cancelAnimalDiscardPrompt={() => {}}
        setViewPlayerId={() => {}}
        isSelectingMinor={false}
        isSelectingOccupation={false}
        isSelectingImprovementAny={false}
        selectableMinorIds={new Set()}
        selectableOccupationIds={new Set()}
        cardAvailability={{}}
        futureCardResources={{}}
        resolveChoice={() => {}}
        isInteractive={true}
        {...({ extraSowTargets: [] } as any)}
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
    player.minorPlayed = ['B34_SpecialFood']
    player.cardStates = {
      B34_SpecialFood: {
        counters: { bonusVp: 2 },
      },
    }

    const html = renderToStaticMarkup(
      <FarmBoard
        {...createFarmBoardProps(player, {
          playedCards: ['minor:B34_SpecialFood'],
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
      locale="en"
      players={[displayPlayer]}
      currentPlayer={displayPlayer}
      displayPlayer={displayPlayer}
      devMode={false}
      currentStartPlayerId=""
      nextStartPlayerId=""
      playedCards={[]}
      farmCells={[]}
      roomPositions={new Set()}
      fieldPositions={new Set()}
      fieldMap={new Map()}
      stablePositions={new Set()}
      pendingRoomSet={new Set()}
      pendingStableSet={new Set()}
      roomSelectableSet={new Set()}
      stableSelectableSet={new Set()}
      farmHandSelectableSet={new Set()}
      pendingFarmHandKey={null}
        builtSpecialStableKeys={new Set()}
      maxStableSelections={0}
      plowSelectableSet={new Set()}
      pendingPlowTile={null}
      positionSelectableSet={new Set()}
      pendingPositionSelections={new Set()}
      togglePositionSelection={() => {}}
      pendingSowSelections={{}}
      sowRemaining={{ grain: 0, vegetable: 0, wood: 0, stone: 0 }}
      sowSelectableMap={new Map()}
      pastureTiles={new Map()}
      pastureDisplayMap={new Map()}
      pastureCapacityMap={new Map()}
      houseDisplay={{ animalType: null, animalCount: 0 }}
      stableDisplayMap={new Map()}
      isReorgActive={false}
      reorgRemaining={null}
      hasReorgOverflow={false}
      animalReorg={null}
      pendingFenceSet={new Set()}
      existingFenceSet={new Set()}
      fenceSelectableSet={new Set()}
      toggleRoomTile={() => {}}
      toggleStableTile={() => {}}
      toggleFarmHand={() => {}}
      togglePlowTile={() => {}}
      updateSowSelection={() => {}}
      toggleFenceEdge={() => {}}
      adjustReorgAnimal={() => {}}
      confirmAnimalReorg={() => {}}
      cancelAnimalDiscardPrompt={() => {}}
      setViewPlayerId={() => {}}
      isSelectingMinor={false}
      isSelectingOccupation={false}
      isSelectingImprovementAny={false}
      selectableMinorIds={new Set()}
      selectableOccupationIds={new Set()}
      cardAvailability={{}}
      futureCardResources={{}}
      resolveChoice={() => {}}
      isInteractive={true}
      occupationHandSelection={occupationHandSelection}
      onConfirmOccupationHandSelection={overrides.onConfirmOccupationHandSelection}
      {...({ extraSowTargets: [] } as any)}
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
