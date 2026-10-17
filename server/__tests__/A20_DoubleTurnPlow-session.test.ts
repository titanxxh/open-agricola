import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { A020_DoubleTurnPlow } from '../../shared/cards/A/A020_DoubleTurnPlow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit04Plows from './_helpers/audit/ae-negative-04-plows'

const CARD_ID = 'A020_DoubleTurnPlow'
const FILLER = '__test_placeholder__'

const setup = ({ round = 3, food = round > 3 ? 1 : 0 } = {}) => {
  const session = new GameSession(7020 + round, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.grain = 1
  state.players[0]!.resources.food = food
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === CARD_ID)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const choosePlow = (session: GameSession, response: SessionResponse) => {
  for (let guard = 0; guard < 4
    && response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'choice'; guard += 1) {
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(
    response.interaction.playerIndex, { tile: response.interaction.request.farm.selectableTiles[0]! },
  )
}

describe('A020_DoubleTurnPlow prerequisite', () => {
  it('blocks when round > 5', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.round = 6
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, A020_DoubleTurnPlow, state.round, state))).toBe(false)
  })

  it('allows when round <= 5', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, A020_DoubleTurnPlow, state.round, state))).toBe(true)
  })
})

describe('A020 Double-Turn Plow parity', () => {
  it('A020 S1: in round three one grain plays Double-Turn Plow and may plow two fields', () => {
    const session = setup()
    let response = playMinor(session)
    response = choosePlow(session, response)
    response = choosePlow(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(2)
  })

  it('A020 S2: in round four Double-Turn Plow additionally costs one food and may be declined', () => {
    const session = setup({ round: 4 })
    let response = playMinor(session)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })

  it('A020 S3: round five is the last round in which Double-Turn Plow is available', () => {
    const available = playMinor(setup({ round: 5 }))
    expect(available.state.players[0]!.minorPlayed).toContain(CARD_ID)

    const late = playMinor(setup({ round: 6 }))
    expect(late.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(late.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
  })
})

describe('ae-negative-04-plows', () => {
  const { DOUBLE, sessions, setup, play, farm, plow, skip, fields, finished, invalidBonus, blockedPurchase } = audit04Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Double Turn Plow negative audit', () => {
    it('A020 N1 actual purchases at controlled round three four five pay exact dynamic costs', () => {
      for (const round of [3, 4, 5]) {
        const s = setup({ card: DOUBLE, played: false, round, resources: { grain: 1, food: round > 3 ? 1 : 0 } })
        let r = play(s, DOUBLE); r = plow(s, r); r = plow(s, r)
        assert.equal(fields(r), 2); assert.deepEqual({ grain: r.state.players[0]!.resources.grain, food: r.state.players[0]!.resources.food }, { grain: 0, food: 0 }); finished(r)
      }
    })
    it('A020 N2 missing grain or conditional food cannot bypass purchase payment', () => {
      blockedPurchase(DOUBLE, { round: 3, resources: { grain: 0, food: 0 } })
      blockedPurchase(DOUBLE, { round: 4, resources: { grain: 1, food: 0 } })
      const s = setup({ card: DOUBLE, played: false, round: 4, resources: { grain: 1, food: 1 } })
      const r = skip(s, play(s, DOUBLE)); assert.ok(r.state.players[0]!.minorPlayed.includes(DOUBLE)); assert.equal(fields(r), 0)
    })
    it('A020 N3 controlled round six rejects actual purchase and round five allows it', () => {
      blockedPurchase(DOUBLE, { round: 6, resources: { grain: 1, food: 1 } })
      const s = setup({ card: DOUBLE, played: false, round: 5, resources: { grain: 1, food: 1 } })
      assert.ok(skip(s, play(s, DOUBLE)).state.players[0]!.minorPlayed.includes(DOUBLE))
    })
    it('A020 N4 immediate field geometry and payment survive undo and legal retry', () => {
      const s = setup({ card: DOUBLE, played: false, round: 3, resources: { grain: 1, food: 0 } }); const before = undoRuleSnapshot(s.getState())
      let r = farm(s, play(s, DOUBLE))
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } }))
      r = plow(s, r, { row: 0, col: 1 }); farm(s, r); invalidBonus(s)
      r = plow(s, s.getState(), { row: 0, col: 2 }); assert.equal(fields(r), 2); finished(r)
      assertUndoRestored(before, s.undoAction())
      r = play(s, DOUBLE); r = plow(s, r); r = plow(s, r); assert.equal(fields(r), 2)
    })
    it('A020 N5 one free plot caps immediate effect at one field', () => {
      const s = setup({ card: DOUBLE, played: false, round: 3, lastPlot: true, resources: { grain: 1, food: 0 } })
      const r = plow(s, play(s, DOUBLE), { row: 0, col: 4 }); assert.equal(fields(r), 13); assert.ok(r.state.players[0]!.minorPlayed.includes(DOUBLE)); finished(r)
    })
    it('A020 N6 declining all or only the second plow keeps the paid card', () => {
      for (const count of [0, 1]) {
        const s = setup({ card: DOUBLE, played: false, round: 4, resources: { grain: 1, food: 1 } })
        let r = play(s, DOUBLE); if (count === 1) r = plow(s, r)
        r = skip(s, r); assert.equal(fields(r), count)
        assert.deepEqual({ grain: r.state.players[0]!.resources.grain, food: r.state.players[0]!.resources.food }, { grain: 0, food: 0 }); finished(r)
      }
    })
  })
})
