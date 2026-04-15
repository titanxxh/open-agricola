import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import '../../shared/cards/C/C132_TimberShingleMaker'

const CARD_ID = 'C132_TimberShingleMaker'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 5, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 3, houseType: 'stone',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID], playedCards: [`occupation:${CARD_ID}`],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C132_TimberShingleMaker', () => {
  it('after renovate to stone: offers XOR to pay 1..N wood for bonus VP', () => {
    const listener = findListener('C132-timber-shingle-maker-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.rooms = 3
    player.resources.wood = 5
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('xor')
    const children = (result!.flow as any).children
    // Should have 3 options (1 wood for 1VP, 2 for 2VP, 3 for 3VP)
    expect(children).toHaveLength(3)

    // First option: pay 1 wood, 1 bonus-vp
    expect(children[0].type).toBe('seq')
    expect(children[0].children[0].actionId).toBe('pay-resources')
    expect(children[0].children[0].params).toEqual({ wood: 1 })
    expect(children[0].children[1].actionId).toBe('bonus-vp')

    // Third option: pay 3 wood, 3 bonus-vp
    expect(children[2].children[0].params).toEqual({ wood: 3 })
    expect(children[2].children).toHaveLength(4) // pay + 3 bonus-vp
  })

  it('does not trigger when house is not stone', () => {
    const listener = findListener('C132-timber-shingle-maker-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.houseType = 'clay'
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
  })

  it('limits wood to min of rooms and available wood', () => {
    const listener = findListener('C132-timber-shingle-maker-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.rooms = 5
    player.resources.wood = 2  // Only 2 wood available
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    const children = (result!.flow as any).children
    // Should only have 2 options (limited by wood)
    expect(children).toHaveLength(2)
  })

  it('computeBonusScore returns woodPlaced counter', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.computeBonusScore).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { woodPlaced: 3 } },
    }
    const state = createState(player)

    const score = effect!.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(3)
  })

  it('computeBonusScore returns 0 when no wood placed', () => {
    const effect = getCardEffect(CARD_ID)
    const player = createPlayer()
    const state = createState(player)

    const score = effect!.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(0)
  })
})
