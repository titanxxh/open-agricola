import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../../shared/cards/card-listeners'
import { computeAnimalZones } from '../../shared/actions/effects/animals'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import '../../shared/cards/C/C148_MudWallower'

const CARD_ID = 'C148_MudWallower'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
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

const createSpace = (id: string, gainPerRound: Partial<Record<string, number>> = {}): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound,
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C148_MudWallower', () => {
  it('onBuy initializes counter and held to 0', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    effect!.onBuy!(state, player)
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.infobox).toBe('0 / 4')
  })

  it('increments counter on accumulation space use', () => {
    const listener = findListener('C148-mud-wallower-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(createState(player), player)
    const state = createState(player)

    // Place farmer on an accumulation space (wood: 3 per round)
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(1)
    expect(result).toBeUndefined() // Not 4th placement yet
  })

  it('gains 1 pig on 4th accumulation space use', () => {
    const listener = findListener('C148-mud-wallower-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(createState(player), player)

    // Simulate 3 previous accumulation uses
    player.cardStates![CARD_ID]!.counters!.counter = 3

    const state = createState(player)

    // 4th placement
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('leaf')
    expect((result!.flow as any).actionId).toBe('gain')
    expect((result!.flow as any).params).toEqual({ boar: 1 })

    // Counter should reset, held should increase
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(1)
  })

  it('does not trigger on non-accumulation spaces', () => {
    const listener = findListener('C148-mud-wallower-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(createState(player), player)

    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('farmland', {}),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    // Counter should not increment
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
    expect(result).toBeUndefined()
  })

  it('onComputeAnimalZones provides pig holder zone', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 2 } },
    }

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === `card:${CARD_ID}`)
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
    expect(cardZone!.animalType).toBe('boar')
  })

  it('no animal zone when held is 0', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 0 } },
    }

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === `card:${CARD_ID}`)
    expect(cardZone).toBeUndefined()
  })
})
