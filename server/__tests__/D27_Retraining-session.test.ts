import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, PlayerState, ActionSpace, ActionChoiceOption } from '../../shared/contract/types'

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

const setupSwapSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.improvements = ['Major_Joinery']
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  setCardFlag(player, CARD_ID, true)
  setWorkersAtHome(state, player, 2)
  state.availableMajorImprovements = ['Major_Pottery', 'Major_Basket']
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources = { ...(forest.resources ?? {}), wood: 1 }

  session.loadState(state)
  return session
}

describe('D27_Retraining listeners', () => {
  it('registers both renovation-after and place-farmer-after listeners', () => {
    expect(findListener('D27-retraining-after-renovation')).toBeDefined()
    expect(findListener('D27-retraining-after-place-farmer')).toBeDefined()
  })

  it('renovation listener returns a set-flag flow without mutating immediately', () => {
    const listener = findListener('D27-retraining-after-renovation')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    const state = createState([player])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: true },
    })
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })


  it('place-farmer listener offers Joinery→Pottery swap without immediate mutation', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Joinery')
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], ['Major_Pottery'])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-flag', flag: false },
        },
        {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: {
                kind: 'swap-improvement-with-board',
                from: 'Major_Joinery',
                to: 'Major_Pottery',
              },
            },
          ],
        },
      ],
    })
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
    expect(state.availableMajorImprovements).toContain('Major_Pottery')
    expect(player.improvements).toContain('Major_Joinery')
  })

  it('place-farmer listener offers Pottery→Basket when Pottery is played', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Pottery')
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], ['Major_Basket'])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-flag', flag: false },
        },
        {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: {
                kind: 'swap-improvement-with-board',
                from: 'Major_Pottery',
                to: 'Major_Basket',
              },
            },
          ],
        },
      ],
    })
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
    expect(state.availableMajorImprovements).toContain('Major_Basket')
  })

  it('place-farmer listener clears the flag by flow when no swap is available', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], []) // no majors available

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: false },
    })
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
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
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
    expect(state.availableMajorImprovements).toContain('Major_Pottery')
  })

  it('declining the optional swap clears the flag but leaves board and player majors unchanged', () => {
    const session = setupSwapSession()

    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
    expect(resp.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_Pottery')
    expect(resp.state.availableMajorImprovements).toContain('Major_Pottery')

    const declined = session.resolveChoice(0, '__skip__')

    expect(declined.ok).toBe(true)
    expect(declined.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(declined.state.players[0]!.improvements).not.toContain('Major_Pottery')
    expect(declined.state.availableMajorImprovements).toContain('Major_Pottery')
    expect(declined.state.availableMajorImprovements).not.toContain('Major_Joinery')
  })

  it('accepting the optional swap exchanges the player major with the board', () => {
    const session = setupSwapSession()

    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    const acceptOption = resp.interaction.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()

    const accepted = session.resolveChoice(0, acceptOption!.value)

    expect(accepted.ok).toBe(true)
    expect(accepted.state.players[0]!.improvements).toContain('Major_Pottery')
    expect(accepted.state.players[0]!.improvements).not.toContain('Major_Joinery')
    expect(accepted.state.availableMajorImprovements).toContain('Major_Joinery')
    expect(accepted.state.availableMajorImprovements).not.toContain('Major_Pottery')
  })
})
