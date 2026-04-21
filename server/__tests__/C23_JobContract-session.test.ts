import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../shared/game/types'

import '../../shared/cards/C/C23_JobContract'

const CARD_ID = 'C23_JobContract'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string, takenBy: string | null = null): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    takenBy: takenBy ? [{ playerId: takenBy, workerId: '1' }] : [],
  }) as unknown as ActionSpace

const createState = (
  players: PlayerState[],
  spaces: ActionSpace[],
): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: spaces, log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const findListener = () =>
  getRegisteredCardListeners().find((l) => l.id === 'C23-job-contract-after-day-laborer')

describe('C23_JobContract listener', () => {
  it('is registered on place-farmer after', () => {
    const listener = findListener()
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('place-farmer')
    expect(listener!.phases).toContain('after')
  })


  it('does nothing when the action is not day-laborer', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    const otherSpace = createSpace('grain-seeds', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [otherSpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: otherSpace, actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
    expect(lessonsSpace.takenBy).toEqual([])
  })

  it('does nothing when the lessons space is already occupied', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons', 'p2') // taken by someone else
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
    expect(lessonsSpace.takenBy[0]?.playerId).toBe('p2')
  })

  it('does nothing when the player has no occupations in hand', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
    expect(lessonsSpace.takenBy).toEqual([])
  })

  it('offers optional play-occupation flow and marks lessons as taken', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children[0].actionId).toBe('play-occupation')
    expect(flow.children[0].sourceCard).toBe(CARD_ID)
    // Lessons space is marked as occupied by this player (fake farmer)
    expect(lessonsSpace.takenBy.some((t) => t.playerId === player.id)).toBe(true)
  })

  it('passes costOverride with 0 food when the player has no occupations played', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    // occupationPlayed = [] means 0 food on 'lessons'
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as any)
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[0].params.costOverride).toEqual({})
  })

  it('passes costOverride with 1 food when the player has played occupations', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    player.occupationPlayed.push('some_occ') // >= 1 played
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as any)
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[0].params.costOverride).toEqual({ food: 1 })
  })
})
