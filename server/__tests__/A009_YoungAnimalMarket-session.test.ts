import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A009_YoungAnimalMarket'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A009_YoungAnimalMarket'

const setup = (sheep: number) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 9, options: { playerCount: 2 } }))
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
  player.houseAnimals = {}
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (getChoiceOptions(response)?.some((option) => option.value === CARD_ID)) return response
  const improvement = getChoiceOptions(response)?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
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
      zones: [{ id: 'house:1-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseAnimals: { '1-0': 'cattle' }, })
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
describe("A009 command boundaries", () => {
  const BASKET = 'A008_FoodBasket'
  const MARKET = 'A009_YoungAnimalMarket'
  function setup(card: string, { ownMajors = [], opponentMajors = [], occupations = 0, improvements = 0, resources = {}, opponentPrerequisites = false, inHand = true }: {
    ownMajors?: string[]
    opponentMajors?: string[]
    occupations?: number
    improvements?: number
    resources?: Partial<PlayerState['resources']>
    opponentPrerequisites?: boolean
    inHand?: boolean
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (inHand)
          p.minorHand.push(card)
        else
          state.players[1]!.minorHand.push(card)
        p.improvements = ownMajors
        if (card === MARKET && resources.sheep === 1)
          p.minorPlayed = ['A017_ReclamationPlow']
        state.players[1]!.improvements = opponentMajors
        const target = state.players[opponentPrerequisites ? 1 : 0]!
        target.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist'].slice(0, occupations)
        target.minorPlayed = ['A041_VegetableSlicer', 'B010_Caravan'].slice(0, improvements)
        Object.assign(p.resources, resources)
        if (resources.cattle === 1) {
          p.houseAnimals = { '2-0': 'cattle' }
        }
      } }))
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function options(r: SessionResponse) {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function enter(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    const branch = options(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.ok(options(r).some(o => o.value === card))
    return ok(s.resolveChoice(0, card))
  }
  function passed(r: SessionResponse, card: string) {
    const p = r.state.players[0]!
    assert.equal(p.minorHand.includes(card), false)
    assert.equal(p.minorPlayed.includes(card), false)
    assert.equal(r.state.players[1]!.minorHand.filter(id => id === card).length, 1)
    assert.equal(r.state.roundPhase, 'work')
    assert.deepEqual([r.state.players[1]!.resources.stone, r.state.players[1]!.resources.wood, r.state.players[1]!.resources.clay, r.state.players[1]!.resources.reed, r.state.players[1]!.resources.grain, r.state.players[1]!.resources.vegetable, r.state.players[1]!.resources.sheep, r.state.players[1]!.resources.cattle], [0, 0, 0, 0, 0, 0, 0, 0])
    assert.equal(r.scores?.length, 2)
    const plays = r.state.events.filter(event => 'fromPlayerId' in event && event.cardId === card)
    assert.equal(plays.length, 1)
    const play = plays[0]!
    assert.ok('fromPlayerId' in play)
    assert.equal(play.fromPlayerId, p.id)
    assert.equal(play.toPlayerId, r.state.players[1]!.id)
    const payments = r.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === card)
    const expectedCost = card === BASKET ? { reed: 1 } : card === MARKET ? { sheep: 1 } : {}
    assert.equal(payments.length, Object.keys(expectedCost).length ? 1 : 0)
    if (payments.length) {
      const payment = payments[0]!
      assert.ok(payment.type === 'resource.paid')
      assert.deepEqual(payment.resources, expectedCost)
    }
    const rewards = r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.reason === 'cardEffect')
    const expectedGain = card === BASKET ? { grain: 1, vegetable: 1 } : card === MARKET ? { cattle: 1 } : {
      ...(p.improvements.includes('Major_Well') ? { stone: 1 } : {}),
      ...(p.improvements.includes('Major_Joinery') ? { wood: 1 } : {}),
      ...(p.improvements.includes('Major_Pottery') ? { clay: 1 } : {}),
      ...(p.improvements.includes('Major_Basket') ? { reed: 1 } : {}),
    }
    assert.equal(rewards.length, Object.keys(expectedGain).length ? 1 : 0)
    if (rewards.length) {
      const reward = rewards[0]!
      assert.ok(reward.type === 'resource.moved')
      assert.deepEqual(reward.resources, expectedGain)
      assert.deepEqual(reward.to, { kind: 'player', playerId: p.id })
    }
  }
  function resources(r: SessionResponse) {
    const p = r.state.players[0]!.resources
    return { stone: p.stone, wood: p.wood, clay: p.clay, reed: p.reed, grain: p.grain, vegetable: p.vegetable, sheep: p.sheep, cattle: p.cattle }
  }
  const ZERO = { stone: 0, wood: 0, clay: 0, reed: 0, grain: 0, vegetable: 0, sheep: 0, cattle: 0 }
  function noRepeat(s: GameSession, card: string) { assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); }
  function housed(s: GameSession, r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
    const placed = ok(s.resolveChoice(0, 'confirm', { zones: [{ id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 }] }))
    assert.equal(placed.state.players[0]!.houseAnimals['2-0'], 'cattle')
    assert.equal(countRoomAnimals(placed.state.players[0]!), 1)
    return placed
  }
  it("one sheep pays for one housed cattle and stale purchase cannot repeat", () => {
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
  it("no sheep rejects forged purchase before legal retry without free cattle", () => {
    const s = setup(MARKET)
    const r = enter(s)
    assert.equal(options(r).some(o => o.value === MARKET), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MARKET))
    const retry = buy(s, r, 'A054_Credit')
    assert.deepEqual(resources(retry), ZERO)
    assert.equal(retry.state.players[0]!.minorHand.includes(MARKET), true)
  })
  it("invalid target invented cattle overcapacity and cancel reject before valid house retry", () => {
    const s = setup(MARKET, { resources: { sheep: 1 } })
    buy(s, enter(s), MARKET)
    for (const zone of [
      { id: 'missing-pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
      { id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 2 },
      { id: 'house:2-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone] }))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'cancel'))
    const r = housed(s, s.getState())
    assert.deepEqual(resources(r), { ...ZERO, cattle: 1 })
    passed(r, MARKET)
  })
  it("undo during animal placement restores sheep cattle hand and worker before retry", () => {
    const s = setup(MARKET, { resources: { sheep: 1 } })
    const before = undoRuleSnapshot(s.getState())
    buy(s, enter(s), MARKET)
    assertUndoRestored(before, s.undoAction())
    const r = housed(s, buy(s, enter(s), MARKET))
    assert.deepEqual(resources(r), { ...ZERO, cattle: 1 })
    passed(r, MARKET)
  })
  it("two available cattle cannot exceed the single house slot and surplus can be discarded", () => {
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
