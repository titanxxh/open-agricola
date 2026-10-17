import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A005_ClayEmbankment'
import assert from 'node:assert/strict'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit09Immediate from './_helpers/audit/ae-negative-09-immediate'

const CARD_ID = 'A005_ClayEmbankment'

const setup = ({ clay, food }: { clay: number; food: number }) => {
  const session = new GameSession(5, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.clay = clay
  player.resources.food = food
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options?.find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A005 Clay Embankment parity', () => {
  it('A005 S1: four clay grants two clay after paying one food and passes', () => {
    const response = playMinor(setup({ clay: 4, food: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 6, food: 0 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A005 S2: one clay grants no clay after paying one food and passes', () => {
    const response = playMinor(setup({ clay: 1, food: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 0 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A005 S3: no food keeps Clay Embankment unavailable and preserves state', () => {
    const session = setup({ clay: 4, food: 0 })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 4, food: 0 })
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })
})

describe('ae-negative-09-immediate', () => {
  const { CLAY, sessions, setup, buy, passed, deny, goods, turn } = audit09Immediate
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A005 N1 zero food purchase is denied before legitimate same prompt retry', () => { const s = setup(CLAY, { food: 0, clay: 4 }); deny(s, CLAY); assert.equal(s.getState().state.players[0]!.resources.clay, 4) })
  it('A005 N2 zero through five initial clay use the printed floor threshold', () => {
    for (const [clay, expected] of [[0, 0], [1, 1], [2, 3], [3, 4], [4, 6], [5, 7]] satisfies Array<[number, number]>) {
      const r = buy(setup(CLAY, { food: 1, clay }), CLAY); assert.deepEqual(goods(r), { food: 0, wood: 0, clay: expected, grain: 0 }); passed(r, CLAY)
    }
  })
  it('A005 N3 large initial clay gives only the initial stock reward once', () => {
    const r = buy(setup(CLAY, { food: 1, clay: 10 }), CLAY); assert.deepEqual(goods(r), { food: 0, wood: 0, clay: 15, grain: 0 }); passed(r, CLAY)
    const gain = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === CLAY)
    assert.equal(gain.length, 1); const event = gain[0]; assert.ok(event?.type === 'resource.moved'); assert.deepEqual(event.resources, { clay: 5 })
  })
  it('A005 N4 opponent clay and passed recipient never change buyer reward', () => {
    const r = buy(setup(CLAY, { food: 1, clay: 1 }, state => { state.players[1]!.resources.clay = 6 }), CLAY)
    assert.deepEqual(goods(r), { food: 0, wood: 0, clay: 1, grain: 0 }); assert.deepEqual(goods(r, 1), { food: 40, wood: 0, clay: 6, grain: 0 }); passed(r, CLAY)
  })
  it('A005 N5 in hand clay gain and later clay collection do not replay onBuy', () => {
    const unplayed = setup(CLAY, {}, state => { state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 1 })
    assert.equal(turn(unplayed, 0, 'clay-pit').state.players[0]!.resources.clay, 1)
    const s = setup(CLAY, { food: 1, clay: 2 }, state => { state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 1 })
    passed(buy(s, CLAY), CLAY); turn(s, 1, 'forest'); const r = turn(s, 0, 'clay-pit')
    assert.equal(r.state.players[0]!.resources.clay, 4); assert.equal(r.state.players[1]!.resources.clay, 0)
    assert.equal(r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === CLAY).length, 1)
  })
  it('A005 N6 actual whole passing undo restores clay payment and both card hands', () => {
    const s = setup(CLAY, { food: 1, clay: 4 }); const before = undoRuleSnapshot(s.getState()); passed(buy(s, CLAY), CLAY)
    assertUndoRestored(before, s.undoAction()); const r = buy(s, CLAY); assert.deepEqual(goods(r), { food: 0, wood: 0, clay: 6, grain: 0 }); passed(r, CLAY)
  })
})
