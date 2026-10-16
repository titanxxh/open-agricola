import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome, workersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/A/A054_Credit'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A054_Credit'
const purchaseSession = ({ occupations, food }: {
  occupations: number
  food: number
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 54, options: { playerCount: 2 } }))
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
  if (getChoiceOptions(response)?.some((option) => option.value === CARD_ID))
    return response
  const improvement = getChoiceOptions(response)?.find((option) => option.value.startsWith('action-improvement-'))
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
const roundEndSession = ({ round, food }: {
  round: number
  food: number
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 54, options: { playerCount: 2 } }))
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
    const payment = getChoiceOptions(response)?.find((option) => option.value !== '__skip__' && option.value !== 'skip')
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
describe("A054 command boundaries", () => {
  const WAGE = 'B007_Wage'
  const CREDIT = 'A054_Credit'
  const OCC = ['A125_Priest', 'A124_Knapper', 'A111_WallBuilder', 'A116_WoodCutter']
  function setup({ played = true, round = 14, occupations = [], hand = [], extra = [], resources = {}, opponent = {}, opponentHand = [], stock = 3, noCard = false }: {
    played?: boolean
    round?: number
    occupations?: string[]
    hand?: string[]
    extra?: string[]
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
    opponentHand?: string[]
    stock?: number
    noCard?: boolean
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 854, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        state.players.forEach(p => {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          p.cardStates = {}
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
        })
        const p = state.players[0]!
        p.minorHand = [...(!played && !noCard ? ["A054_Credit", WAGE, 'A016_RammedClay'] : []), ...hand, '__test_placeholder__']
        p.minorPlayed = [...(played && !noCard ? ["A054_Credit"] : []), ...extra]
        p.occupationPlayed = occupations
        Object.assign(p.resources, resources)
        Object.assign(state.players[1]!.resources, opponent)
        state.players[1]!.minorHand = [...opponentHand, '__test_placeholder__']
        state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = stock
      } }))
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger') ? getChoiceOptions(r) : []; }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) { assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction)); const matches = opts(r).filter(predicate); assert.equal(matches.length, 1, JSON.stringify(r.interaction)); const o = matches[0]; assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function minorMenu(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    sessionEvidence.record("purchase menu", r)
    if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) { const r = minorMenu(s, card); const completedResponse = r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card)
    assert.ok(completedResponse.interaction.stateId === 'wait' && completedResponse.interaction.request.kind === 'confirm-next-player', JSON.stringify(completedResponse.interaction))
    assert.equal(completedResponse.interaction.playerIndex, 0)
    assert.equal(completedResponse.state.currentPlayerIndex, 0)
    return completedResponse }
  function deny(s: GameSession, card: string) { const r = minorMenu(s, card); assert.ok(opts(r).some(o => o.value === WAGE && !('disabled' in o && o.disabled)), JSON.stringify(r.interaction)); assert.equal(opts(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); assert.equal(s.getState().state.players[0]!.minorPlayed.includes(card), false); const food = r.state.players[0]!.resources.food; const retry = ok(s.resolveChoice(0, WAGE)); resource(retry, 'food', food + 2); assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false); }
  function resource(r: SessionResponse, key: 'food' | 'wood' | 'begging', value: number, actor = 0) { assert.equal(r.state.players[actor]!.resources[key], value); }
  function endWork(s: GameSession) { turn(s, 0, 'forest'); turn(s, 1, 'clay-pit'); turn(s, 0, 'grain-seeds'); return confirmNext(s, turn(s, 1, 'reed-bank')); }
  function repaymentOption(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === CREDIT && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const payments = getChoiceOptions(r).filter(o => o.effectPreview?.kind === 'payment' && o.effectPreview.resourcesPaid?.food === 1 && !o.disabled)
    assert.equal(payments.length, 1, JSON.stringify(r.interaction))
    const payment = payments[0]
    assert.ok(payment)
    return payment
  }
  function repay(s: GameSession, r: SessionResponse) { const completedResponse = ok(s.resolveChoice(0, repaymentOption(r).value))
    assert.equal(completedResponse.interaction.stateId, 'idle')
    assert.equal(completedResponse.state.currentPlayerIndex, 0)
    return completedResponse }
  function finishHarvest(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
      const request = r.interaction.request
      if (request.kind === 'feed')
        r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm', { selections: [] }))
      else if (request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm'))
      else if (request.kind === 'confirm-next-player')
        r = confirmNext(s, r)
      else if (request.kind === 'choice' && opts(r).some(o => o.value === '__skip__'))
        r = ok(s.resolveChoice(r.interaction.playerIndex, '__skip__'))
      else
        assert.fail(JSON.stringify(r.interaction))
    }
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }
  it("occupation four rejects forged Credit before zero and three occupation controls", () => {
    deny(setup({ played: false, occupations: OCC, resources: { food: 0 } }), CREDIT)
    for (const occupations of [[], OCC.slice(0, 3)]) {
      const r = buy(setup({ played: false, occupations, resources: { food: 0 } }), CREDIT)
      resource(r, 'food', 5)
      assert.ok(r.state.players[0]!.minorPlayed.includes(CREDIT))
    }
  })
  it("actual onBuy gives five food once and undo restores card before replay", () => {
    const s = setup({ played: false, occupations: OCC.slice(0, 3), resources: { food: 0 } })
    const beforeInteraction = JSON.stringify(s.getState().interaction); assert.equal(s.getState().interaction.stateId, 'idle'); const before = undoRuleSnapshot(s.getState())
    const r = buy(s, CREDIT)
    resource(r, 'food', 5)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, CREDIT))
    const restored = s.undoAction(); assertUndoRestored(before, restored); assert.equal(JSON.stringify(restored.interaction), beforeInteraction); assert.equal(restored.state.currentPlayerIndex, 0)
    resource(buy(s, CREDIT), 'food', 5)
  })
  it("real nonharvest end requires one repayment and rejects skip actor and replay", () => {
    const s = setup({ round: 1, resources: { food: 1 } })
    const r = endWork(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === CREDIT)
    assert.equal(opts(r).some(o => o.value === '__skip__' && !('disabled' in o && o.disabled)), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, '__skip__'))
    const old = repaymentOption(r)
    assert.ok(old)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, old.value))
    const done = repay(s, r)
    assert.equal(done.state.round, 2)
    resource(done, 'food', 0)
    resource(done, 'begging', 0)
    resource(done, 'food', 40, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, old.value))
  })
  it("zero food owes one begging while no-card and foreign players owe nothing", () => {
    for (const noCard of [false, true]) {
      const s = setup({ round: 1, noCard, resources: { food: 0 } })
      const r = endWork(s)
      assert.equal(r.interaction.stateId, 'idle')
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.round, 2)
      resource(r, 'food', 0)
      resource(r, 'begging', noCard ? 0 : 1)
      resource(r, 'food', 40, 1)
    }
  })
  it("actual harvest four skips Credit compared with nonharvest three", () => {
    for (const round of [3, 4]) {
      const s = setup({ round, resources: { food: 8 } })
      const r = round === 4 ? finishHarvest(s, endWork(s)) : repay(s, endWork(s))
      assert.equal(r.state.round, round + 1)
      resource(r, 'food', round === 4 ? 4 : 7)
      resource(r, 'begging', 0)
    }
  })
  it("two actual nonharvest ends charge once each and return available workers", () => {
    const s = setup({ round: 1, resources: { food: 2 } })
    for (const round of [2, 3]) {
      const r = repay(s, endWork(s))
      assert.equal(r.state.round, round)
      resource(r, 'food', 3 - round)
      resource(r, 'begging', 0)
      resource(r, 'food', 40, 1)
      assert.equal(workersAtHome(r.state, r.state.players[0]!).length, 2)
    }
  })
})
