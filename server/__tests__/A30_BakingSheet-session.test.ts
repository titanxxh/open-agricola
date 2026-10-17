import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A030_BakingSheet'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit06Scoring from './_helpers/audit/ae-negative-06-scoring'

const CARD_ID = 'A030_BakingSheet'
const FILLER = '__test_placeholder__'

const setup = ({ grain = 2, fieldGrain = 0, played = true } = {}) => {
  const session = new GameSession(5030, undefined, { playerCount: 2 })
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
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.improvements = ['Major_Fireplace1']
  player.resources.grain = grain
  player.resources.food = 0
  player.fields = fieldGrain > 0
    ? [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: fieldGrain }] }]
    : []
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.ok) return response
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const bakeOne = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.options?.some((option) =>
      option.value === 'Major_Fireplace1' || option.sourceCard === 'Major_Fireplace1')) {
    const bake = response.interaction.request.options?.find((option) =>
      option.value === 'Major_Fireplace1' || option.sourceCard === 'Major_Fireplace1')
    expect(bake).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, bake!.value)
  }
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadCount') {
    const one = response.interaction.request.options?.find((option) =>
      option.value === 'count-Major_Fireplace1-1')
    expect(one).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, one!.value)
  }
  return response
}

const acceptBakingSheet = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

const bonusVp = (session: GameSession) =>
  session.getState().scores[0]!.categories
    .find((category) => category.key === 'cardBonusVp')
    ?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0

describe('A030 Baking Sheet parity', () => {
  it('A030 S1: no grain field allows playing Baking Sheet for no resources', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A030 S2: a grain field keeps Baking Sheet unavailable', () => {
    const response = openMinorPrompt(setup({ played: false, fieldGrain: 1 }))

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')

    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A030 S3: after a normal bake, one extra grain gives two food and one bonus point', () => {
    const session = setup({ grain: 2 })
    const response = acceptBakingSheet(session, bakeOne(session))

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
    expect(bonusVp(session)).toBe(1)
  })

  it('A030 S4: declining Baking Sheet keeps the grain left after normal baking', () => {
    const session = setup({ grain: 2 })
    let response = resolveTriggerIfPresent(session, bakeOne(session), CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(bonusVp(session)).toBe(0)
  })

  it('A030 S5: spending the last grain on normal baking grants no Baking Sheet reward', () => {
    const session = setup({ grain: 1 })
    const response = bakeOne(session)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(bonusVp(session)).toBe(0)
  })
})

describe('ae-negative-06-scoring', () => {
  const { SHEET, sessions, ok, options, buy, denied, bonus, sheet, bake, sheetMenu, acceptSheet } = audit06Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A030 N1 planted grain forbids purchase while empty and vegetable fields allow a neutral free purchase', () => {
    denied(sheet({ played: false }, state => { state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }] }), SHEET)
    for (const vegetable of [false, true]) {
      const s = sheet({ played: false }, state => { state.players[0]!.fields = [{ row: 0, col: 1, stacks: vegetable ? [{ kind: 'vegetable', remaining: 1 }] : [] }] })
      const r = buy(s, SHEET); assert.equal(r.state.players[0]!.resources.grain, 2); assert.equal(r.state.players[0]!.resources.food, 20); assert.equal(bonus(r, SHEET), 0)
    }
  })
  it('A030 N2 no facility and forged zero normal bake cannot grant the exchange before a real bake control', () => {
    const none = sheet({ facility: false }); const before = undoRuleSnapshot(none.getState()); const r = none.takeAction(0, 'grain-utilization')
    if (!r.ok) assert.equal(undoRuleSnapshot(r), before)
    else {
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') assert(!r.interaction.request.options.some(o => o.sourceCard === SHEET && !o.disabled))
    }
    assertRejectedUnchanged(none, () => none.resolveChoice(0, SHEET)); assert.equal(none.state.players[0]!.resources.grain, 2); assert.equal(bonus(none.getState(), SHEET), 0)
    const retry = sheet(); const menu = ok(retry.takeAction(0, 'grain-utilization'))
    assert.equal(menu.interaction.stateId === 'wait' && menu.interaction.promptKey, 'ui.interactionBakeBreadCount')
    assertRejectedUnchanged(retry, () => retry.resolveChoice(0, 'count-Major_Fireplace1-0'))
    assertRejectedUnchanged(retry, () => retry.resolveChoice(0, 'bulk:'))
    assert.equal(retry.state.players[0]!.resources.grain, 2); assert.equal(bonus(retry.getState(), SHEET), 0)
    const got = acceptSheet(retry, ok(retry.resolveChoice(0, 'count-Major_Fireplace1-1')))
    assert.equal(got.state.players[0]!.resources.food, 24); assert.equal(bonus(got, SHEET), 1)
  })
  it('A030 N3 spending the last grain on normal baking gives no extra exchange or point', () => {
    const s = sheet({ grain: 1 }); const r = bake(s); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[0]!.resources.food, 22); assert.equal(bonus(r, SHEET), 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, SHEET))
  })
  it('A030 N4 one exact grain exchange rejects wrong actor and stale requests then whole action undo retries once', () => {
    const s = sheet({ grain: 3 }); const before = undoRuleSnapshot(s.getState()); const r = sheetMenu(s, bake(s)); const take = options(r).find(o => o.value !== '__skip__'); assert(take)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, take.value)); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'exchange-two-grain'))
    const after = ok(s.resolveChoice(0, take.value)); assert.equal(after.state.players[0]!.resources.grain, 1); assert.equal(after.state.players[0]!.resources.food, 24); assert.equal(bonus(after, SHEET), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, take.value)); assertUndoRestored(before, s.undoAction())
    assert.equal(bonus(acceptSheet(s, bake(s)), SHEET), 1)
  })
  it('A030 N5 declining its exchange preserves remaining grain and grants no bonus', () => {
    const s = sheet(); const r = sheetMenu(s, bake(s)); const decline = options(r).find(o => o.value === '__skip__'); assert(decline)
    const after = ok(s.resolveChoice(0, decline.value)); assert.equal(after.state.players[0]!.resources.grain, 1); assert.equal(after.state.players[0]!.resources.food, 22); assert.equal(bonus(after, SHEET), 0)
  })
  it('A030 N6 a real opponent bake with its own grain and fireplace gives no owner reward', () => {
    const s = sheet({}, state => { state.players[1]!.improvements = ['Major_Fireplace2']; state.players[1]!.resources.grain = 2 })
    confirmNext(s, ok(s.takeAction(0, 'day-laborer'))); const r = bake(s, 1, 'Major_Fireplace2')
    assert.equal(r.state.players[1]!.resources.grain, 1); assert.equal(r.state.players[1]!.resources.food, 22)
    assert.equal(r.state.players[0]!.resources.grain, 2); assert.equal(r.state.players[0]!.resources.food, 22); assert.equal(bonus(r, SHEET), 0)
  })
  it('A030 N7 a real anytime vegetable conversion is not normal grain baking', () => {
    const s = sheet({}, state => { state.players[0]!.resources.vegetable = 1 }); const r = ok(s.takeAnytimeAction(0, 'exchange'))
    const cook = options(r).find(o => o.effectPreview?.kind === 'resourceExchange' && (o.effectPreview.resourcesPaid?.vegetable ?? 0) === 1); assert(cook); assert(cook.value.startsWith('trade:'))
    const after = ok(s.resolveChoice(0, `bulk:${cook.value.split(':')[1]}=1`)); assert.equal(after.state.players[0]!.resources.vegetable, 0); assert.equal(after.state.players[0]!.resources.food, 22); assert.equal(after.state.players[0]!.resources.grain, 2); assert.equal(bonus(after, SHEET), 0)
  })
})
