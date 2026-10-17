import { type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import '../../shared/cards/A/A024_ThreshingBoard'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit06Actions from './_helpers/audit/ae-negative-06-actions'

const CARD_ID = 'A024_ThreshingBoard'

const setup = () => {
  const session = new GameSession(6024, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push(CARD_ID)
  player.improvements.push('Major_Fireplace1')
  player.resources = { ...player.resources, grain: 1, food: 0 }
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  session.loadState(state)
  return session
}

const finishPlow = (session: GameSession) => {
  const response = session.getState()
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected plow selection')
  expect(response.interaction.request.kind).toBe('farm-select')
  const tile = response.interaction.request.farm.selectableTiles[0]
  expect(tile).toBeDefined()
  const result = session.commitSelectionChoice(0, { tile })
  expect(result.ok).toBe(true)
  expect(result.state.players[0]!.fields).toHaveLength(1)
  return result
}

describe('A024_ThreshingBoard session', () => {
  it.each(['no-grain', 'no-cookery', 'other-space'])('does not offer baking for %s', (scenario) => {
    const session = setup()
    const state = session.getState().state
    if (scenario === 'no-grain') state.players[0]!.resources.grain = 0
    if (scenario === 'no-cookery') state.players[0]!.improvements = []
    session.loadState(state)
    const response = session.takeAction(0, scenario === 'other-space' ? 'forest' : 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    if (scenario !== 'other-space') finishPlow(session)
  })
  it.each(['farmland', 'cultivation'])('can decline baking before plowing at %s', (spaceId) => {
    const session = setup()

    let resp = session.takeAction(0, spaceId)
    expect(resp.state.players[0]!.fields).toHaveLength(0)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.map((option: ActionChoiceOption) => option.value)).toContain('__skip__')
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    finishPlow(session)
  })

  it.each(['farmland', 'cultivation'])('accepting baking at %s consumes grain before plowing', (spaceId) => {
    const session = setup()

    let resp = session.takeAction(0, spaceId)
    expect(resp.state.players[0]!.fields).toHaveLength(0)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      expect(resp.interaction.request.options?.map((option) => option.value)).not.toContain('cancel')
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    finishPlow(session)
  })
})

describe('A024 Threshing Board parity', () => {
  const CARD_ID = 'A024_ThreshingBoard'

  const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, occupations = 2 } = {}) => {
    const session = new GameSession(6024, undefined, { playerCount: 2 })
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
      player.resources = {
        ...player.resources, wood: 0, grain: 0, food: 0, clay: 0, reed: 0, stone: 0,
      }
    })
    const player = state.players[0]!
    player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
    player.minorPlayed = played ? [CARD_ID] : []
    player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    player.improvements = played ? ['Major_Fireplace1'] : []
    player.resources.wood = 1
    player.resources.grain = 1
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (options(response).some((option) => option.value === CARD_ID)) return response
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playCard = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  it('A024 S1: two occupations and one wood allow playing Threshing Board', () => {
    const response = playCard(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A024 S2: fewer than two occupations keep Threshing Board unavailable', () => {
    const response = enterMinor(setup({ played: false, occupations: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })
})

describe('ae-negative-06-actions', () => {
  const { A024, sessions, setup, ok, opts, turn, buy, denied, plow, skipRemaining, bake, bakeSetup } = audit06Actions
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A024 N1 occupation or wood shortage rejects forged card before legal purchase', () => {
    const occ = ['A125_Priest', 'A124_Knapper']
    denied(setup({ card: A024, played: false, occupations: occ.slice(0, 1), resources: { wood: 1 } }), A024)
    denied(setup({ card: A024, played: false, occupations: occ }), A024)
    const r = buy(setup({ card: A024, played: false, occupations: occ, resources: { wood: 1 } }), A024); assert.equal(r.state.players[0]!.resources.wood, 0); assert.ok(r.state.players[0]!.minorPlayed.includes(A024))
  })
  it('A024 N2 Farmland bakes once and rejects wrong actor or room plow target before retry', () => {
    const s = bakeSetup(); const offer = turn(s, 0, 'farmland')
    assertRejectedUnchanged(s, () => s.resolveChoice(1, opts(offer).find(o => o.value !== '__skip__')!.value))
    bake(s, offer); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } }))
    const r = plow(s); assert.equal(r.state.players[0]!.resources.food, 42); assert.equal(r.state.players[0]!.fields.length, 1)
  })
  it('A024 N3 Cultivation grants one reachable bake and cannot replay it after plowing', () => {
    const s = bakeSetup(); bake(s, turn(s, 0, 'cultivation')); const r = skipRemaining(s, plow(s))
    assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(r.state.players[0]!.resources.food, 42)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_Fireplace1'))
  })
  it('A024 N4 missing grain or cookery skips bake while core plow remains legal', () => {
    for (const config of [{ resources: { grain: 0 }, cookery: true }, { resources: { grain: 1 }, cookery: false }]) {
      const s = bakeSetup(config); const r = turn(s, 0, 'farmland')
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
      const done = plow(s); assert.equal(done.state.players[0]!.resources.grain, config.resources.grain); assert.equal(done.state.players[0]!.resources.food, 40); assert.equal(done.state.players[0]!.fields.length, 1)
    }
  })
  it('A024 N5 decline other space and opponent Farmland do not consume owner grain', () => {
    const decline = bakeSetup(); turn(decline, 0, 'farmland'); ok(decline.resolveChoice(0, '__skip__')); const d = plow(decline)
    assert.equal(d.state.players[0]!.resources.grain, 1); assert.equal(d.state.players[0]!.resources.food, 40)
    const s = bakeSetup({ opponent: { grain: 1 }, opponentCookery: true }); turn(s, 0, 'forest'); turn(s, 1, 'farmland'); const r = plow(s, 1)
    assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(r.state.players[0]!.fields.length, 0); assert.equal(r.state.players[1]!.fields.length, 1); assert.equal(r.state.players[1]!.resources.grain, 1); assert.equal(r.state.players[1]!.resources.food, 40)
  })
  it('A024 N6 action undo restores baked grain food field and placement before replay', () => {
    const s = bakeSetup(); const before = undoRuleSnapshot(s.getState()); bake(s, turn(s, 0, 'farmland')); plow(s)
    assertUndoRestored(before, s.undoAction()); turn(s, 0, 'farmland'); ok(s.resolveChoice(0, '__skip__')); const r = plow(s)
    assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(r.state.players[0]!.fields.length, 1)
  })
})
