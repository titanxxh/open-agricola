import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'

import '../../shared/cards/C/C119_SkillfulRenovator'

const CARD_ID = 'C119_SkillfulRenovator'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'clay',
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
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C119_SkillfulRenovator', () => {
  it('onBuy gives 1 wood and 1 clay', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('gain')
    expect((flow as any).params).toEqual({ wood: 1, clay: 1 })
  })

  it('gains wood equal to farmers placed this round after renovation', () => {
    const listener = findListener('C119-skillful-renovator-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    // Record 3 placements this round
    recordRoundPlacement(player, 'forest', '1')
    recordRoundPlacement(player, 'farmland', '2')
    recordRoundPlacement(player, 'farm-redevelopment', '3')
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('leaf')
    expect((result!.flow as any).actionId).toBe('gain')
    expect((result!.flow as any).params).toEqual({ wood: 3 })
  })

  it('returns undefined when no farmers placed this round', () => {
    const listener = findListener('C119-skillful-renovator-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger when card is not played', () => {
    const listener = findListener('C119-skillful-renovator-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.occupationPlayed = []
    recordRoundPlacement(player, 'forest', '1')
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
  })
})
