import { describe, expect, it } from 'vitest'

import { readCardExtraData } from '../../../cards/helpers/card-state'
import { registerSelectionEffect } from '../selection-effect-registry'
import { selectionAction } from '../selection'
import type { PlayerState } from '../../../game/types'

const createMockPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
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

describe('selectionAction', () => {
  it('persists selectedPositions and passes positions to selectionEffect', () => {
    const player = createMockPlayer()
    let received: string[] | null = null

    registerSelectionEffect('test-selection', ({ positions }) => {
      received = positions
    })

    const result = selectionAction.resolveChoice!(
      {
        player,
        sourceCard: 'Test_Card',
        actionContext: {
          selectionKind: 'farm-position',
          selectionEffect: 'test-selection',
        },
      } as never,
      '0-0,1-1',
    )

    expect(result).toEqual({
      type: 'ok',
      extraData: { selectedPositions: ['0-0', '1-1'] },
    })
    expect(received).toEqual(['0-0', '1-1'])
    expect(
      readCardExtraData<string[]>(player, 'Test_Card', 'selectedPositions'),
    ).toEqual(['0-0', '1-1'])
  })
})
