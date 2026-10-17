import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach, afterAll } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A076_Cob'
import assert from 'node:assert/strict'
import { writeFileSync } from './_helpers/audit-evidence-fs'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit10Timing from './_helpers/audit/ae-negative-10-timing'

const CARD_ID = 'A076_Cob'
const FILLER = '__test_placeholder__'

const setup = ({ clay = 0, grain = 0, food = 0, played = true } = {}) => {
  const session = createWorkSession({ seed: 5076, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = { ...player.resources, clay, grain, food }
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playCob = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const roundStart = (session: GameSession): SessionResponse => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  let response = session.performRoundEnd()
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  return response
}

describe('A076 Cob parity', () => {
  it('A076 S1: Cob costs one food to play', () => {
    const response = playCob(setup({ food: 1, played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A076 S2: at work phase start Cob may exchange exactly one grain for two clay and one food', () => {
    const session = setup({ clay: 1, grain: 2, food: 20 })
    let response = roundStart(session)
    response = resolveNonSkipChoice(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 3, food: 21 })
  })

  it('A076 S3: the Cob exchange can be declined', () => {
    const session = setup({ clay: 1, grain: 1, food: 20 })
    let response = roundStart(session)
    response = resolveSkipChoice(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 1, food: 20 })
  })

  it('A076 S4: no clay excludes Cob from the work-start window', () => {
    const clay = 0
    const grain = 1
    const response = roundStart(setup({ clay, grain, food: 20 }))

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay, grain, food: 20 })
  })

  it('A076 S5: clay without payable grain leaves resources unchanged at work start', () => {
    const session = setup({ clay: 1, grain: 0, food: 20 })
    const state = session.getState().state
    state.players.forEach(player => markAllWorkersUsed(state, player))
    session.loadState(state)
    const response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('idle')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, grain: 0, food: 20 })
    expect(response.state.roundPhase).toBe('work')
  })
})

describe('ae-negative-10-timing', () => {
  const { COB, sessions, directory, evidence, record, setup, options, buy, deny, turn, complete, resources, exchange } = audit10Timing
  afterAll(() => writeFileSync(`${directory}/native-responses.json`, JSON.stringify(evidence, null, 2)))
  afterEach(context => sessions.splice(0).forEach(s => { record(`test-final:${context.task.name}`, s.getState()); s.dispose() }))
  it('A076 N1 one food purchase has no immediate exchange and zero food rejects', () => { deny(setup(COB, { resources: { food: 0, clay: 1, grain: 2 } }), COB); const r = buy(setup(COB, { resources: { food: 1, clay: 1, grain: 2 } }), COB); assert.deepEqual(resources(r), { clay: 1, grain: 2, food: 0 }) })
  it('A076 N2 natural work phase accepts exactly one grain and cannot repeat in same phase', () => { const s = setup(COB, { played: true, resources: { clay: 1, grain: 2 } }); const offer = complete(s); const acceptedValue = options(offer).find(o => o.value !== '__skip__' && !('disabled' in o && o.disabled))?.value; assert.ok(acceptedValue); let r = exchange(s, offer); assert.equal(r.state.round, 6); assert.deepEqual(resources(r), { clay: 3, grain: 1, food: 43 }); const beforeResources = resources(r); record('stale-cob', assertRejectedUnchanged(s, () => s.resolveChoice(0, acceptedValue))); r = turn(s, 0, 'reed-bank'); assert.deepEqual(resources(r), beforeResources) })
  it('A076 N3 decline preserves crops and clay and next phase offers once again', () => { const s = setup(COB, { played: true, resources: { clay: 1, grain: 2 } }); let r = exchange(s, complete(s), false); assert.deepEqual(resources(r), { clay: 1, grain: 2, food: 42 }); r = exchange(s, complete(s)); assert.equal(r.state.round, 7); assert.deepEqual(resources(r), { clay: 3, grain: 1, food: 45 }) })
  it('A076 N4 zero clay cannot exchange despite grain and opponent clay', () => { const s = setup(COB, { played: true, resources: { clay: 0, grain: 1 } }, state => { state.players[1]!.resources.clay = 3 }); const r = complete(s); assert.equal(r.interaction.stateId, 'idle'); assert.deepEqual(resources(r), { clay: 0, grain: 1, food: 42 }); record('no-clay', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pay-gain'))) })
  it('A076 N5 zero grain cannot exchange despite clay and opponent grain', () => { const s = setup(COB, { played: true, resources: { clay: 1, grain: 0 } }, state => { state.players[1]!.resources.grain = 3 }); const r = complete(s); assert.equal(r.interaction.stateId, 'idle'); assert.deepEqual(resources(r), { clay: 1, grain: 0, food: 42 }); record('no-grain', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pay-gain'))) })
  it('A076 N6 exact last grain exchange leaves no grain and never spends prerequisite clay', () => { const s = setup(COB, { played: true, resources: { clay: 1, grain: 1 } }); const r = exchange(s, complete(s)); assert.deepEqual(resources(r), { clay: 3, grain: 0, food: 43 }) })
  it('A076 N7 unplayed card never exchanges during a natural work phase', () => { const s = setup(COB, { resources: { clay: 1, grain: 1 } }); const r = complete(s); assert.equal(r.interaction.stateId, 'idle'); assert.deepEqual(resources(r), { clay: 1, grain: 1, food: 42 }) })
  it('A076 N8 gaining clay during work waits until the next natural work phase', () => { const s = setup(COB, { played: true, resources: { grain: 1 } }); let r = turn(s, 0, 'clay-pit'); assert.equal(r.state.players[0]!.resources.clay, 1); assert.equal(r.state.players[0]!.resources.grain, 1); turn(s, 1, 'forest'); turn(s, 0, 'day-laborer'); r = record('midwork-clay-confirm', confirmNext(s, turn(s, 1, 'reed-bank'))); r = exchange(s, r); assert.deepEqual(resources(r), { clay: 3, grain: 0, food: 43 }) })
  it('A076 N9 whole purchase undo restores food hand and exchange resources before retry', () => { const s = setup(COB, { resources: { clay: 1, grain: 1 } }); const before = undoRuleSnapshot(s.getState()); buy(s, COB); assertUndoRestored(before, record('undo-cob-buy', s.undoAction())); const r = buy(s, COB); assert.deepEqual(resources(r), { clay: 1, grain: 1, food: 39 }) })
  it('A076 N10 actual work phase exchange undo records exposed eligibility before any retry', () => { const s = setup(COB, { played: true, resources: { clay: 1, grain: 1 } }); const offer = complete(s); const before = undoRuleSnapshot(offer); let r = exchange(s, offer); assert.deepEqual(resources(r), { clay: 3, grain: 0, food: 43 }); const undone = record('undo-cob-phase', s.undoStep()); if (!undone.ok) { assert.equal(undone.error, 'no history to undo'); assert.deepEqual(resources(undone), { clay: 3, grain: 0, food: 43 }); return } assert.deepEqual(JSON.parse(undoRuleSnapshot(undone)), JSON.parse(before)); r = exchange(s, undone); assert.deepEqual(resources(r), { clay: 3, grain: 0, food: 43 }) })
})
