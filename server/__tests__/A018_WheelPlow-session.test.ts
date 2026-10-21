import { completePlowUse } from './_helpers/plow-use'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setupSowingSession, sowOptions } from './_helpers/batch07-sowing'

import '../../shared/cards/A/A018_WheelPlow'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit04Plows from './_helpers/audit/ae-negative-04-plows'

const CARD_ID = 'A018_WheelPlow'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

const setup = ({ played = true } = {}) => {
  const session = new GameSession(7018, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    player.fields = []
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationPlayed = OCCUPATIONS
  owner.resources.wood = 2
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === CARD_ID)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

describe('A018 Wheel Plow parity', () => {
  it('A018 S1: two occupations and two wood allow Wheel Plow to be played', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A018 S2: first-person Farmland plows two card fields before its normal field', () => {
    const session = setup()
    const response = completePlowUse(session, session.takeAction(0, 'farmland'), CARD_ID, 2)
    expect(response.state.players[0]!.fields).toHaveLength(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(response.state.events.filter(event => event.type === 'farm.fieldPlowed').map(event => event.sourceCardId)).toEqual([CARD_ID, CARD_ID, undefined])
  })

  it('A018 S3: declining the first-person bonus consumes Wheel Plow but keeps the normal plow', () => {
    const session = setup()
    const response = completePlowUse(session, session.takeAction(0, 'farmland'), CARD_ID, 0)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('A018 S4: Farmland used by the second person does not trigger Wheel Plow', () => {
    const session = setup()
    let response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)

    response = session.takeAction(0, 'farmland')

    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBeFalsy()
  })

  it('A018 S5: Cultivation bonus fields participate in the same sow action', () => {
    const session = setupSowingSession({ cardId: CARD_ID, grain: 3 })
    session.state.players[0]!.occupationPlayed = OCCUPATIONS
    session.loadState(session.state)
    let response = completePlowUse(session, session.takeAction(0, 'cultivation'), CARD_ID, 2, true)
    expect(response.state.players[0]!.fields).toHaveLength(3)
    const sow = sowOptions(response).find(option => option.labelKey === 'actions.sow.name')
    expect(sow, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, sow!.value)
    response = session.commitSelectionChoice(0, { crops: response.state.players[0]!.fields.map(({ row, col }) => ({ row, col, crop: 'grain' })) })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map(field => field.stacks[0]?.remaining)).toEqual([3, 3, 3])
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('ae-negative-04-plows', () => {
  const { WHEEL, sessions, ok, setup, choice, turn, play, farm, plow, skip, fields, finished, endRound, invalidBonus, blockedPurchase } = audit04Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Wheel Plow negative audit', () => {
    it('A018 N1 real purchase enforces wood and two occupation prerequisites', () => {
      blockedPurchase(WHEEL, { occupations: 1, resources: { wood: 2 } })
      blockedPurchase(WHEEL, { resources: { wood: 1 } })
      const r = play(setup({ played: false, resources: { wood: 2 } }), WHEEL)
      assert.ok(r.state.players[0]!.minorPlayed.includes(WHEEL)); assert.equal(r.state.players[0]!.resources.wood, 0)
    })
    it('A018 N2 first person bonus rejects invalid geometry and undo restores once allowance', () => {
      const s = setup()
      let r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 1 })
      farm(s, r); invalidBonus(s)
      r = plow(s, s.getState(), { row: 0, col: 2 })
      r = plow(s, r, { row: 0, col: 3 })
      assert.equal(fields(r), 3); assert.equal(r.state.players[0]!.cardStates[WHEEL]?.flagged, true); finished(r)
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 0, col: 4 } }))
      const original = setup(); const before = undoRuleSnapshot(original.getState())
      let done = plow(original, turn(original, 0, 'farmland')); done = plow(original, done); done = plow(original, done)
      assert.equal(fields(done), 3)
      assertUndoRestored(before, original.undoAction())
      done = plow(original, turn(original, 0, 'farmland')); done = plow(original, done); done = plow(original, done)
      assert.equal(fields(done), 3)
      endRound(original)
      const later = plow(original, turn(original, 0, 'farmland'))
      assert.equal(fields(later), 4); finished(later)
    })
    it('A018 N3 second person and opponent Farmland cannot grant owner bonus', () => {
      const s = setup(); turn(s, 0, 'grain-seeds')
      let r = turn(s, 1, 'farmland'); r = plow(s, r)
      assert.equal(r.state.players[1]!.fields.length, 1)
      turn(s, 0, 'day-laborer'); const next = confirmNext(s, turn(s, 1, 'forest'))
      assert.equal(next.state.round, 2)
      turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest')
      r = plow(s, turn(s, 0, 'farmland'))
      assert.equal(fields(r), 1); assert.ok(!r.state.players[0]!.cardStates[WHEEL]?.flagged); finished(r)
    })
    it('A018 N4 Cultivation bonus fields belong to the same sow action', () => {
      const s = setup({ round: 14, resources: { grain: 3 } })
      let r = plow(s, turn(s, 0, 'cultivation')); r = plow(s, r); r = plow(s, r)
      assert.equal(fields(r), 3)
      r = choice(s, r, o => o.value === 'sow' || o.labelKey === 'actions.sow.name')
      r = ok(s.commitSelectionChoice(0, { crops: r.state.players[0]!.fields.map(({ row, col }) => ({ row, col, crop: 'grain' })) }))
      assert.equal(r.state.players[0]!.resources.grain, 0)
      assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks[0]?.remaining), [3, 3, 3]); finished(r)
    })
    it('A018 N5 decline consumption is recorded without deciding the optional allowance rule', () => {
      const s = setup(); let r = skip(s, turn(s, 0, 'farmland')); r = plow(s, r)
      assert.equal(fields(r), 1); finished(r)
      assert.equal(r.state.players[0]!.cardStates[WHEEL]?.flagged, true)
      endRound(s)
      r = plow(s, turn(s, 0, 'farmland'))
      assert.equal(fields(r), 2); finished(r)
    })
    it('A018 N6 last free farm tile cannot create phantom bonus fields', () => {
      const s = setup({ lastPlot: true }); let r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 4 })
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = choice(s, r, o => o.value === WHEEL)
      assert.equal(fields(r), 13); finished(r)
    })
  })
  it('A018 N7 the card can plow the final plot before its satisfied Farmland host without phantom fields', () => {
    const s = setup({ lastPlot: true }); const normal = turn(s, 0, 'farmland')
    assert.equal(normal.interaction.stateId === 'wait' ? normal.interaction.sourceCard : undefined, WHEEL)
    let r = plow(s, normal, { row: 0, col: 4 })
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = choice(s, r, o => o.value === WHEEL)
    assert.equal(fields(r), 13); assert.equal(r.state.players[0]!.cardStates[WHEEL]?.flagged, true); finished(r)
    assert.equal(r.state.events.filter(event => event.type === 'farm.fieldPlowed' && event.sourceCardId === WHEEL).length, 1)
  })
})
