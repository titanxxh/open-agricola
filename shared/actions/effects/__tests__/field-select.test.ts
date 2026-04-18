import { describe, expect, it } from 'vitest'

import { registerSelectionEffect } from '../selection-effect-registry'
import { fieldSelectAction } from '../field-select'
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

describe('fieldSelectAction', () => {
  it('runs the registered selection effect from actionContext.selectionEffect', () => {
    const player = createMockPlayer()
    let received: string[] | null = null
    const effectName = 'test-selection-effect'

    registerSelectionEffect(effectName, ({ fields }) => {
      received = fields
    })

    const result = fieldSelectAction.resolveChoice!(
      {
        player,
        sourceCard: 'Test_Card',
        actionContext: {
          selectionEffect: effectName,
        },
      } as never,
      '0-0,1-1',
    )

    expect(result.type).toBe('ok')
    expect(received).toEqual(['0-0', '1-1'])
  })
})
