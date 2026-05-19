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

  it('rejects cancel when farm-position selection requires at least one position', () => {
    const player = createMockPlayer()

    const result = selectionAction.resolveChoice!(
      {
        player,
        sourceCard: 'Test_Card',
        actionContext: {
          selectionKind: 'farm-position',
          minSelections: 1,
          maxSelections: 2,
          selectableTiles: [{ row: 0, col: 0 }],
        },
      } as never,
      'cancel',
    )

    expect(result).toEqual({ type: 'fail', errorKey: 'not enough selection positions',
      recoverable: true,
    })
  })

  it('rejects duplicate or unselectable farm-position submissions before effects run', () => {
    const player = createMockPlayer()
    let received: string[] | null = null

    registerSelectionEffect('test-selection-validation', ({ positions }) => {
      received = positions
    })

    const context = {
      player,
      sourceCard: 'Test_Card',
      actionContext: {
        selectionKind: 'farm-position',
        minSelections: 1,
        maxSelections: 2,
        selectableTiles: [{ row: 0, col: 0 }],
        selectionEffect: 'test-selection-validation',
      },
    } as never

    expect(selectionAction.resolveChoice!(context, '0-0,0-0')).toEqual({ type: 'fail', errorKey: 'duplicate selection position',
      recoverable: true,
    })
    expect(selectionAction.resolveChoice!(context, '0-1')).toEqual({ type: 'fail', errorKey: 'invalid selection position',
      recoverable: true,
    })
    expect(received).toBeNull()
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
