import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D108_StoneCarver'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

const CARD_ID = 'D108_StoneCarver'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, stone = 1, food = 4, round = 4,
}: {
  played?: boolean
  stone?: number
  food?: number
  round?: number
} = {}) => {
  const session = new GameSession(6108, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setActiveWorkerCount(player, 2)
    markAllWorkersUsed(state, player)
  })

  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources = { ...player.resources, stone, food }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  const state = session.getState().state
  state.round = 5
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  })
  session.loadState(state)
  let response = session.takeAction(0, 'lessons')
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const enterFeed = (session: GameSession) => {
  const response = session.performRoundEnd()
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    playerIndex: 0,
    request: { kind: 'feed' },
  })
  return response
}

const resolveFeed = (session: GameSession, count: number) => session.resolveChoice(0, 'confirm', {
  selections: count === 0 ? [] : [{
    sourceId: CARD_ID, exchangeIndex: 0, count, sourceName: 'Stone Carver',
  }],
})

const stoneCarverConversions = (response: SessionResponse) => response.state.events.filter((event) =>
  event.type === 'harvest.feedConverted' && event.source === CARD_ID,
)

describe('D108 Stone Carver parity', () => {
  it('D108 S1: Stone Carver can be played as the first occupation through Lessons', () => {
    const response = playOccupation(setup({ played: false, stone: 0, food: 0, round: 5 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D108 S2: during harvest exactly one stone can become three food before feeding', () => {
    const session = setup({ stone: 1, food: 1 })
    const offered = enterFeed(session)
    expect(offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'feed'
      ? offered.interaction.request.maxTradeTimesBySourceId?.[CARD_ID]
      : undefined).toBe(1)

    const response = resolveFeed(session, 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, food: 0, begging: 0 })
    expect(stoneCarverConversions(response)).toEqual([expect.objectContaining({
      cost: { stone: 1 }, food: { food: 3 },
    })])
  })

  it('D108 S3: the harvest stone exchange can be declined', () => {
    const session = setup({ stone: 1, food: 4 })
    enterFeed(session)

    const response = resolveFeed(session, 0)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, food: 0, begging: 0 })
    expect(stoneCarverConversions(response)).toHaveLength(0)
  })

  it('D108 S4: Stone Carver is limited to one exchange in a harvest', () => {
    const session = setup({ stone: 2, food: 1 })
    enterFeed(session)
    const before = session.getState()

    const rejected = resolveFeed(session, 2)
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)

    const response = resolveFeed(session, 1)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, food: 0, begging: 0 })
    expect(stoneCarverConversions(response)).toHaveLength(1)
  })

  it('D108 S5: without stone no Stone Carver conversion can be submitted', () => {
    const session = setup({ stone: 0, food: 4 })
    const offered = enterFeed(session)
    expect(offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'feed'
      ? offered.interaction.request.feedQueue.some((entry) => entry.sourceId === CARD_ID)
      : false).toBe(false)

    const before = session.getState()
    const rejected = resolveFeed(session, 1)
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
  })

  it('D108 S6: Stone Carver is not available outside the harvest', () => {
    const session = setup({ stone: 1, food: 4, round: 5 })
    const state = session.getState().state
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => setWorkersAtHome(state, player, 2))
    session.loadState(state)

    const response = session.takeAction(0, 'farmland')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.anytimeActions.some((action) => action.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, food: 4 })
    expect(stoneCarverConversions(response)).toHaveLength(0)
  })
})

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, feedMenu, harvestTrade, workTrade } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D108 N1 harvest exchanges exactly one stone for three food and rejects two before legal retry', () => { const s = make('D108_StoneCarver', st => { st.players[0]!.resources.stone = 2 }, true, 4), p = feedMenu(s), rejected = assertRejectedUnchanged(s, () => harvestTrade(s, 'D108_StoneCarver', 2)), r = finish(s, harvestTrade(s, 'D108_StoneCarver', 1), false); assert.equal(r.state.players[0]!.resources.stone, 1); assert.equal(r.state.players[0]!.resources.food, 99); save('D108-N1', { p, rejected, r }) })
  it('D108 N2 harvest decline and work phase keep stone while zero supply cannot convert', () => { const s = make('D108_StoneCarver', st => { st.players[0]!.resources.stone = 2 }, true, 4), p = feedMenu(s), r = finish(s, ok(s.resolveChoice(0, 'confirm', { selections: [] })), false); assert.equal(r.state.players[0]!.resources.stone, 2); assert.equal(r.state.players[0]!.resources.food, 96); const w = make('D108_StoneCarver', st => { st.players[0]!.resources.stone = 2 }), wr = finish(w, ok(w.takeAction(0, 'grain-seeds')), false); assert.equal(wr.state.players[0]!.resources.stone, 2); assert.equal(wr.state.players[0]!.resources.food, 100); const c = make('D108_StoneCarver', st => { st.players[0]!.resources.food = 0 }, true, 4), cp = feedMenu(c), rejected = assertRejectedUnchanged(c, () => harvestTrade(c, 'D108_StoneCarver', 1)), cr = finish(c, ok(c.resolveChoice(0, 'confirm', { selections: [] })), false); assert.equal(cr.state.players[0]!.resources.food, 0); save('D108-N2', { p, r, wr, cp, rejected, cr }) })
  it('D108 N3 actual work exchange excludes Stone Carver while Fireplace vegetable conversion preserves both stones', () => { const s = make('D108_StoneCarver', st => { Object.assign(st.players[0]!.resources, { stone: 2, vegetable: 1 }); st.players[0]!.improvements = ['Major_Fireplace1'] }), a = workTrade(s, 'D108_StoneCarver', 'vegetable'); assert.equal(a.r.state.players[0]!.resources.stone, 2); save('D108-N3', a) })
})
