import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { B015_CarpentersBench_impl } from '../../shared/cards/B/B015_CarpentersBench'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionFlow } from '../../shared/contract/types'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B015_CarpentersBench'
import '../../shared/cards/E/E016_BriarHedge'

const CARD_ID = 'B015_CarpentersBench'
const LISTENER = B015_CarpentersBench_impl.listeners[0]!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { wood: 3 },
  from: { kind: 'actionSpace', spaceId: 'forest' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const directContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  actionEvents = transactionEvents,
): CardListenerContext => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  return {
    state,
    player,
    space: { id: 'forest', gainPerRound: { wood: 1 } },
    actionId: 'collect',
    phase: 'immediatelyAfter',
    transactionEvents,
    actionEvents,
    result: { type: 'ok', resourcesGained: { wood: 3 } },
  } as unknown as CardListenerContext
}

const fenceLeaf = (flow: ActionFlow | undefined) => {
  if (flow?.type !== 'seq') return undefined
  return flow.children.find((child) => child.type === 'leaf' && child.actionId === 'fence')
}

describe('B015_CarpentersBench session', () => {
  it('opens fence option with benchWood from action-space wood events', () => {
    const ctx = directContext([moved()])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(LISTENER, ctx)
    const leaf = fenceLeaf(result?.flow)

    expect(leaf).toMatchObject({
      actionId: 'fence',
      actionContext: {
        trueAction: false,
        fencePolicy: {
          allowedSegmentTypes: ['fence'],
          segmentBounds: { total: { min: 1 } },
          newPastureBounds: { count: { min: 1, max: 1 } },
          costPolicy: { fence: { wood: 1 } },
          paymentBudget: { wood: 3 },
          cancelPolicy: 'forbidCancel',
        },
      },
    })
    const policy = leaf?.actionContext?.fencePolicy as {
      segmentBounds?: { total?: { max?: number } }
    }
    expect(policy.segmentBounds?.total?.max).toBeUndefined()
  })

  it('does not trigger for supply/cardEffect wood even when result reports wood', () => {
    const ctx = directContext([moved({
      from: { kind: 'supply' },
      reason: 'cardEffect',
    })])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not trigger without a current wood event', () => {
    const ctx = directContext([])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction wood when actionEvents has no current wood', () => {
    const ctx = directContext([moved()], [])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not apply a second B15 wood discount when E16 also discounts border fences', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID, 'E016_BriarHedge')
    player.resources.wood = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'forest')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected B15 optional prompt')
    const accept = resp.interaction.request.options?.find((option) => option.sourceCard === CARD_ID && option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected B15 fence prompt')
    expect(resp.interaction.promptParams).toEqual({
      hintKey: 'ui.interactionCarpentersBenchFenceHint',
    })

    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'],
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.wood).toBe(1)
    expect(after.pastures).toHaveLength(1)
    expect(after.fenceSegments).toHaveLength(6)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        actorPlayerId: player.id,
        sourceCardId: CARD_ID,
        resources: { wood: 2 },
      }),
    ]))
  })

  it('rejects a B15 pasture whose non-border fence cost exceeds the taken wood budget', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID, 'E016_BriarHedge')
    player.resources.wood = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'forest')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected B15 optional prompt')
    const accept = resp.interaction.request.options?.find((option) => option.sourceCard === CARD_ID && option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected B15 fence prompt')

    const invalid = session.commitSelectionChoice(0, {
      edges: [
        'H-0-2',
        'H-0-3',
        'H-0-4',
        'H-2-2',
        'H-2-3',
        'H-2-4',
        'V-0-2',
        'V-1-2',
        'V-0-5',
        'V-1-5',
      ],
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(invalid.ok).toBe(false)
    expect(invalid.error).toBe('NOT_ENOUGH_WOOD')
    expect(invalid.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(invalid.interaction.promptKey).toBe('ui.interactionFenceSelect')
  })
})

describe('B015 Carpenter\'s Bench parity', () => {
  const CARD_ID = 'B015_CarpentersBench'

  const FILLER = '__test_placeholder__'

  const ONE_CELL = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']

  const TWO_CELL_OUTER = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']

  const THIRD_CELL = ['H-0-2', 'H-1-2', 'V-0-3']

  const setup = ({ played = true, wood = 0, forestWood = 3 } = {}) => {
    const session = new GameSession(6015, undefined, { playerCount: 2 })
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
      player.minorPlayed = []
      player.occupationPlayed = []
      player.pastures = []
      player.fenceSegments = []
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.resources.wood = wood
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forestWood
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterBenchFence = (session: GameSession) => {
    let response = session.takeAction(0, 'forest')
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) =>
      option.value !== '__skip__' && (option.sourceCard === CARD_ID || option.value === CARD_ID))
      ?? options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }

  const takeForestToBenchChoice = (session: GameSession) =>
    resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), CARD_ID)

  it('B015 S2: three wood taken from Forest can build exactly one new pasture with one free fence', () => {
    const session = setup()
    const fence = enterBenchFence(session)
    expect(fence.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })

    const response = session.commitSelectionChoice(0, {
      edges: ONE_CELL, palisadeEdges: [], extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
  })

  it('B015 S3: the Carpenter\'s Bench pasture may be declined and keeps all taken wood', () => {
    const session = setup()
    let response = takeForestToBenchChoice(session)
    expect(options(response).some((option) => option.value === '__skip__')).toBe(true)

    response = session.resolveChoice(0, '__skip__')

    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

  it('B015 S5: subdividing an existing pasture does not qualify as building a new pasture', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.fenceSegments = TWO_CELL_OUTER.map((edge) => ({ edge, type: 'fence' as const }))
    owner.pastures = [{
      id: 'existing', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      stables: 0, animalType: null, animalCount: 0,
    }]
    session.loadState(state)
    enterBenchFence(session)

    const invalid = session.commitSelectionChoice(0, {
      edges: ['V-0-1'], palisadeEdges: [], extraWood: 0,
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.state.players[0]!.fenceSegments).toHaveLength(6)

    const response = session.commitSelectionChoice(0, {
      edges: THIRD_CELL, palisadeEdges: [], extraWood: 0,
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures).toHaveLength(2)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(9)
  })
})
