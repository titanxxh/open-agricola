import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import { setCardFlag, isCardFlagged, readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import '../../shared/cards/D/D27_Retraining'

const CARD_ID = 'D27_Retraining'

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

const createState = (players: PlayerState[], majors: string[] = []): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: majors,
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    takenBy: [],
  }) as unknown as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('D27_Retraining listeners', () => {
  it('registers both renovation-after and place-farmer-after listeners', () => {
    expect(findListener('D27-retraining-after-renovation')).toBeDefined()
    expect(findListener('D27-retraining-after-place-farmer')).toBeDefined()
  })

  it('renovation listener flags the card when owner played it', () => {
    const listener = findListener('D27-retraining-after-renovation')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    const state = createState([player])

    executeCardListener(listener, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)

    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })


  it('place-farmer listener offers Joinery→Pottery swap when the player has Joinery', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Joinery')
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], ['Major_Pottery'])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
    // Pottery was reserved (removed from available board)
    expect(state.availableMajorImprovements).not.toContain('Major_Pottery')
    // Pending swap stored on card state
    const pending = readCardExtraData<{ from: string; to: string }>(player, CARD_ID, 'pendingSwap')
    expect(pending).toEqual({ from: 'Major_Joinery', to: 'Major_Pottery' })
  })

  it('place-farmer listener prefers Pottery→Basket when Pottery is played', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Pottery')
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], ['Major_Basket'])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    const pending = readCardExtraData<{ from: string; to: string }>(player, CARD_ID, 'pendingSwap')
    expect(pending).toEqual({ from: 'Major_Pottery', to: 'Major_Basket' })
  })

  it('place-farmer listener does nothing when no swap is available', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], []) // no majors available

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
    // Flag is unset even when no swap was possible
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })

  it('place-farmer listener does nothing if card is not flagged', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Joinery')
    const state = createState([player], ['Major_Pottery'])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
    expect(state.availableMajorImprovements).toContain('Major_Pottery')
  })
})
