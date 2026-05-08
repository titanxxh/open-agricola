import { describe, expect, it } from 'vitest'

import { readCardExtraData } from '../../../cards/helpers/card-state'
import { registerSelectionEffect } from '../../helpers/selection-effect-registry'
import { selectionAction } from '../internal/selection'
import type { PlayerState } from '../../../contract/types'

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

describe('selection action with occupation-hand kind', () => {
  it("execute() emits promptKey 'ui.interactionOccupationHand' when selectionKind is occupation-hand", () => {
    const result = selectionAction.execute({
      actionContext: { selectionKind: 'occupation-hand', maxSelections: 3 },
    } as never)

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    expect(result.promptKey).toBe('ui.interactionOccupationHand')
    expect(result.promptParams).toEqual({ maxSelections: 3 })
  })

  it("execute() keeps farm-position promptKey when selectionKind is absent", () => {
    const result = selectionAction.execute({
      actionContext: {},
    } as never)

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    expect(result.promptKey).toBe('ui.interactionSelection')
  })

  it('resolveChoice propagates a flow returned by the effect handler', () => {
    const player = createMockPlayer()
    const testFlow = { type: 'leaf' as const, actionId: 'special-effect', sourceCard: 'TEST' }

    registerSelectionEffect('test-flow-effect', () => testFlow)

    const result = selectionAction.resolveChoice!(
      {
        player,
        sourceCard: 'TEST',
        actionContext: { selectionEffect: 'test-flow-effect' },
      } as never,
      'id1,id2',
    )

    expect(result.type).toBe('flow')
    if (result.type === 'flow') {
      expect(result.flow).toEqual(testFlow)
      expect(result.extraData).toEqual({ selectedPositions: ['id1', 'id2'] })
    }
  })

  it('resolveChoice returns ok when effect handler returns void (no flow)', () => {
    const player = createMockPlayer()

    registerSelectionEffect('test-void-effect', () => undefined)

    const result = selectionAction.resolveChoice!(
      {
        player,
        sourceCard: 'VOID_CARD',
        actionContext: { selectionEffect: 'test-void-effect' },
      } as never,
      'pos1,pos2',
    )

    expect(result.type).toBe('ok')
    if (result.type === 'ok') {
      expect(result.extraData).toEqual({ selectedPositions: ['pos1', 'pos2'] })
    }
  })
})
