import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A037_Bucksaw'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit07Scoring from './_helpers/audit/ae-negative-07-scoring'

const CARD_ID = 'A037_Bucksaw'

const setup = ({ wood, inHand = false }: { wood: number; inHand?: boolean }) => {
  const session = new GameSession(37, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = inHand ? 1 : 6
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.minorPlayed = inHand ? [] : [CARD_ID]
  player.houseType = 'wood'
  player.resources = {
    ...player.resources,
    wood,
    clay: inHand ? 0 : 2,
    reed: inHand ? 0 : 1,
    grain: 0,
  }
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

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = response.interaction.stateId === 'wait'
    ? response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    : undefined
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const openBucksawPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget'
  ) response = session.resolveChoice(0, 'clay')
  return response
}

const resolveBucksaw = (session: GameSession, response: SessionResponse, accept: boolean) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  const option = response.interaction.request.options?.find((candidate) => accept
    ? candidate.value !== '__skip__' && candidate.value !== 'skip'
    : candidate.value === '__skip__' || candidate.value === 'skip')
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A037 Bucksaw parity', () => {
  it('A037 S1: playing Bucksaw costs one wood and keeps the non-passing card', () => {
    const response = playMinor(setup({ wood: 1, inHand: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })

  it('A037 S2: accepting after renovation pays one wood for grain and bonus point', () => {
    const session = setup({ wood: 1 })

    const response = resolveBucksaw(session, openBucksawPrompt(session), true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 0, clay: 0, reed: 0, grain: 1 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('A037 S3: declining after renovation preserves the extra wood and grants nothing', () => {
    const session = setup({ wood: 1 })

    const response = resolveBucksaw(session, openBucksawPrompt(session), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 1, clay: 0, reed: 0, grain: 0 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A037 S4: renovation without extra wood grants no Bucksaw reward', () => {
    const session = setup({ wood: 0 })

    const response = openBucksawPrompt(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 0, clay: 0, reed: 0, grain: 0 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A037 S5: a non-renovation action does not trigger Bucksaw', () => {
    const session = setup({ wood: 1 })
    const state = session.getState().state
    state.players[0]!.resources.clay = 0
    state.players[0]!.resources.reed = 0
    session.loadState(state)

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0 })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('ae-negative-07-scoring', () => {
  const { SAW, sessions, ok, options, buy, denied, bonus, cardMenu, accept, decline, saw, renovate } = audit07Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A037 N1 purchase needs one wood and grants no renovation reward', () => { denied(saw(0, false), SAW); const s = saw(1, false); const r = buy(s, SAW); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(bonus(r, SAW), 0) })
  it('A037 N2 actual renovation pays materials and separately pays one wood for grain and point', () => { const s = saw(); const r = accept(s, renovate(s), 1, SAW); assert.equal(r.state.players[0]!.houseType, 'clay'); assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.grain], [0, 0, 0, 1]); assert.equal(bonus(r, SAW), 1) })
  it('A037 N3 no wood gives no reward and voluntary decline preserves wood', () => {
    const none = saw(0); const r = renovate(none); assert.equal(r.state.players[0]!.houseType, 'clay'); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(bonus(r, SAW), 0); assertRejectedUnchanged(none, () => none.resolveChoice(0, SAW))
    const s = saw(); const after = decline(s, renovate(s), SAW); assert.equal(after.state.players[0]!.resources.wood, 1); assert.equal(after.state.players[0]!.resources.grain, 0); assert.equal(bonus(after, SAW), 0)
  })
  it('A037 N4 a real owner ordinary action cannot trigger renovation reward', () => { const s = saw(); const r = ok(s.takeAction(0, 'day-laborer')); assert.equal(r.state.players[0]!.resources.food, 22); assert.equal(r.state.players[0]!.resources.wood, 1); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(bonus(r, SAW), 0) })
  it('A037 N5 actual opponent renovation cannot grant owner grain or points', () => {
    const s = saw(1, true, state => Object.assign(state.players[1]!.resources, { clay: 2, reed: 1, wood: 1 })); confirmNext(s, ok(s.takeAction(0, 'day-laborer'))); const r = renovate(s, 1); assert.equal(r.state.players[1]!.houseType, 'clay'); assert.equal(r.state.players[1]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.wood, 1); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(bonus(r, SAW), 0)
  })
  it('A037 N6 wrong actor invalid and stale fee responses reject without mutation', () => { const s = saw(); const r = cardMenu(s, renovate(s), SAW); const c = options(r).find(o => o.value !== '__skip__'); assert(c); assertRejectedUnchanged(s, () => s.resolveChoice(1, c.value)); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pay-two-wood')); const after = ok(s.resolveChoice(0, c.value)); assert.equal(bonus(after, SAW), 1); assertRejectedUnchanged(s, () => s.resolveChoice(0, c.value)) })
  it('A037 N7 whole action undo restores wooden rooms material fee grain and point before retry', () => { const s = saw(); const before = undoRuleSnapshot(s.getState()); assert.equal(bonus(accept(s, renovate(s), 1, SAW), SAW), 1); assertUndoRestored(before, s.undoAction()); assert.equal(bonus(accept(s, renovate(s), 1, SAW), SAW), 1) })
  it('A037 N8 two actual renovations in one round each charge wood and award grain and point', () => {
    const s = saw(2, true, state => Object.assign(state.players[0]!.resources, { stone: 2, reed: 2 }))
    let r = accept(s, renovate(s), 1, SAW); assert.equal(bonus(r, SAW), 1)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const skip = r.interaction.request.options.find(o => o.value === '__skip__' || o.value === 'skip'); assert(skip, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(0, skip.value)) }
    confirmNext(s, r); confirmNext(s, ok(s.takeAction(1, 'day-laborer')))
    r = accept(s, renovate(s, 0, 'farm-redevelopment', 'stone'), 1, SAW)
    assert.equal(r.state.players[0]!.houseType, 'stone'); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.stone, 0); assert.equal(r.state.players[0]!.resources.reed, 0); assert.equal(r.state.players[0]!.resources.grain, 2); assert.equal(bonus(r, SAW), 2)
  })
})
