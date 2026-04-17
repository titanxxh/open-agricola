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
  occupationPlayed: [],
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
        fieldSelectableSet={new Set()}
        pendingFieldSelections={new Set()}
        toggleFieldSelection={() => {}}
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
})
