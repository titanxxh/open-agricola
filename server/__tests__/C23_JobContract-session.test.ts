import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../shared/contract/types'
import { isSyntheticLinkedOccupancy } from '../../shared/domain/space'
import { getAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'
import { createTriggerSnapshot } from '../../shared/cards/helpers/trigger-snapshot'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C023_JobContract'

const CARD_ID = 'C023_JobContract'
const OCCUPY_ACTION_ID = 'card_C023_JobContract_occupyLessons'

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
    actionSpaces: spaces, log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const findListener = () =>
  getRegisteredCardListeners().find((l) => l.id === 'C23-job-contract-after-day-laborer')

describe('C023_JobContract listener', () => {
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
    player.occupationHand = ['A009_SheepFarmer']
    const otherSpace = createSpace('grain-seeds', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [otherSpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: otherSpace, actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
    expect(lessonsSpace.takenBy).toEqual([])
  })

  it('does nothing when the lessons space is already occupied', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A009_SheepFarmer']
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons', 'p2') // taken by someone else
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
    expect(lessonsSpace.takenBy[0]?.playerId).toBe('p2')
  })

  it('returns an optional flow without occupying lessons during listener dispatch', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
    expect(lessonsSpace.takenBy).toEqual([])
  })

  it('places the occupancy action after the occupation leaf', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A009_SheepFarmer']
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children[0].actionId).toBe('occupation')
    expect(flow.children[0].sourceCard).toBe(CARD_ID)
    expect(flow.children[1]).toMatchObject({
      type: 'leaf',
      actionId: OCCUPY_ACTION_ID,
      sourceCard: CARD_ID,
      params: { spaceId: 'lessons', linkedWorkerId: '1' },
    })
    expect(lessonsSpace.takenBy).toEqual([])
  })

  it('occupies lessons only when the occupancy action executes', () => {
    const player = createPlayer('p1')
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [lessonsSpace])
    const action = getAdHocAction(OCCUPY_ACTION_ID)!

    expect(action).toBeDefined()
    expect(action.execute({
      state,
      player,
      space: lessonsSpace,
      params: { spaceId: 'lessons', linkedWorkerId: '1' },
    } as never)).toEqual({ type: 'ok' })
    expect(isSyntheticLinkedOccupancy(lessonsSpace.takenBy[0], {
      sourceCard: CARD_ID,
      linkedWorkerId: '1',
    })).toBe(true)
  })

  it('passes exactCost with 0 food when the player has no occupations played', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A009_SheepFarmer']
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [daySpace, lessonsSpace])
    const triggerSnapshot = createTriggerSnapshot(state)
    player.occupationPlayed.push('played-later')

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
      triggerSnapshot,
    } as unknown as CardListenerContext)
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[0].params.exactCost).toEqual({})
  })

  it('passes exactCost with 1 food when the player has played occupations', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = ['A009_SheepFarmer']
    player.occupationPlayed.push('A113_HeresyTeacher')
    const daySpace = createSpace('day-laborer', player.id)
    const lessonsSpace = createSpace('lessons')
    const state = createState([player], [daySpace, lessonsSpace])

    const result = executeCardListener(listener, {
      state, player, space: daySpace, actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[0].params.exactCost).toEqual({ food: 1 })
  })
})

describe('C023_JobContract session flow', () => {
  const setupPlay = (withOccupation: boolean) => {
    const session = new GameSession(23, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    state.players[0]!.minorHand = [CARD_ID]
    state.players[0]!.occupationPlayed = withOccupation ? ['A116_WoodCutter'] : []
    session.loadState(state)
    return session
  }

  const playCard = (session: GameSession) => {
    let response: SessionResponse = session.takeAction(0, 'major-improvement')
    for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
      if (response.interaction.stateId !== 'wait') break
      const option = response.interaction.request.options?.find((candidate) =>
        candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-'),
      )
      if (!option) break
      response = session.resolveChoice(0, option.value)
    }
    return response
  }

  const setupSession = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    state.players[0]!.minorPlayed.push(CARD_ID)
    state.players[0]!.occupationHand = ['A113_HeresyTeacher']
    state.players[0]!.resources.food = 5
    session.loadState(state)
    return session
  }

  it('C023 S1: with no occupations Job Contract can be played at no cost', () => {
    const response = playCard(setupPlay(false))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C023 S2: accepting after Day Laborer plays an occupation and occupies Lessons with a linked person', () => {
    const session = setupSession()
    let resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.actionSpaces.find((space) => space.id === 'lessons')?.takenBy).toEqual([])
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'choice') return
    const accept = resp.interaction.request.options.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    const lessons = resp.state.actionSpaces.find((space) => space.id === 'lessons')!
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A113_HeresyTeacher')
    expect(isSyntheticLinkedOccupancy(lessons.takenBy[0], {
      sourceCard: CARD_ID,
      linkedWorkerId: '1',
    })).toBe(true)
    expect(resp.state.log.length).toBeGreaterThan(0)
    expect(resp.scores).toHaveLength(2)
  })

  it('C023 S3: declining after Day Laborer leaves Lessons unoccupied and the occupation in hand', () => {
    const session = setupSession()
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).not.toContain('A113_HeresyTeacher')
    expect(resp.state.actionSpaces.find((space) => space.id === 'lessons')?.takenBy).toEqual([])
    expect(resp.state.log.length).toBeGreaterThan(0)
    expect(resp.scores).toHaveLength(2)
  })

  it('C023 S4: an occupied Lessons space prevents the Job Contract offer', () => {
    const session = setupSession()
    const state = session.getState().state
    const lessons = state.actionSpaces.find((space) => space.id === 'lessons')!
    lessons.takenBy = [{
      playerId: state.players[1]!.id,
      workerId: state.players[1]!.workers[0]!.id,
    }]
    session.loadState(state)

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .toBe('confirm-next-player')
    expect(response.state.players[0]!.occupationPlayed).not.toContain('A113_HeresyTeacher')
    expect(response.state.actionSpaces.find((space) => space.id === 'lessons')!.takenBy).toHaveLength(1)
  })

  it('C023 S5: the linked Lessons occupancy is removed at round end', () => {
    const session = setupSession()
    let response = session.takeAction(0, 'day-laborer')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    response.state.players.forEach((player) => markAllWorkersUsed(response.state, player))
    session.loadState(response.state)

    response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'lessons')!.takenBy).toEqual([])
  })

  it('C023 S6: a played occupation keeps Job Contract unavailable', () => {
    const response = playCard(setupPlay(true))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
  })
})
