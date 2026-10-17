import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome, workersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/A/A054_Credit'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Flow from './_helpers/audit/ae-negative-08-flow'

const CARD_ID = 'A054_Credit'

const purchaseSession = ({ occupations, food }: { occupations: number; food: number }) => {
  const session = new GameSession(54, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `occupation-${index}`)
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

const roundEndSession = ({ round, food }: { round: number; food: number }) => {
  const session = new GameSession(54, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players[0]!.minorPlayed = [CARD_ID]
  state.players[0]!.resources.food = food
  state.players[0]!.resources.begging = 0
  state.players[1]!.resources.food = 8
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session
}

describe('A054 Credit parity', () => {
  it('A054 S1: at most three occupations allows Credit and grants five food', () => {
    const response = playMinor(purchaseSession({ occupations: 3, food: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(5)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A054 S2: four occupations keeps Credit unavailable', () => {
    const session = purchaseSession({ occupations: 4, food: 0 })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A054 S3: a non-harvest round end can repay one food', () => {
    const session = roundEndSession({ round: 1, food: 1 })
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.sourceCard).toBe(CARD_ID)
    const payment = response.interaction.request.options?.find((option) =>
      option.value !== '__skip__' && option.value !== 'skip'
    )
    expect(payment).toBeDefined()

    response = session.resolveChoice(0, payment!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
  })

  it('A054 S4: a non-harvest round end without food takes one begging marker', () => {
    const session = roundEndSession({ round: 1, food: 0 })
    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 1 })
  })

  it('A054 S5: a harvest round end does not repay Credit', () => {
    const session = roundEndSession({ round: 4, food: 8 })

    const response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, begging: 0 })
  })
})

describe('ae-negative-08-flow', () => {
  const { CREDIT, OCC, sessions, setup, opts, buy, deny, resource, endWork, repay, finishHarvest } = audit08Flow
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A054 N1 occupation four rejects forged Credit before zero and three occupation controls', () => {
    deny(setup({ played: false, occupations: OCC, resources: { food: 0 } }), CREDIT)
    for (const occupations of [[], OCC.slice(0, 3)]) { const r = buy(setup({ played: false, occupations, resources: { food: 0 } }), CREDIT); resource(r, 'food', 5); assert.ok(r.state.players[0]!.minorPlayed.includes(CREDIT)) }
  })
  it('A054 N2 actual onBuy gives five food once and undo restores card before replay', () => {
    const s = setup({ played: false, occupations: OCC.slice(0, 3), resources: { food: 0 } }); const before = undoRuleSnapshot(s.getState()); const r = buy(s, CREDIT); resource(r, 'food', 5); assertRejectedUnchanged(s, () => s.resolveChoice(0, CREDIT)); assertUndoRestored(before, s.undoAction()); resource(buy(s, CREDIT), 'food', 5)
  })
  it('A054 N3 real nonharvest end requires one repayment and rejects skip actor and replay', () => {
    const s = setup({ round: 1, resources: { food: 1 } }); const r = endWork(s); assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === CREDIT); assert.equal(opts(r).some(o => o.value === '__skip__' && !('disabled' in o && o.disabled)), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, '__skip__')); const old = opts(r)[0]; assert.ok(old); assertRejectedUnchanged(s, () => s.resolveChoice(1, old.value)); const done = repay(s, r); assert.equal(done.state.round, 2); resource(done, 'food', 0); resource(done, 'begging', 0); resource(done, 'food', 40, 1); assertRejectedUnchanged(s, () => s.resolveChoice(0, old.value))
  })
  it('A054 N4 zero food owes one begging while no-card and foreign players owe nothing', () => {
    for (const noCard of [false, true]) { const s = setup({ round: 1, noCard, resources: { food: 0 } }); const r = endWork(s); assert.equal(r.state.round, 2); resource(r, 'food', 0); resource(r, 'begging', noCard ? 0 : 1); resource(r, 'food', 40, 1) }
  })
  it('A054 N5 actual harvest four skips Credit compared with nonharvest three', () => {
    for (const round of [3, 4]) { const s = setup({ round, resources: { food: 8 } }); const r = round === 4 ? finishHarvest(s, endWork(s)) : repay(s, endWork(s)); assert.equal(r.state.round, round + 1); resource(r, 'food', round === 4 ? 4 : 7); resource(r, 'begging', 0) }
  })
  it('A054 N6 two actual nonharvest ends charge once each and return available workers', () => {
    const s = setup({ round: 1, resources: { food: 2 } }); for (const round of [2, 3]) { const r = repay(s, endWork(s)); assert.equal(r.state.round, round); resource(r, 'food', 3 - round); resource(r, 'begging', 0); resource(r, 'food', 40, 1); assert.equal(workersAtHome(r.state, r.state.players[0]!).length, 2) }
  })
})
