import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { emptyResources } from '../../shared/contract/state-constants'
import type { GameState } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { createInitialState } from '../../shared/session/state-bootstrap'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { cardAllowedForPlayerCount } from '../../shared/cards/player-count-filter'
import { A154_Paymaster } from '../../shared/cards/A/A154_Paymaster'
import '../../shared/cards/C/C039_StudioBoat'

const BEAVER = 'E033_BeaverColony'
const PAYMASTER = 'A154_Paymaster'
const sessions: GameSession[] = []

const createSession = (playerCount: number, configure?: (state: GameState) => void, seed = 429014) => {
  const session = createWorkSession({ seed, options: { playerCount }, configure: state => {
    state.round = 2
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.resources = { ...emptyResources, food: 20 }
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.fields = []
      player.pastures = []
      player.stableTiles = []
      player.fenceSegments = []
    }
    const owner = state.players[0]!
    owner.minorPlayed = [BEAVER]
    owner.pastures = [{ id: 'beaver-pasture', tiles: [{ row: 0, col: 4 }], animalType: null, animalCount: 0 }]
    owner.stableTiles = [{ row: 0, col: 4 }]
    owner.fenceSegments = [
      { edge: 'H-0-4', type: 'fence' }, { edge: 'H-1-4', type: 'fence' },
      { edge: 'V-0-4', type: 'fence' }, { edge: 'V-0-5', type: 'fence' },
    ]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const bonus = (response: SessionResponse, cardId = BEAVER) => response.scores?.[0]?.categories
  .find(category => category.key === 'cardBonusVp')?.entries
  .find(entry => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

const snapshot = (session: GameSession) => session.withCtx(() => serializeSessionSnapshot(session.state, session))
const restore = (session: GameSession) => {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot(session)))))
  sessions.push(restored)
  const actual = restored.getState(), expected = session.getState()
  expect(actual.interaction).toEqual(expected.interaction)
  expect(actual.scores).toEqual(expected.scores)
  expect(JSON.parse(JSON.stringify(actual.state.players))).toEqual(JSON.parse(JSON.stringify(expected.state.players)))
  return restored
}

const confirmNext = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-next-player') throw new Error('Expected next player confirmation')
  return session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
}

const reject = (session: GameSession, action: () => SessionResponse) => {
  const before = snapshot(session)
  const response = assertRejectedUnchanged(session, action)
  expect(snapshot(session)).toEqual(before)
  return response
}

const createPaymaster = (configure?: (state: GameState) => void) => createSession(4, state => {
  const owner = state.players[0]!
  owner.minorPlayed = []
  owner.occupationPlayed = [PAYMASTER]
  owner.pastures = []
  owner.stableTiles = []
  owner.fenceSegments = []
  owner.resources.grain = 2
  for (const id of ['fishing', 'traveling-players']) state.actionSpaces.find(space => space.id === id)!.resources.food = 2
  configure?.(state)
}, 429013)

const reachPaymasterChoice = (session: GameSession, response: SessionResponse): SessionResponse => {
  for (let step = 0; step < 10; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected reaction or turn confirmation')
    const { request, playerIndex } = response.interaction
    if (request.kind === 'confirm-next-player' || request.kind === 'choice') return response
    if (request.kind === 'confirm-player-switch') response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
    else if (request.kind === 'select-trigger') {
      const source = request.options.find(option => option.sourceCard === PAYMASTER)
      expect(source).toBeDefined()
      response = session.resolveChoice(playerIndex, source!.value)
    } else throw new Error(`Unexpected Paymaster reaction: ${JSON.stringify(response.interaction)}`)
  }
  throw new Error('Paymaster did not reach its choice')
}

const acceptPaymaster = (session: GameSession, response: SessionResponse) => {
  const offered = reachPaymasterChoice(session, response)
  if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('Expected Paymaster offer')
  const option = offered.interaction.request.options.find(entry => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return reachPaymasterChoice(session, session.resolveChoice(offered.interaction.playerIndex, option!.value))
}

afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

describe('Scoring from Action Space resource sources', () => {
  it.each([5, 6])('rewards Beaver Colony for the actual %i-player Resource Market reed', playerCount => {
    const session = createSession(playerCount)
    const response = session.takeAction(0, 'resource-market-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, wood: 1, stone: 1, food: 20 })
    expect(bonus(response)).toBe(1)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { reed: 1, wood: 1, stone: 1 },
      from: { kind: 'actionSpace', spaceId: 'resource-market-56' },
      to: { kind: 'player', playerId: response.state.players[0]!.id },
    }))
  })

  it.each([5, 6])('rewards the %i-player Riverbank Forest collect-and-gain use once', playerCount => {
    let session = createSession(playerCount, state => {
      state.actionSpaces.find(space => space.id === 'riverbank-forest-56')!.resources.wood = 3
    })
    let response = session.takeAction(0, 'riverbank-forest-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, reed: 1, food: 20 })
    expect(bonus(response)).toBe(1)
    expect(response.state.events.filter(event => event.type === 'card.stateChanged' && event.cardId === BEAVER && event.key === 'bonusVp')).toHaveLength(1)
    session = restore(session)
    expect(bonus(session.getState())).toBe(1)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, food: 20 })
    expect(bonus(response)).toBe(0)
    response = session.takeAction(0, 'riverbank-forest-56')
    expect(bonus(response)).toBe(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.from.kind === 'actionSpace'
      && event.from.spaceId === 'riverbank-forest-56' && (event.resources.reed ?? 0) > 0)).toHaveLength(1)
  })

  it.each([{ players: 2, space: 'reed-bank', reed: 3, wood: 0, stone: 0 },
    { players: 4, space: 'resource-market-4', reed: 1, wood: 0, stone: 1 }])(
    'preserves the ordinary reed-space control: %j', ({ players, space, reed, wood, stone }) => {
      const session = createSession(players, state => {
        if (space === 'reed-bank') state.actionSpaces.find(entry => entry.id === space)!.resources.reed = 3
      })
      const response = session.takeAction(0, space)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ reed, wood, stone })
      expect(bonus(response)).toBe(1)
    },
  )

  it.each(['hand', 'opponent', 'unrelated'] as const)('does not reward Beaver Colony for %s collection', mode => {
    const session = createSession(2, state => {
      state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 3
      if (mode === 'hand') {
        state.players[0]!.minorPlayed = []
        state.players[0]!.minorHand = [BEAVER]
      }
    })
    if (mode === 'opponent') {
      confirmNext(session, session.takeAction(0, 'day-laborer'))
      const response = session.takeAction(1, 'reed-bank')
      expect(response.state.players[1]!.resources.reed).toBe(3)
      expect(bonus(response)).toBe(0)
    } else {
      const response = session.takeAction(0, mode === 'unrelated' ? 'day-laborer' : 'reed-bank')
      expect(response.ok, response.error).toBe(true)
      expect(bonus(response)).toBe(0)
    }
  })

  it('does not mistake Beating Rod onBuy reed for Meeting Place goods', () => {
    const session = createSession(2, state => { state.players[0]!.minorHand = ['B009_BeatingRod'] })
    let response = session.takeAction(0, 'meeting-place')
    for (let step = 0; step < 8; step++) {
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId !== 'wait') throw new Error('Expected card purchase')
      if (response.interaction.request.kind === 'confirm-next-player') break
      if (response.interaction.request.kind !== 'choice') throw new Error('Unexpected purchase interaction')
      const options = response.interaction.request.options
      const option = options.find(entry => entry.value.startsWith('action-improvement-'))
        ?? options.find(entry => entry.value === 'B009_BeatingRod')
        ?? options.find(entry => entry.effectPreview?.kind === 'resourceExchange' && entry.effectPreview.resourcesGained?.reed === 1)
      expect(option).toBeDefined()
      response = session.resolveChoice(0, option!.value)
    }
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(bonus(response)).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain('B009_BeatingRod')
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { reed: 1 }, from: expect.objectContaining({ kind: 'card', cardId: 'B009_BeatingRod' }),
    }))
  })

  it.each([BEAVER, 'A142_Cordmaker'])('retains both after-use reactions with %s selected first through restore and undo', firstCard => {
    let session = createSession(5, state => {
      state.players[0]!.occupationPlayed = ['A142_Cordmaker']
      state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 3
    })
    const finish = (response: SessionResponse) => {
      for (let step = 0; step < 10; step++) {
        expect(response.ok, response.error).toBe(true)
        if (response.interaction.stateId !== 'wait') throw new Error('Expected reaction or turn confirmation')
        const { request, playerIndex } = response.interaction
        if (request.kind === 'confirm-next-player') return response
        if (request.kind === 'select-trigger') {
          const option = request.options.find(entry => entry.sourceCard === firstCard)
            ?? request.options.find(entry => entry.sourceCard === BEAVER || entry.sourceCard === 'A142_Cordmaker')
          expect(option, JSON.stringify(response.interaction)).toBeDefined()
          response = session.resolveChoice(playerIndex, option!.value)
        } else if (request.kind === 'choice') {
          const grain = request.options.find(option => option.effectPreview?.kind === 'resourceExchange'
            && option.effectPreview.resourcesGained?.grain === 1)
          expect(grain, JSON.stringify(response.interaction)).toBeDefined()
          response = session.resolveChoice(playerIndex, grain!.value)
        } else throw new Error(`Unexpected reaction: ${JSON.stringify(response.interaction)}`)
      }
      throw new Error('Reaction chain did not finish')
    }
    let response = session.takeAction(0, 'reed-bank')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') throw new Error('Expected shared reaction window')
    expect(response.interaction.request.options.map(option => option.sourceCard)).toEqual(expect.arrayContaining([BEAVER, 'A142_Cordmaker']))
    session = restore(session)
    response = finish(session.getState())
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 3, grain: 1, food: 20 })
    expect(bonus(response)).toBe(1)
    const beforeRead = snapshot(session)
    session.getState()
    expect(snapshot(session)).toEqual(beforeRead)
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ reed: 0, grain: 0, food: 20 })
    expect(bonus(undone)).toBe(0)
    response = finish(session.takeAction(0, 'reed-bank'))
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 3, grain: 1, food: 20 })
    expect(bonus(response)).toBe(1)
  })
})

describe('Paymaster semantic food accumulation', () => {
  it.each(['fishing', 'traveling-players'])('gives one grain to the real four-player %s user for one point', spaceId => {
    const session = createPaymaster()
    confirmNext(session, session.takeAction(0, 'day-laborer'))
    const offered = reachPaymasterChoice(session, session.takeAction(1, spaceId))
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: PAYMASTER, request: { kind: 'choice' } })
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('Expected Paymaster offer')
    const option = offered.interaction.request.options.find(entry => entry.value !== '__skip__')!
    reject(session, () => session.resolveChoice(1, option.value))
    const response = acceptPaymaster(session, offered)
    expect(response.state.players.map(player => ({ food: player.resources.food, grain: player.resources.grain }))).toEqual([
      { food: 22, grain: 1 }, { food: 22, grain: 1 }, { food: 20, grain: 0 }, { food: 20, grain: 0 },
    ])
    expect(bonus(response, PAYMASTER)).toBe(1)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid', sourceCardId: PAYMASTER, actorPlayerId: response.state.players[0]!.id, resources: { grain: 1 },
    }))
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', sourceCardId: PAYMASTER, resources: { grain: 1 },
      to: { kind: 'player', playerId: response.state.players[1]!.id },
    }))
    expect(response.state.log.filter(entry => entry.key === 'log.cardEffectPay' && entry.params?.cardId === PAYMASTER))
      .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id, params: expect.objectContaining({ cost: { grain: 1 } }) })])
    reject(session, () => session.resolveChoice(0, option.value))
  })

  it.each(['decline', 'no-grain', 'hand', 'owner', 'fixed-food'] as const)('does not grant a Paymaster point for %s', mode => {
    const session = createPaymaster(state => {
      if (mode === 'no-grain') state.players[0]!.resources.grain = 0
      if (mode === 'hand') {
        state.players[0]!.occupationPlayed = []
        state.players[0]!.occupationHand = [PAYMASTER]
      }
    })
    let response: SessionResponse
    if (mode === 'owner') response = session.takeAction(0, 'fishing')
    else {
      confirmNext(session, session.takeAction(0, mode === 'fixed-food' ? 'forest' : 'day-laborer'))
      response = reachPaymasterChoice(session, session.takeAction(1, mode === 'fixed-food' ? 'day-laborer' : 'fishing'))
      if (mode === 'decline') {
        expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
        response = reachPaymasterChoice(session, session.resolveChoice(0, '__skip__'))
      }
    }
    expect(response.ok, response.error).toBe(true)
    expect(bonus(response, PAYMASTER)).toBe(0)
    expect(response.state.players[0]!.resources.grain).toBe(mode === 'no-grain' ? 0 : 2)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.sourceCardId === PAYMASTER)).toBe(false)
  })

  it('restores the offer and respects legal undo on both sides of the cross-player confirmation', () => {
    let session = createPaymaster()
    confirmNext(session, session.takeAction(0, 'day-laborer'))
    let response = session.takeAction(1, 'fishing')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-player-switch' } })
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(20)
    const offered = reachPaymasterChoice(session, session.takeAction(1, 'fishing'))
    session = restore(session)
    const pending = session.getState()
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') throw new Error('Expected Paymaster offer')
    const option = pending.interaction.request.options.find(entry => entry.value !== '__skip__')!
    response = session.resolveChoice(0, option.value)
    expect(bonus(response, PAYMASTER)).toBe(1)
    session = restore(session)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map(player => player.resources.grain)).toEqual([2, 0, 0, 0])
    expect(response.state.players[1]!.resources.food).toBe(22)
    expect(bonus(response, PAYMASTER)).toBe(0)
    response = acceptPaymaster(session, response)
    expect(response.state.players.map(player => player.resources.grain)).toEqual([1, 1, 0, 0])
    expect(bonus(response, PAYMASTER)).toBe(1)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === PAYMASTER)).toHaveLength(1)
    expect(offered.state.players[1]!.resources.food).toBe(22)
    expect(reject(session, () => session.undoAction()).error).toBe('cannot undo past boundary')
  })

  it.each([
    [1, true, false], [2, true, false], [3, true, false],
    [4, false, true], [5, false, true], [6, false, true],
  ] as const)('has no ordinary Studio Boat/Paymaster overlap at %i players', (playerCount, studioExpected, paymasterExpected) => {
    const state = createInitialState(429013, { playerCount })
    state.players[0]!.minorPlayed = ['C039_StudioBoat']
    const studioAvailable = createPlayerActionSpaces(state).some(space => space.id === 'C039_StudioBoat')
    const paymasterEligible = cardAllowedForPlayerCount(A154_Paymaster.players, playerCount)
    expect(studioAvailable).toBe(studioExpected)
    expect(paymasterEligible).toBe(paymasterExpected)
    expect(studioAvailable && paymasterEligible).toBe(false)
  })
})
