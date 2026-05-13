import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PlayerState, Resource } from '../../../../shared/contract/types'
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
