import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { setFencesForTest, setPalisadesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A034_Loppers'
import '../../shared/cards/E/E074_AshTrees'

const CARD_ID = 'A034_Loppers'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const passTriggerSelectIfPresent = (
  session: GameSession,
  resp: SessionResponse,
): SessionResponse => {
  if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'select-trigger') return resp
  return session.resolveChoice(resp.interaction.playerIndex, '__pass__')
}

const widePastureEdges = [
  'H-0-1',
  'H-0-2',
  'H-0-3',
  'H-0-4',
  'H-3-1',
  'H-3-2',
  'H-3-3',
  'H-3-4',
  'V-0-1',
  'V-1-1',
  'V-2-1',
  'V-0-5',
  'V-1-5',
  'V-2-5',
]

const fenceBuilt = (
  newFenceEdges: string[],
): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: newFenceEdges.map((edge) => ({ edge, type: 'fence' })),
  newFenceEdges,
})

const createPlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 5, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: {},
  }) as unknown as PlayerState

const setupFencingSession = (options: {
  wood: number
  consumedFences?: number
  existingFenceEdges?: string[]
  e74HeldFences?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: options.wood,
    food: 0,
  }
  player.minorPlayed.push(CARD_ID)
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  if (options.existingFenceEdges) {
    player.fenceSegments = options.existingFenceEdges.map((edge) => ({
      edge,
      type: 'fence',
      source: { kind: 'own', ownerPlayerId: player.id },
    }))
  }
  if (options.consumedFences !== undefined) {
    player.supplyTokensConsumed = { fence: options.consumedFences }
  }
  if (options.e74HeldFences) {
    player.minorPlayed.push('E074_AshTrees')
    player.cardStates = {
      ...player.cardStates,
      E074_AshTrees: { counters: { fences: options.e74HeldFences } },
    }
  }

  session.loadState(state)
  return session
}

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('A34 Loppers — supply fence payment', () => {
  it('declares a wood + fence payment even when player has many palisades', () => {
    const player = createPlayer()
    setPalisadesForTest(player, 15) // well above maxFences
    setFencesForTest(player, 0)
    const listener = findListener('A34-loppers-after-fencing')!
    const actionEvents = [fenceBuilt(['H-0-0'])]

    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      actionId: 'fence',
      phase: 'after',
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('seq')
    expect(result?.flow?.type === 'seq' ? result.flow.children[0] : undefined).toMatchObject({
      type: 'leaf',
      actionId: 'pay',
      params: { wood: 1, fence: 1 },
    })
  })

  it('does not use built fence count as the supply availability gate', () => {
    const player = createPlayer()
    setFencesForTest(player, 15)
    const listener = findListener('A34-loppers-after-fencing')!
    const actionEvents = [fenceBuilt(['H-0-0'])]

    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      actionId: 'fence',
      phase: 'after',
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
  })

  it('rejects direct fencing cancel without offering the exchange', () => {
    const session = setupFencingSession({ wood: 5 })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, { cancel: true })

    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('action cancel is not allowed')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected fencing prompt')
    expect(resp.interaction.request.kind).toBe('farm-select')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBeUndefined()
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(resp.state.events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'farm.fenceBuilt',
        }),
        expect.objectContaining({
          type: 'resource.paid',
          paymentFor: 'cardEffect',
        }),
      ]),
    )
  })

  it('does not offer the exchange when the fence event has no ordinary fence edges', () => {
    const player = createPlayer()
    const listener = findListener('A34-loppers-after-fencing')!
    const actionEvents = [fenceBuilt([])]

    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok', extraData: { newFenceEdges: ['H-0-0'] } },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('after fencing, accepting pays wood + reserve fence for food and bonus VP', () => {
    const session = setupFencingSession({ wood: 5 })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).toBe('ui.confirmNextPlayer')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBe(1)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(resp.state.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource.paid',
          paymentFor: 'fencing',
          resources: { wood: 4 },
        }),
        expect.objectContaining({
          type: 'resource.paid',
          paymentFor: 'cardEffect',
          resources: { wood: 1, fence: 1 },
        }),
      ]),
    )
  })

  it('pays fencing before after-fencing effects so exact mandatory wood cannot be spent by A34', () => {
    const session = setupFencingSession({ wood: 4 })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    resp = passTriggerSelectIfPresent(session, resp)
    expect(resp.interaction.promptKey).toBe('ui.confirmNextPlayer')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBeUndefined()
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('does not offer the exchange when E74 holds all unbuilt fence tokens', () => {
    const existing = [...widePastureEdges.slice(0, 10), 'H-1-2']
    const build = widePastureEdges.slice(10)
    const session = setupFencingSession({
      wood: 1,
      existingFenceEdges: existing,
      e74HeldFences: 4,
    })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'E074_AshTrees')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const useAll = resp.interaction.request.options?.find(
      (option) => option.labelParams?.count === 4,
    )
    expect(useAll).toBeDefined()

    resp = session.resolveChoice(0, useAll!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: build,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'E074_AshTrees')
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'select-trigger') {
      const a34 = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(a34?.disabled ?? true).toBe(true)
      resp = passTriggerSelectIfPresent(session, resp)
    }
    expect(resp.interaction.promptKey).toBe('ui.confirmNextPlayer')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(15)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBeUndefined()
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('does not spend A34 when consumed fence supply removes the remaining reserve', () => {
    const existing = widePastureEdges.slice(0, 10)
    const build = widePastureEdges.slice(10)
    const session = setupFencingSession({
      wood: 1,
      existingFenceEdges: existing,
      consumedFences: 1,
      e74HeldFences: 4,
    })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'E074_AshTrees')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const useAll = resp.interaction.request.options?.find(
      (option) => option.labelParams?.count === 4,
    )
    expect(useAll).toBeDefined()

    resp = session.resolveChoice(0, useAll!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: build,
      palisadeEdges: [],
      extraWood: 0,
    })
    resp = resolveTriggerIfPresent(session, resp, 'E074_AshTrees')
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'select-trigger') {
      const a34 = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(a34?.disabled ?? true).toBe(true)
      resp = passTriggerSelectIfPresent(session, resp)
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(14)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBe(1)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })
})

describe('A034 Loppers parity', () => {
  const CARD_ID = 'A034_Loppers'

  const FILLER = '__test_placeholder__'

  const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

  const edgesForTile = (row: number, col: number) => [
    `H-${row}-${col}`,
    `H-${row + 1}-${col}`,
    `V-${row}-${col}`,
    `V-${row}-${col + 1}`,
  ]

  const setup = ({ played = true, occupations = 2, wood = 0 } = {}) => {
    const session = new GameSession(6034, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const player = state.players[0]!
    player.minorHand = played ? [FILLER] : [CARD_ID]
    player.minorPlayed = played ? [CARD_ID] : []
    player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    player.resources = {
      ...player.resources, wood, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(0, improvement.value)
    }
    return response
  }

  const playCard = (session: GameSession) => {
    const response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    return session.resolveChoice(0, card!.value)
  }

  const fence = (session: GameSession) => {
    let response = session.takeAction(0, 'fencing')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    response = session.commitSelectionChoice(0, { edges: edgesForTile(1, 1), extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    return resolveTriggerIfPresent(session, response, CARD_ID)
  }

  const resolveLoppers = (session: GameSession, response: SessionResponse, accept: boolean) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => accept
      ? candidate.value !== '__skip__'
      : candidate.value === '__skip__')
    expect(option).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, option!.value)
  }

  it('A034 S1: two occupations and one wood allow playing Loppers', () => {
    const response = playCard(setup({ played: false, wood: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A034 S2: one occupation keeps Loppers unavailable', () => {
    const response = enterMinor(setup({ played: false, occupations: 1, wood: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('A034 S4: after fencing declining preserves the spare wood and supply fence', () => {
    const session = setup({ wood: 5 })
    const response = resolveLoppers(session, fence(session), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(response.state.players[0]!.supplyTokensConsumed?.fence).toBeUndefined()
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})
