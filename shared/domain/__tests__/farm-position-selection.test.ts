import { describe, expect, it } from 'vitest'

import type { PlayerState } from '../../contract/types'
import {
  buildFarmPositionSelectionRequest,
  validateFarmPositionSelection,
} from '../farm-position-selection'

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
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
  },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [{ row: 0, col: 0 }],
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

describe('Farm-position Selection', () => {
  it('normalizes selectable positions, selection counts, and valid groups', () => {
    const request = buildFarmPositionSelectionRequest(createPlayer(), {
      selectableTiles: [{ row: 0, col: 1 }, { row: 'bad', col: 2 }, { row: 0, col: 2 }],
      minSelections: 1,
      maxSelections: 2,
      allowedSelectionCounts: [2, 3.5, 'bad'],
      validPositionGroups: [[{ row: 0, col: 2 }, { row: 0, col: 1 }], 'bad'],
    })

    expect(request.selectablePositions).toEqual([{ row: 0, col: 1 }, { row: 0, col: 2 }])
    expect(request.minSelections).toBe(1)
    expect(request.maxSelections).toBe(2)
    expect(request.allowedSelectionCounts).toEqual([2])
    expect(request.validPositionGroups).toEqual([[{ row: 0, col: 2 }, { row: 0, col: 1 }]])
  })

  it('validates selected positions against groups, counts, and occupied terrain targets', () => {
    const request = buildFarmPositionSelectionRequest(createPlayer(), {
      selectableTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
      terrainMode: 'place',
      minSelections: 1,
      maxSelections: 2,
      allowedSelectionCounts: [2],
      validPositionGroups: [[{ row: 0, col: 1 }, { row: 0, col: 2 }]],
    })

    expect(validateFarmPositionSelection({
      request,
      positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    })).toEqual({ ok: false, error: 'invalid selection position' })
    expect(validateFarmPositionSelection({
      request,
      positions: [{ row: 0, col: 1 }],
    })).toEqual({ ok: false, error: 'invalid selection count' })
    expect(validateFarmPositionSelection({
      request,
      positions: [{ row: 0, col: 2 }, { row: 0, col: 1 }],
    })).toEqual({ ok: true, positionStrings: ['0-2', '0-1'] })
  })
})
