import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A009_YoungAnimalMarket'
import '../../shared/cards/A/A006_StorageBarn'
import '../../shared/cards/A/A008_FoodBasket'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit04Immediate from './_helpers/audit/ae-negative-04-immediate'

const CARD_ID = 'A009_YoungAnimalMarket'

const setup = (sheep: number) => {
  const session = new GameSession(9, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.sheep = sheep
  player.resources.cattle = 0
  player.houseAnimals = {};
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

describe('A009 Young Animal Market parity', () => {
  it('A009 S1: one sheep becomes one housed cattle and the card passes', () => {
    const session = setup(1)
    let response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, cattle: 1 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })

    response = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseAnimals: { '2-0': 'cattle' }, })
  })

  it('A009 S2: no sheep keeps Young Animal Market unavailable and preserves state', () => {
    const session = setup(0)
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, cattle: 0 })
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })
})

describe('ae-negative-04-immediate', () => {
  const { MARKET, sessions, setup, options, enter, buy, passed, resources, ZERO, noRepeat, housed } = audit04Immediate
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A009 N1 one sheep pays for one housed cattle and stale purchase cannot repeat', () => {
    const s = setup(MARKET, { resources: { sheep: 1 } })
    const offer = enter(s)
    assert.deepEqual(resources(offer), { ...ZERO, sheep: 1 })
    const r = buy(s, offer, MARKET)
    assert.deepEqual(resources(r), { ...ZERO, cattle: 1 })
    passed(r, MARKET)
    noRepeat(s, MARKET)
    const placed = housed(s, s.getState())
    assert.deepEqual(resources(placed), { ...ZERO, cattle: 1 })
    noRepeat(s, MARKET)
  })
  it('A009 N2 no sheep rejects forged purchase before legal retry without free cattle', () => {
    const s = setup(MARKET)
    const r = enter(s)
    assert.equal(options(r).some(o => o.value === MARKET), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MARKET))
    const retry = buy(s, r, 'A054_Credit')
    assert.deepEqual(resources(retry), ZERO)
    assert.equal(retry.state.players[0]!.minorHand.includes(MARKET), true)
  })
  it('A009 N3 invalid target invented cattle overcapacity and cancel reject before valid house retry', () => {
    const s = setup(MARKET, { resources: { sheep: 1 } })
    buy(s, enter(s), MARKET)
    for (const zone of [
      { id: 'missing-pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
      { id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 2 },
      { id: 'house:2-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ]) assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone] }))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'cancel'))
    const r = housed(s, s.getState())
    assert.deepEqual(resources(r), { ...ZERO, cattle: 1 })
    passed(r, MARKET)
  })
  it('A009 N4 undo during animal placement restores sheep cattle hand and worker before retry', () => {
    const s = setup(MARKET, { resources: { sheep: 1 } })
    const before = undoRuleSnapshot(s.getState())
    buy(s, enter(s), MARKET)
    assertUndoRestored(before, s.undoAction())
    const r = housed(s, buy(s, enter(s), MARKET))
    assert.deepEqual(resources(r), { ...ZERO, cattle: 1 })
    passed(r, MARKET)
  })
  it('A009 N5 two available cattle cannot exceed the single house slot and surplus can be discarded', () => {
    const s = setup(MARKET, { resources: { sheep: 1, cattle: 1 } })
    const r = buy(s, enter(s), MARKET)
    assert.deepEqual(resources(r), { ...ZERO, cattle: 2 })
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 2 }] }))
    const kept = housed(s, s.getState())
    assert.deepEqual(resources(kept), { ...ZERO, cattle: 1 })
    assert.equal(kept.state.players[0]!.resources.food, 0)
    passed(kept, MARKET)
    const discards = kept.state.events.filter(event => event.type === 'farm.animalDiscarded')
    assert.equal(discards.length, 1)
    assert.ok(discards[0]!.type === 'farm.animalDiscarded')
    assert.deepEqual(discards[0]!.animals, { cattle: 1 })
  })
})
