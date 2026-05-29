import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import type { ActionChoiceOption, GameState, PlayerState, ActionSpace, Resource } from '../../shared/contract/types'

import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/C/C42_RavenousHunger'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C42_RavenousHunger'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
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
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
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

const resources = (values: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  ...values,
})

const setupSession = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources = resources()

  for (const space of state.actionSpaces) {
    space.takenBy = []
    space.roundAvailable = Math.min(space.roundAvailable, 14)
  }

  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = 3
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')!
  fishing.resources.food = 2

  session.loadState(state)
  return session
}

const waitOptions = (resp: ReturnType<GameSession['getState']>): ActionChoiceOption[] => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return []
  expect(resp.interaction.request.kind).toBe('choice')
  return resp.interaction.options ?? []
}

const acceptOptional = (session: GameSession, resp: ReturnType<GameSession['getState']>) => {
  const accept = waitOptions(resp).find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(0, accept!.value)
}

describe('C42_RavenousHunger', () => {
  it('after vegetable-seeds: offers place-farmer with flag/unflag sequence and accumulation constraints', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    state.actionSpaces = [createSpace('forest', { wood: 3 })]

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('vegetable-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(2)
    expect(children[0]).toMatchObject({ actionId: 'special-effect', params: { kind: 'set-flag', flag: true } })
    expect(children[1].actionId).toBe('place-farmer')
    expect(children[1].actionContext).toMatchObject({ constraints: expect.arrayContaining(['forest']) })
  })

  it('after vegetable-seeds: constraints include only legal accumulation spaces', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player, createPlayer('p2'))
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = [{ playerId: 'p2', workerId: '1' }]
    state.actionSpaces = [forest, createSpace('fishing', { food: 1 }), createSpace('farmland')]

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('vegetable-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[1].actionContext).toEqual({ constraints: ['fishing'] })
  })

  it('does not trigger on non-vegetable-seeds spaces', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('grain-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not trigger when no workers available', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    markAllWorkersUsed(state, player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('vegetable-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('after collect while flagged: gains 1 extra of accumulating resource', () => {
    const listener = findListener('C42-ravenous-hunger-after-collect')
    expect(listener).toBeDefined()

    const player = createPlayer()
    setCardFlag(player, CARD_ID, true)
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'collect', phase: 'after',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0]).toMatchObject({ actionId: 'gain', params: { wood: 1 } })
    expect(children[1]).toMatchObject({ actionId: 'special-effect', params: { kind: 'set-flag', flag: false } })
  })

  it('after collect when not flagged: no bonus', () => {
    const listener = findListener('C42-ravenous-hunger-after-collect')
    expect(listener).toBeDefined()

    const player = createPlayer()
    // Not flagged
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'collect', phase: 'after',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('after vegetable-seeds offers optional second placement restricted to accumulation spaces', () => {
    const session = setupSession()

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    expect(waitOptions(resp).map((option) => option.value)).toContain('__skip__')

    resp = acceptOptional(session, resp)
    const optionValues = waitOptions(resp).map((option) => option.value)
    const state = session.getState().state

    expect(optionValues).toContain('forest')
    expect(optionValues).toContain('fishing')
    expect(optionValues).not.toContain('farmland')
    expect(optionValues).not.toContain('day-laborer')
    expect(optionValues.every((spaceId) => {
      const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
      return !!space && Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0)
    })).toBe(true)
  })

  it('after vegetable-seeds does not offer a second placement when no accumulation space is legal', () => {
    const session = setupSession()
    const state = session.getState().state
    for (const space of state.actionSpaces) {
      if (Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0)) {
        space.takenBy = [{ playerId: 'p2', workerId: '1' }]
      }
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'vegetable-seeds')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).not.toBe('choice')
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('second placement on an accumulation space collects and gains one extra accumulating resource', () => {
    const session = setupSession()

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    resp = acceptOptional(session, resp)
    resp = session.resolveChoice(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('skip leaves no flag and grants no accumulation bonus', () => {
    const session = setupSession()

    const resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    const skipped = session.resolveChoice(0, '__skip__')

    expect(skipped.ok).toBe(true)
    expect(skipped.state.players[0]!.resources.vegetable).toBe(1)
    expect(skipped.state.players[0]!.resources.wood).toBe(0)
    expect(isCardFlagged(skipped.state.players[0]!, CARD_ID)).toBe(false)
  })
})
