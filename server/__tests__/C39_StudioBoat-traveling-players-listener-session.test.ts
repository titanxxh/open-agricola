import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/C/C39_StudioBoat'

const CARD_ID = 'C39_StudioBoat'
const LISTENER_ID = 'C39-studio-boat-traveling-players-vp'

const createPlayer = (id = 'p1', minorPlayed: string[] = []): PlayerState =>
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
    improvements: [], minorHand: [], minorPlayed,
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: [],
  }) as unknown as ActionSpace

const createState = (players: PlayerState[], spaces: ActionSpace[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: spaces, log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const findListener = () =>
  getRegisteredCardListeners().find((l) => l.id === LISTENER_ID)

describe('C39_StudioBoat — traveling-players bonus VP listener', () => {
  it('is registered with the expected shape', () => {
    const listener = findListener()
    expect(listener).toBeDefined()
    expect(listener!.cardIds).toEqual([CARD_ID])
    expect(listener!.actions).toContain('place-farmer')
    expect(listener!.phases).toContain('after')
    // scope defaults to 'player' (actor must own the card)
    expect(listener!.scope ?? 'player').toBe('player')
  })

  it('returns a bonus-vp flow leaf when the actor places on traveling-players', () => {
    const listener = findListener()!
    const owner = createPlayer('p1', [CARD_ID])
    const travelingPlayers = createSpace('traveling-players')
    const state = createState([owner], [travelingPlayers])

    const result = executeCardListener(listener, {
      state,
      player: owner,
      space: travelingPlayers,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.sourceCard).toBe(CARD_ID)
    expect(result!.flow).toEqual({
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    })
  })

  it('returns void when the placement is on a different space', () => {
    const listener = findListener()!
    const owner = createPlayer('p1', [CARD_ID])
    const otherSpace = createSpace('fishing')
    const state = createState([owner], [otherSpace])

    const result = executeCardListener(listener, {
      state,
      player: owner,
      space: otherSpace,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('returns void when there is no space on the context', () => {
    const listener = findListener()!
    const owner = createPlayer('p1', [CARD_ID])
    const state = createState([owner], [])

    const result = executeCardListener(listener, {
      state,
      player: owner,
      space: undefined,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
