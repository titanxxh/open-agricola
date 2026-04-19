import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PlayerState, Resource } from '../../../../shared/game/types'
import { FarmBoard } from '../FarmBoard'

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

describe('FarmBoard', () => {
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
        maxStableSelections={0}
        plowSelectableSet={new Set()}
        pendingPlowTile={null}
        positionSelectableSet={new Set()}
        pendingPositionSelections={new Set()}
        togglePositionSelection={() => {}}
        pendingSowSelections={{}}
        sowRemaining={{ grain: 0, vegetable: 0, wood: 2 }}
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
      maxStableSelections: 0,
      plowSelectableSet: new Set<string>(),
      pendingPlowTile: null,
      positionSelectableSet: new Set<string>(),
      pendingPositionSelections: new Set<string>(),
      togglePositionSelection: () => {},
      pendingSowSelections: {},
      sowRemaining: { grain: 0, vegetable: 0, wood: 0 },
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
        maxStableSelections={0}
        plowSelectableSet={new Set()}
        pendingPlowTile={null}
        positionSelectableSet={new Set()}
        pendingPositionSelections={new Set()}
        togglePositionSelection={() => {}}
        pendingSowSelections={{}}
        sowRemaining={{ grain: 0, vegetable: 0, wood: 0 }}
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
})
