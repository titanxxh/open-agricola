import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { FarmyardSpaceState, GameState, PlayerState } from '../../shared/contract/types'
import { encodeReplayFrame, decodeReplayFrame } from '../game/replay-codec'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const CARD = 'A040_PottersYard'
const STOCK = 'B094_StockProtector'
const BENCH = 'B015_CarpentersBench'
const originalClayKeys = ['0-0', '0-1', '0-2', '1-1', '1-2', '2-1', '2-2']
const clayTokens = (keys: string[]): FarmyardSpaceState[] => keys.map(spaceKey => ({
  spaceKey, sourceCardId: CARD, kind: 'farmyard-goods-token',
  resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused',
}))
const remainingClayKeys = (player: PlayerState) => (player.farmyardSpaceStates ?? [])
  .filter(token => token.sourceCardId === CARD && token.kind === 'farmyard-goods-token')
  .map(token => token.spaceKey).sort()
const outerTwo = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
const innerOne = ['H-0-2', 'H-1-2', 'V-0-3']
const outerOne = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const innerTwo = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-3']

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

function choose(session: GameSession, response: SessionResponse, value: string): SessionResponse {
  const option = options(response).find(entry => entry.value === value)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  expect(option?.disabled).not.toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a waiting interaction')
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

function accept(session: GameSession, response: SessionResponse): SessionResponse {
  const option = options(response).find(entry => !entry.disabled && !entry.value.startsWith('__'))
  if (!option) throw new Error(`Expected an enabled offer: ${JSON.stringify(response.interaction)}`)
  return choose(session, response, option.value)
}

function finishBefore(session: GameSession, response: SessionResponse): SessionResponse {
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    const next = options(response).find(entry => entry.value === CARD)
      ?? options(response).find(entry => entry.value === STOCK)
    response = choose(session, response, next?.value ?? '__pass__')
  }
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
  return response
}

function skipExchange(session: GameSession, response: SessionResponse): SessionResponse {
  if (options(response).some(entry => entry.value === CARD)) response = choose(session, response, CARD)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'select-trigger'
    && options(response).some(entry => entry.value === '__skip__')) {
    response = choose(session, response, '__skip__')
  }
  return response
}

function setup(configure?: (state: GameState) => void) {
  const session = createWorkSession({ configure: state => {
    state.round = 4
    const player = state.players[0]!
    player.minorPlayed = [CARD, BENCH]
    player.occupationPlayed = [STOCK]
    player.resources.wood = 20
    player.resources.food = 20
    player.resources.clay = 0
    player.fields = [0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] })))
    // A040 was legally played before these actions; each listed space still owns its clay.
    player.farmyardSpaceStates = clayTokens(originalClayKeys)
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function restore(session: GameSession) {
  const snapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
  const encoded = encodeReplayFrame({ frame: snapshot, previousFrame: null, stepNo: 0, previousCheckpointStepNo: 0 })
  expect(decodeReplayFrame(null, encoded)).toEqual(snapshot)
  const restored = new GameSession(rehydrateState(snapshot))
  sessions.push(restored)
  expect(restored.state.events.slice(0, session.state.events.length)).toEqual(session.state.events)
  expect(restored.state.log).toEqual(expect.arrayContaining(session.state.log))
  return restored
}

function finish(session: GameSession, response: SessionResponse) {
  response = skipExchange(session, response)
  response = skipExchange(session, response)
  if (options(response).some(entry => entry.value === '__pass__' && !entry.disabled)) {
    response = choose(session, response, '__pass__')
  }
  return response
}

const farmFacts = (state: GameState) => {
  const player = state.players[0]!
  return {
    resources: player.resources, rooms: player.roomTiles, fields: player.fields,
    stables: player.stableTiles, pastures: player.pastures, fences: player.fenceSegments,
    clayTokens: player.farmyardSpaceStates?.filter(token => token.sourceCardId === CARD),
  }
}
const stableFacts = (input: unknown) => JSON.parse(JSON.stringify(input,
  (key, value: unknown) => key === 'occurrenceId' || key === 'paymentId' ? undefined : value))
const eventFacts = (state: GameState) => stableFacts(state.events)

// Generic commit-time geometry, with A040 as the first consumer. These real
// two-player sessions cover payments, nested actions, persisted waits and undo.
describe('A040 host action geometry', () => {
  it.each([
    { outer: 2, cardFirst: false, restoreAt: 'outer' },
    { outer: 1, cardFirst: false, restoreAt: 'inner' },
    { outer: 2, cardFirst: true, restoreAt: 'inner' },
    { outer: 1, cardFirst: true, restoreAt: 'outer' },
  ])('collects exactly three clay with outer=$outer, cardFirst=$cardFirst, restore=$restoreAt', ({ outer, cardFirst, restoreAt }) => {
    let session = setup(state => {
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = outer === 2 ? 3 : 4
      const opponent = state.players[1]!
      opponent.minorPlayed = [CARD]
      opponent.fields = state.players[0]!.fields.map(field => ({ ...field, stacks: [] }))
      opponent.farmyardSpaceStates = clayTokens(originalClayKeys)
    })
    const initial = JSON.parse(JSON.stringify(session.state))
    const replayStart = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session).frame))
    finishBefore(session, session.takeAction(0, 'fencing'))
    let response = session.commitSelectionChoice(0, { edges: outer === 2 ? outerTwo : outerOne })
    expect(response.ok, response.error).toBe(true)
    if (restoreAt === 'outer') {
      session = restore(session)
      response = session.getState()
    }
    if (cardFirst) response = skipExchange(session, response)
    response = choose(session, response, STOCK)
    response = accept(session, response)
    response = choose(session, response, 'forest')
    response = accept(session, response)
    finishBefore(session, response)
    response = session.commitSelectionChoice(0, { edges: outer === 2 ? innerOne : innerTwo })
    expect(response.ok, response.error).toBe(true)
    if (restoreAt === 'inner') {
      session = restore(session)
      response = session.getState()
    }
    response = finish(session, response)
    expect(response.state.players[0]!.resources.clay).toBe(3)
    expect(remainingClayKeys(response.state.players[0]!)).toEqual(['1-1', '1-2', '2-1', '2-2'])
    const mutations = response.state.events.filter(event => event.type === 'farm.fenceBuilt')
    expect(mutations.map(event => event.newlyUsedTiles.length)).toEqual([outer, 3 - outer])
    expect(mutations.flatMap(event => event.newlyUsedTiles)).toEqual([0, 1, 2].map(col => ({ playerId: response.state.players[0]!.id, row: 0, col })))
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[1]).toEqual(initial.players[1])
    for (const viewer of [response.state.players[0]!.id, response.state.players[1]!.id, null]) {
      expect(session.buildSyncPayload(response, viewer).state.events.filter(event => event.type === 'farm.fenceBuilt')).toEqual(mutations)
    }
    const completed = JSON.parse(JSON.stringify(response.state))
    const replayEnd = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session).frame))
    const encoded = encodeReplayFrame({ frame: replayEnd, previousFrame: replayStart, stepNo: 1, previousCheckpointStepNo: 0 })
    expect(encoded.payloadKind).toBe('delta')
    expect(decodeReplayFrame(replayStart, encoded)).toEqual(replayEnd)
    session = restore(session)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toEqual(initial.players[0])
    expect(response.state.events).toEqual(initial.events)
    expect(response.state.log).toEqual(initial.log)
    finishBefore(session, session.takeAction(0, 'fencing'))
    response = session.commitSelectionChoice(0, { edges: outer === 2 ? outerTwo : outerOne })
    if (cardFirst) response = skipExchange(session, response)
    response = choose(session, response, STOCK)
    response = accept(session, response)
    response = choose(session, response, 'forest')
    response = accept(session, response)
    finishBefore(session, response)
    response = session.commitSelectionChoice(0, { edges: outer === 2 ? innerOne : innerTwo })
    response = finish(session, response)
    expect(farmFacts(response.state)).toEqual(farmFacts(completed))
    expect(eventFacts(response.state)).toEqual(eventFacts(completed))
    expect(stableFacts(response.state.log)).toEqual(stableFacts(completed.log))
  })

  it.each(['plow', 'construct', 'stables'])('records one newly used tile for %s and can exchange its clay', action => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.occupationPlayed = []
      player.resources.reed = action === 'construct' ? 2 : 0
    })
    let response = session.takeAction(0, action === 'plow' ? 'farmland' : 'farm-expansion')
    const mode = options(response).find(option => option.labelKey === `actions.${action}.name`)
    if (mode) response = choose(session, response, mode.value)
    expect(response.ok, response.error).toBe(true)
    const tile = action === 'plow' ? { row: 0, col: 2 } : { row: 0, col: 0 }
    response = session.commitSelectionChoice(0, action === 'plow' ? { tile } : action === 'construct' ? { rooms: [tile] } : { stables: [tile] })
    expect(response.ok, response.error).toBe(true)
    if (options(response).some(option => option.value === CARD)) response = choose(session, response, CARD)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(remainingClayKeys(response.state.players[0]!)).toEqual(action === 'plow'
      ? ['0-0', '0-1', '1-1', '1-2', '2-1', '2-2']
      : ['0-1', '0-2', '1-1', '1-2', '2-1', '2-2'])
    const eventType = action === 'plow' ? 'farm.fieldPlowed' : action === 'construct' ? 'farm.roomBuilt' : 'farm.stableBuilt'
    const beforeExchange = JSON.parse(JSON.stringify(response.state))
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 22 })
    expect(response.state.events.find(event => event.type === eventType)).toMatchObject({ newlyUsedTiles: [{ playerId: response.state.players[0]!.id, ...tile }] })
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', sourceCardId: CARD, resources: { clay: 1 } }))
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(farmFacts(response.state)).toEqual(farmFacts(beforeExchange))
    expect(response.state.events).toEqual(beforeExchange.events)
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 22 })
  })

  it.each(['pasture-stable', 'special-stable', 'pasture-division', 'exhausted'])('does not collect clay for %s', mode => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.occupationPlayed = mode === 'special-stable' ? ['B085_FarmHand'] : []
      player.resources.reed = 0
      if (mode === 'pasture-stable' || mode === 'pasture-division') {
        player.pastures = [{ id: 'existing', tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: null, animalCount: 0 }]
        player.fenceSegments = outerTwo.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
        player.farmyardSpaceStates = clayTokens(['0-2', '1-1', '1-2', '2-1', '2-2'])
      }
      if (mode === 'special-stable') {
        player.fields.push(...[0, 1].map(row => ({ row, col: 2, stacks: [] })))
        player.farmyardSpaceStates = clayTokens(['0-0', '0-1', '1-1', '2-1', '2-2'])
      }
      if (mode === 'exhausted') player.farmyardSpaceStates = []
    })
    const remaining = remainingClayKeys(session.state.players[0]!)
    let response = session.takeAction(0, mode === 'pasture-division' ? 'fencing' : 'farm-expansion')
    response = session.commitSelectionChoice(0, mode === 'pasture-division' ? { edges: ['V-0-1'] }
      : mode === 'special-stable' ? { farmHand: { row: 0, col: 2 } } : { stables: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 20 })
    expect(remainingClayKeys(response.state.players[0]!)).toEqual(remaining)
    expect(options(response).some(option => option.value === CARD)).toBe(false)
    const mutations = response.state.events.filter(event => event.type === 'farm.stableBuilt' || event.type === 'farm.fenceBuilt')
    expect(mutations).toHaveLength(1)
    expect(mutations[0]?.newlyUsedTiles).toHaveLength(mode === 'exhausted' ? 1 : 0)
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.cardId === CARD)).toEqual([])
  })

  it('places clay only on authoritative unused spaces, excluding terrain and blocked cells', () => {
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      state.round = 4
      const player = state.players[0]!
      player.minorHand = [CARD]
      player.fields = [0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] })))
      player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
      player.farmyardSpaceStates = [{ spaceKey: '0-2', kind: 'blocked-farmyard-space', sourceCardId: '__test_blocker__', blocksPlacement: true }]
      Object.assign(player.resources, { wood: 20, reed: 1, food: 20 })
    } })
    sessions.push(session)
    let response = session.takeAction(0, 'major-improvement')
    if (options(response).some(option => option.value === CARD)) response = choose(session, response, CARD)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD)
    expect(response.state.players[0]!.farmyardSpaceStates?.filter(token => token.sourceCardId === CARD))
      .toEqual(clayTokens(['0-0', '1-1', '1-2', '2-1', '2-2']))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, reed: 0 })
  })

})
