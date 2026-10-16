import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playImprovement, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, expectTileFarmSelection } from './_helpers/session-assertions'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'B018_GrasslandHarrow'

const setup = ({ round = 3, wood = 3, clay = 1, stone = 0, occupations = 2 } = {}) => {
  const session = evidence.track(createWorkSession({
    seed: 9707, configure: (state) => {
      state.round = round
      const player = state.players[0]!
      player.minorHand = [CARD_ID]
      player.occupationPlayed = ['A125_Priest', 'A124_Knapper'].slice(0, occupations)
      Object.assign(player.resources, { wood, clay, stone, reed: 0, food: 10 })
      state.players[1]!.resources.food = 10
    }
  }))
  return session
}

const buy = (session: GameSession) => playImprovement(session, CARD_ID, 'meeting-place')

// Scheduling depends on the successfully paid and committed card, so these are
// Session tests rather than direct calls to a payment listener.
describe('B018 Grassland Harrow activation', () => {
  it.each([[3, 1, 0, 5], [4, 1, 1, 7]])('wood=%s clay=%s stone=%s schedules round %s after payment and commitment', (wood, clay, stone, target) => {
    const session = setup({ wood, clay, stone })
    const before = snapshotResponse(session.getState())
    let response = buy(session)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: wood - 2, clay, stone })
    expect(response.state.futureMeeples).toEqual([expect.objectContaining({ cardId: CARD_ID, round: target, resources: { field: 1 } })])
    const events = response.state.events
    const payment = events.find((event) => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)!
    const played = events.find((event) => event.type === 'card.played' && event.cardId === CARD_ID)!
    const queued = events.filter((event) => event.type === 'futureMeeple.queued' && event.cardId === CARD_ID)
    expect(queued).toHaveLength(1)
    expect(played.seq).toBeGreaterThan(payment.seq)
    expect(queued[0]!.seq).toBeGreaterThan(played.seq)
    const restored = evidence.track(restoreSession(session))
    expect(restored.getState().state.futureMeeples).toEqual(response.state.futureMeeples)
    response = restored.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.futureMeeples).toEqual([])
    expect(response.state.players[0]!.minorHand).toEqual([CARD_ID])
    expect(response.state.players[0]!.resources).toEqual(before.state.players[0]!.resources)
    expect(response.state.log).toEqual(before.state.log)
    expect(buy(restored).state.futureMeeples).toHaveLength(1)
  })

  it('excludes the card without two occupations and leaves payment and schedules untouched', () => {
    const session = setup({ occupations: 1 })
    const before = snapshotResponse(session.getState())
    const response = session.takeAction(0, 'meeting-place')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toEqual(before.state.players[0]!.resources)
    expect(response.state.futureMeeples).toEqual([])
  })

  it('rejects a forged selection that exhausts all building resources, then allows a valid retry', () => {
    const session = setup({ wood: 2, clay: 0 })
    session.state.players[0]!.minorHand.push('A004_Baseboards')
    session.state.players[0]!.minorHand.push('A030_BakingSheet')
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected improvement branch')
    const branch = getChoiceOptions(response)!.find((option) => option.value.startsWith('action-improvement-'))!
    response = choose(session, response, branch.value)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected minor choice')
    expect(getChoiceOptions(response)?.some((option) => option.value === CARD_ID)).toBe(false)
    const before = snapshotResponse(response)
    const interaction = structuredClone(response.interaction)
    response = session.resolveChoice(0, CARD_ID)
    expect(response.ok).toBe(false)
    expect(snapshotResponse(response)).toEqual(before)
    expect(response.interaction).toEqual(interaction)
    expect(response.state.futureMeeples).toEqual([])
    expect(session.undoAction().ok).toBe(true)
    session.state.players[0]!.resources.clay = 1
    expect(buy(session).state.futureMeeples).toEqual([expect.objectContaining({ round: 4, resources: { field: 1 } })])
  })

  it.each([[13, 2, 1, 14], [13, 4, 0, null]])('round %s with wood=%s clay=%s has target %s', (round, wood, clay, target) => {
    const response = buy(setup({ round, wood, clay }))
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.futureMeeples).toEqual(target === null ? [] : [expect.objectContaining({ round: target })])
  })

  it.each([false, true])('resolves its actual due field once, decline=%s, with saved pending recovery', (decline) => {
    const session = setup({ round: 1, wood: 2, clay: 1 })
    buy(session)
    const state = session.state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'select-trigger' } })
    const restored = evidence.track(restoreSession(session))
    response = restored.getState()
    if (decline) response = choose(restored, response, '__pass__')
    else {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected due field choice')
      const accept = getChoiceOptions(response)!.find((option) => !option.disabled && option.sourceCard === CARD_ID)!
      response = choose(restored, response, accept.value)
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected plow selection')
      const pending = evidence.track(restoreSession(restored))
      response = pending.commitSelectionChoice(0, { tile: expectTileFarmSelection(response, 'plow').selectableTiles[0]! })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(decline ? 0 : 1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1 })
    expect(response.state.futureMeeples).toEqual([])
  })
})

describe('B018 rule boundaries', () => {

  const B = 'B018_GrasslandHarrow', C = 'C104_Collector'

  function setup(card: string, configure: (state: GameState) => void = () => { }, round = 3) {
    return evidence.track(createWorkSession({
      seed: 8318, options: { playerCount: 2 }, configure: state => {
        state.round = round
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0 })
        }
        const p = state.players[0]!
        if (card === B) {
          p.minorHand = [B]
          p.occupationPlayed = ['A125_Priest', 'A124_Knapper']
          Object.assign(p.resources, { wood: 2, clay: 1 })
        }
        else
          p.occupationPlayed.push(card)
        configure(state)
        if (card === C)
          state.actionSpaces.push(...createPlayerActionSpaces(state))
      }
    }))
  }

  function playImprovement(session: GameSession, cardId: string, spaceId = 'major-improvement', playerIndex = 0) {
    let r = place(session, playerIndex, spaceId)
    const played = () => { const p = r.state.players[playerIndex]!; return p.minorPlayed.includes(cardId) || p.improvements.includes(cardId) }
    if (!played() && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const branch = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (branch) {
        r = session.resolveChoice(playerIndex, branch.value)
        assert.equal(r.ok, true, r.error)
      }
    }
    if (!played()) {
      const i = wait(r)
      assert.ok(i.request.kind === 'choice')
      assert.ok(getChoiceOptions({ interaction: i }).some(o => o.value === cardId && !('disabled' in o && o.disabled)))
      r = session.resolveChoice(playerIndex, cardId)
      assert.equal(r.ok, true, r.error)
    }
    assert.equal(played(), true)
    return r
  }

  function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction }

  function choice(response: SessionResponse) {
    const interaction = wait(response)
    assert.ok(interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
    const candidates = getChoiceOptions(response).filter(option => option.sourceCard === B && !option.disabled)
    assert.equal(candidates.length, 1, JSON.stringify(interaction))
    return candidates[0]!.value
  }

  function finish(s: GameSession, initial: SessionResponse) {
    let r = initial
    for (let n = 0; n < 6 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'confirm-next-player')
        r = confirmNext(s, r)
      else if (r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value === '__skip__'))
        r = s.resolveChoice(r.interaction.playerIndex, '__skip__')
      else
        break
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  function place(s: GameSession, actor: number, id: string) { const r = s.takeAction(actor, id); assert.equal(r.ok, true, r.error); return r }

  it("payment shortage occupation shortage and empty post-payment reserve cannot play; legal reserve can", () => {
    for (const config of ['fee', 'occupation', 'reserve']) {
      const s = setup(B, state => {
        const p = state.players[0]!
        if (config === 'fee')
          p.resources.wood = 1
        if (config === 'occupation')
          p.occupationPlayed = ['A125_Priest']
        if (config === 'reserve')
          p.resources.clay = 0
        state.availableMajorImprovements = []
      })
      const before = JSON.stringify(s.getState().state.players[0]!.resources)
      let r = place(s, 0, 'meeting-place')
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
        const branch = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-') && !('disabled' in o && o.disabled))
        if (branch) {
          r = s.resolveChoice(0, branch.value)
          assert.equal(r.ok, true, r.error)
        }
      }
      const enabledCard = r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'
        && getChoiceOptions(r).some(o => o.value === B && !('disabled' in o && o.disabled))
      assert.equal(enabledCard, false, `${config}: B018 must not be enabled`)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, B))
      assert.equal(r.state.players[0]!.minorPlayed.includes(B), false)
      assert.equal(JSON.stringify(r.state.players[0]!.resources), before)
      assert.deepEqual(r.state.futureMeeples, [])
    }
    const s = setup(B)
    const r = playImprovement(s, B, 'meeting-place')
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.deepEqual(r.state.futureMeeples.map(x => ({ round: x.round, resources: x.resources })), [{ round: 4, resources: { field: 1 } }])
  })

  it("future target counts only four building goods after actual payment and respects round fourteen", () => {
    for (const [round, wood, clay, reed, stone, target] of [[3, 3, 1, 1, 1, 7], [13, 2, 1, 0, 0, 14], [13, 4, 0, 0, 0, 0]]) {
      const s = setup(B, state => { Object.assign(state.players[0]!.resources, { wood, clay, reed, stone, grain: 8, food: 20 }) }, round)
      const r = playImprovement(s, B, 'meeting-place')
      assert.equal(r.state.players[0]!.resources.wood, wood - 2)
      assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === B).map(x => x.round), target ? [target] : [])
    }
  })

  it("natural next-round due field rejects room then plows exactly once with a legal retry", () => {
    const s = setup(B, () => { }, 1)
    finish(s, playImprovement(s, B, 'meeting-place'))
    finish(s, place(s, 1, 'grain-seeds'))
    finish(s, place(s, 0, 'clay-pit'))
    let r = place(s, 1, 'reed-bank')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.state.round, 2)
    r = s.resolveChoice(0, choice(r))
    const i = wait(r)
    assert.ok(i.request.kind === 'farm-select' && i.request.farm.farmType === 'plow')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } }))
    r = s.commitSelectionChoice(0, { tile: i.request.farm.selectableTiles[0]! })
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.players[0]!.fields.length, 1)
    assert.deepEqual(r.state.futureMeeples, [])
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }))
  })

  it("actual card undo restores both wood cost and the single future field", () => {
    const s = setup(B)
    const before = JSON.stringify(s.getState().state.players[0]!.resources)
    const score = JSON.stringify(s.getState().scores)
    playImprovement(s, B, 'meeting-place')
    const r = s.undoAction()
    assert.equal(r.ok, true, r.error)
    assert.equal(JSON.stringify(r.state.players[0]!.resources), before)
    assert.equal(JSON.stringify(r.scores), score)
    assert.deepEqual(r.state.futureMeeples, [])
    assert.equal(r.state.players[0]!.minorHand.includes(B), true)
  })

  it("natural due optional field can be declined without plowing or delaying a token", () => {
    const s = setup(B, () => { }, 1)
    finish(s, playImprovement(s, B, 'meeting-place'))
    finish(s, place(s, 1, 'grain-seeds'))
    finish(s, place(s, 0, 'clay-pit'))
    let r = place(s, 1, 'reed-bank')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    const i = wait(r)
    assert.ok(i.request.kind === 'select-trigger' && getChoiceOptions({ interaction: i }).some(o => o.value === '__pass__' && !('disabled' in o && o.disabled)))
    r = s.resolveChoice(0, '__pass__')
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.round, 2)
    assert.equal(r.state.players[0]!.fields.length, 0)
    assert.deepEqual(r.state.futureMeeples, [])
  })
})
