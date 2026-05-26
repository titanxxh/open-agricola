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
      'confirm',
      { positions: ['0-0', '1-1'] },
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
    let received: string[] | null = null

    registerSelectionEffect('test-selection-cancel', ({ positions }) => {
      received = positions
    })

    const result = selectionAction.resolveChoice!(
      {
        player,
        sourceCard: 'Test_Card',
        actionContext: {
          selectionKind: 'farm-position',
          minSelections: 1,
          maxSelections: 2,
          selectableTiles: [{ row: 0, col: 0 }],
          selectionEffect: 'test-selection-cancel',
        },
      } as never,
      'cancel',
    )

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.action',
      recoverable: true,
    })
    expect(received).toBeNull()
    expect(
      readCardExtraData<string[]>(player, 'Test_Card', 'selectedPositions'),
    ).toBeUndefined()
  })

  it('does not parse direct choice values as farm-position selections without structured payload', () => {
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
      '0-0',
    )

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'not enough selection positions',
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

    expect(
      selectionAction.resolveChoice!(context, 'confirm', { positions: ['0-0', '0-0'] }),
    ).toEqual({
      type: 'fail',
      errorKey: 'duplicate selection position',
      recoverable: true,
    })
    expect(
      selectionAction.resolveChoice!(context, 'confirm', { positions: ['0-1'] }),
    ).toEqual({
      type: 'fail',
      errorKey: 'invalid selection position',
      recoverable: true,
    })
    expect(received).toBeNull()
  })

  it('rejects farm-position selections outside allowedSelectionCounts before effects run', () => {
    const player = createMockPlayer()
    let received: string[] | null = null

    registerSelectionEffect('test-selection-count-validation', ({ positions }) => {
      received = positions
    })

    const result = selectionAction.resolveChoice!(
      {
        player,
        sourceCard: 'Test_Card',
        actionContext: {
          selectionKind: 'farm-position',
          minSelections: 1,
          maxSelections: 4,
          allowedSelectionCounts: [1, 3, 4],
          selectableTiles: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
          ],
          selectionEffect: 'test-selection-count-validation',
        },
      } as never,
      'confirm',
      { positions: ['0-0', '0-1'] },
    )

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'invalid selection count',
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
    expect(result.request.options.map((option) => option.value)).toEqual(['confirm'])
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
    expect(result.request.options.map((option) => option.value)).toEqual(['confirm'])
    expect(result.promptKey).toBe('ui.interactionSelection')
  })

  it('resolveChoice propagates a flow returned by the effect handler', () => {
    const player = createMockPlayer()
    player.occupationHand = ['id1', 'id2']
    const testFlow = { type: 'leaf' as const, actionId: 'special-effect', sourceCard: 'TEST' }

    registerSelectionEffect('test-flow-effect', () => testFlow)

    const result = selectionAction.resolveChoice!(
      {
        player,
        sourceCard: 'TEST',
        actionContext: {
          selectionKind: 'occupation-hand',
          selectionEffect: 'test-flow-effect',
        },
      } as never,
      'confirm',
      { cards: ['id1', 'id2'] },
    )

    expect(result.type).toBe('flow')
    if (result.type === 'flow') {
      expect(result.flow).toEqual(testFlow)
      expect(result.extraData).toEqual({
        selectedPositions: [],
        selectedCards: ['id1', 'id2'],
      })
    }
  })

  it('resolveChoice returns ok when effect handler returns void (no flow)', () => {
    const player = createMockPlayer()
    player.occupationHand = ['id1', 'id2']

    registerSelectionEffect('test-void-effect', () => undefined)

    const result = selectionAction.resolveChoice!(
      {
        player,
        sourceCard: 'VOID_CARD',
        actionContext: {
          selectionKind: 'occupation-hand',
          selectionEffect: 'test-void-effect',
        },
      } as never,
      'confirm',
      { cards: ['id1', 'id2'] },
    )

    expect(result.type).toBe('ok')
    if (result.type === 'ok') {
      expect(result.extraData).toEqual({
        selectedPositions: [],
        selectedCards: ['id1', 'id2'],
      })
    }
  })

  it('validates occupation cards against min max and hand before effects run', () => {
    const player = createMockPlayer()
    player.occupationHand = ['id1', 'id2', 'id3']
    let received: string[] | null = null

    registerSelectionEffect('test-occupation-validation', ({ cards }) => {
      received = cards
    })

    const context = {
      player,
      sourceCard: 'VALIDATE_CARD',
      actionContext: {
        selectionKind: 'occupation-hand',
        minSelections: 1,
        maxSelections: 2,
        selectionEffect: 'test-occupation-validation',
      },
    } as never

    expect(
      selectionAction.resolveChoice!(context, 'confirm', { cards: [] }),
    ).toEqual({
      type: 'fail',
      errorKey: 'not enough card selections',
      recoverable: true,
    })
    expect(
      selectionAction.resolveChoice!(context, 'confirm', { cards: ['id1', 'id2', 'id3'] }),
    ).toEqual({
      type: 'fail',
      errorKey: 'too many card selections',
      recoverable: true,
    })
    expect(
      selectionAction.resolveChoice!(context, 'confirm', { cards: ['missing'] }),
    ).toEqual({
      type: 'fail',
      errorKey: 'card missing not in occupation hand',
      recoverable: true,
    })
    expect(received).toBeNull()
  })
})
