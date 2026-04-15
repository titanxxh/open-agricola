import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../shared/game/types'

import '../../shared/cards/D/D39_TruffleSlicer'

const CARD_ID = 'D39_TruffleSlicer'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 3,
      grain: 0, vegetable: 0, sheep: 0, boar: 2, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [], playedCards: [`minor:${CARD_ID}`],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3,
    phase: 'work',
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('D39_TruffleSlicer', () => {
  it('triggers optional pay 1 food for 1 bonus VP on forest space with boar', () => {
    const listener = findListener('D39-truffle-slicer-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('forest'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    expect((result!.flow as any).optional).toBe(true)
    const children = (result!.flow as any).children
    expect(children).toHaveLength(2)
    expect(children[0].actionId).toBe('pay-resources')
    expect(children[0].params).toEqual({ food: 1 })
    expect(children[1].actionId).toBe('bonus-vp')
    expect(children[1].sourceCard).toBe(CARD_ID)
  })

  it('triggers on copse space', () => {
    const listener = findListener('D39-truffle-slicer-after-place-farmer')!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('copse'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)
    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
  })

  it('triggers on grove space', () => {
    const listener = findListener('D39-truffle-slicer-after-place-farmer')!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('grove'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)
    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
  })

  it('does not trigger on non-wood space', () => {
    const listener = findListener('D39-truffle-slicer-after-place-farmer')!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('reed-bank'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when player has no boar', () => {
    const listener = findListener('D39-truffle-slicer-after-place-farmer')!
    const player = createPlayer()
    player.resources.boar = 0
    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('forest'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when player has no food', () => {
    const listener = findListener('D39-truffle-slicer-after-place-farmer')!
    const player = createPlayer()
    player.resources.food = 0
    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('forest'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when card is not played', () => {
    const listener = findListener('D39-truffle-slicer-after-place-farmer')!
    const player = createPlayer()
    player.minorPlayed = []
    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('forest'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)
    expect(result).toBeUndefined()
  })
})
