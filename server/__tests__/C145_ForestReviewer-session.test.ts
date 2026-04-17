import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../shared/game/types'

import '../../shared/cards/C/C145_ForestReviewer'

const CARD_ID = 'C145_ForestReviewer'

const createPlayer = (id: string): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
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
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createForestSpace = (takenBy: string | null): ActionSpace =>
  ({
    id: 'forest',
    nameKey: 'actions.forest.name',
    descriptionKey: 'actions.forest.description',
    roundAvailable: 1,
    gainPerRound: { wood: 3 },
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { wood: 3, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: takenBy ? [{ playerId: takenBy, workerId: '1' }] : [],
  }) as ActionSpace

const createGroveSpace = (takenBy: string | null): ActionSpace =>
  ({
    id: 'grove',
    nameKey: 'actions.grove.name',
    descriptionKey: 'actions.grove.description',
    roundAvailable: 1,
    gainPerRound: { wood: 2 },
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { wood: 2, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: takenBy ? [{ playerId: takenBy, workerId: '1' }] : [],
  }) as ActionSpace

const createState = (players: PlayerState[], actionSpaces: ActionSpace[]): GameState =>
  ({
    round: 3,
    phase: 'work',
    currentPlayerIndex: 0,
    players,
    actionSpaces,
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

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('C145_ForestReviewer', () => {
  it('owner gets 1 reed when grove is used and forest is occupied', () => {
    const listener = findListener('C145-forest-reviewer-any-place-farmer')
    expect(listener).toBeDefined()

    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    owner.playedCards.push(`occupation:${CARD_ID}`)
    const trigger = createPlayer('p2')

    const forestSpace = createForestSpace('p1') // occupied
    const groveSpace = createGroveSpace(null) // being used now

    const state = createState([owner, trigger], [forestSpace, groveSpace])

    const result = executeCardListener(listener!, {
      state,
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: groveSpace,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('leaf')
    expect((result!.flow as any).actionId).toBe('gain')
    expect((result!.flow as any).params).toEqual({ reed: 1 })
  })

  it('owner gets 1 reed when forest is used and grove is occupied', () => {
    const listener = findListener('C145-forest-reviewer-any-place-farmer')!

    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const forestSpace = createForestSpace(null) // being used now
    const groveSpace = createGroveSpace('p2') // occupied

    const state = createState([owner, trigger], [forestSpace, groveSpace])

    const result = executeCardListener(listener, {
      state,
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: forestSpace,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('leaf')
    expect((result!.flow as any).params).toEqual({ reed: 1 })
  })

  it('does not trigger when grove is used and forest is NOT occupied', () => {
    const listener = findListener('C145-forest-reviewer-any-place-farmer')!

    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const forestSpace = createForestSpace(null) // not occupied
    const groveSpace = createGroveSpace(null) // being used now

    const state = createState([owner, trigger], [forestSpace, groveSpace])

    const result = executeCardListener(listener, {
      state,
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: groveSpace,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger on non-wood spaces', () => {
    const listener = findListener('C145-forest-reviewer-any-place-farmer')!

    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const forestSpace = createForestSpace('p1')
    const groveSpace = createGroveSpace(null)

    const state = createState([owner, trigger], [forestSpace, groveSpace])

    const reedBankSpace = {
      id: 'reed-bank',
      resources: {},
      takenBy: [],
    } as any

    const result = executeCardListener(listener, {
      state,
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: reedBankSpace,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger when paired space does not exist', () => {
    const listener = findListener('C145-forest-reviewer-any-place-farmer')!

    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const trigger = createPlayer('p2')

    const groveSpace = createGroveSpace(null)
    // State has no forest space (e.g. 2-player game with only grove)
    const state = createState([owner, trigger], [groveSpace])

    const result = executeCardListener(listener, {
      state,
      player: trigger,
      ownerPlayer: owner,
      triggerPlayer: trigger,
      space: groveSpace,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeUndefined()
  })
})
