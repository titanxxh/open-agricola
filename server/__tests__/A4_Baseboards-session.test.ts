import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome, setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A004_Baseboards'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState, type Resource } from '../../shared/contract/types'
import { buildLogPresentationPlan } from '../../shared/events/log-mapper'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A004_Baseboards'

const setup = (opts?: { food?: number; grain?: number; rooms?: number }) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 1, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.rooms = opts?.rooms ?? 2
  // Stock building resources so multiple majors are affordable, ensuring the
  // major-improvement choice prompt is shown (game-core auto-resolves when
  // options.length === 1 and fails when it is 0).
  player.resources = {
    ...player.resources,
    wood: 5,
    clay: 5,
    stone: 5,
    reed: 5,
    food: opts?.food ?? 2,
    grain: opts?.grain ?? 0,
  }
  player.minorHand = [CARD_ID]
  setWorkersAtHome(state, state.players[1]!, 2)

  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []

  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = getChoiceOptions(resp).find((o) => o.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const playA4 = (session: GameSession) => {
  const resp = enterImprovementChoice(session)
  if (resp.interaction.stateId !== 'wait') return resp
  const a4Option = getChoiceOptions(resp).find((o) => o.value === CARD_ID)
  expect(a4Option).toBeDefined()
  return session.resolveChoice(0, a4Option!.value)
}

describe('A004_Baseboards session — altCosts', () => {
  it('food cost: gains 1 wood per room and passes Baseboards', () => {
    const session = setup({ food: 2, grain: 0, rooms: 2 })
    const before = session.getState()
    assert.ok(before.scores)
    const scoreBefore = before.scores[0]!.total
    const resp = playA4(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.wood).toBe(7)
    expect(resp.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { wood: 2 } }),
    }))
    assert.ok(resp.scores)
    expect(resp.scores[0]!.total).toBe(scoreBefore)
  })

  it('grain cost: gains an additional wood when rooms exceed people', () => {
    const session = setup({ food: 0, grain: 1, rooms: 3 })
    const before = session.getState()
    assert.ok(before.scores)
    const scoreBefore = before.scores[0]!.total
    const resp = playA4(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.wood).toBe(9)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { wood: 4 } }),
    }))
    assert.ok(resp.scores)
    expect(resp.scores[0]!.total).toBe(scoreBefore - 2)
  })

  it('food=2, grain=1 → multi-solution → selectPayment choice', () => {
    const session = setup({ food: 2, grain: 1 })
    let resp = playA4(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(getChoiceOptions(resp).length).toBeGreaterThanOrEqual(2)

    const grainOption = getChoiceOptions(resp).find((option) =>
      option.effectPreview?.kind === 'payment'
      && option.effectPreview.resourcesPaid?.grain === 1
      && !option.effectPreview.resourcesPaid.food,
    )
    expect(grainOption).toBeDefined()
    resp = session.resolveChoice(0, grainOption!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('food=1, grain=0 → not buyable (cannot afford either alt)', () => {
    const session = setup({ food: 1, grain: 0 })
    const resp = enterImprovementChoice(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const a4Option = getChoiceOptions(resp).find((o) => o.value === CARD_ID)
    expect(a4Option).toBeUndefined()
  })
})

describe('A004 command boundaries', () => {
  const CARD_ID = 'A004_Baseboards'
  const WAGE = 'B007_Wage',
    COMPANION = 'A016_RammedClay'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(
    resources: Partial<Resource> = {},
    configure: (state: GameState) => void = () => {},
  ) {
    const s = sessionEvidence.track(
      createWorkSession({
        seed: 4242,
        options: { playerCount: 2 },
        configure(state) {
          state.round = 5
          state.availableMajorImprovements = []
          for (const p of state.players) {
            p.minorHand = ['__test_placeholder__']
            p.occupationHand = ['__test_placeholder__']
            p.minorPlayed = []
            p.occupationPlayed = []
            Object.assign(p.resources, {
              food: 40,
              wood: 0,
              clay: 0,
              reed: 0,
              stone: 0,
              grain: 0,
              vegetable: 0,
            })
            assert.equal(p.workers.length, 5)
            assert.equal(p.workers.filter((w) => w.isActive).length, 2)
          }
          const p = state.players[0]!
          p.minorHand = [CARD_ID, WAGE, COMPANION]
          Object.assign(p.resources, resources)
          configure(state)
        },
      }),
    )
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'choice',
      JSON.stringify(r.interaction),
    )
    return getChoiceOptions(r)
  }
  function menu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    const action = options(r).find((o) =>
      o.value.startsWith('action-improvement-'),
    )
    if (action) r = ok(s.resolveChoice(0, action.value))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = menu(s)
    assert.ok(options(r).some((o) => o.value === card && !o.disabled))
    return ok(s.resolveChoice(0, card))
  }
  function passed(r: SessionResponse, card: string) {
    assert.equal(r.state.players[0]!.minorHand.includes(card), false)
    assert.equal(r.state.players[0]!.minorPlayed.includes(card), false)
    assert.equal(
      r.state.players[1]!.minorHand.filter((id) => id === card).length,
      1,
    )
    assert.equal(r.state.players[1]!.minorPlayed.includes(card), false)
    const events = r.state.events.filter(
      (e) =>
        'fromPlayerId' in e &&
        'toPlayerId' in e &&
        'cardId' in e &&
        e.cardId === card,
    )
    assert.equal(events.length, 1)
    const event = events[0]
    assert.ok(
      event &&
        'fromPlayerId' in event &&
        'toPlayerId' in event &&
        'cardId' in event,
    )
    assert.equal(event.cardId, card)
    assert.equal(event.fromPlayerId, r.state.players[0]!.id)
    assert.equal(event.toPlayerId, r.state.players[1]!.id)
    const rows = buildLogPresentationPlan(r.state.events, {
      playerNames: {},
    }).rows.filter(
      (row) =>
        row.logEntry.key === 'log.cardPassed' &&
        row.logEntry.params?.cardId === card,
    )
    assert.equal(rows.length, 1)
    const row = rows[0]
    assert.ok(row)
    assert.deepEqual(row.sourceEventRef, {
      id: event.id,
      seq: event.seq,
      type: event.type,
    })
    assert.equal(row.logEntry.playerRefs?.fromPlayer, event.fromPlayerId)
    assert.equal(row.logEntry.playerRefs?.toPlayer, event.toPlayerId)
  }
  function deny(s: GameSession, card: string) {
    const r = menu(s)
    assert.equal(
      options(r).some((o) => o.value === card && !o.disabled),
      false,
    )
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    const beforeFood = r.state.players[0]!.resources.food
    const retry = ok(s.resolveChoice(0, WAGE))
    assert.equal(retry.state.players[0]!.resources.food, beforeFood + 2)
    assert.equal(retry.state.players[0]!.minorHand.includes(card), true)
  }
  function rooms(p: PlayerState, count: number, family = 2) {
    p.roomTiles = [
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      ...[
        { row: 1, col: 1 },
        { row: 2, col: 1 },
      ].slice(0, count - 2),
    ]
    p.rooms = count
    setActiveWorkerCount(p, family)
    assert.equal(p.workers.length, 5)
    assert.equal(p.workers.filter((w) => w.isActive).length, family)
  }
  function goods(r: SessionResponse, actor = 0) {
    const p = r.state.players[actor]!
    return {
      food: p.resources.food,
      wood: p.resources.wood,
      clay: p.resources.clay,
      grain: p.resources.grain,
    }
  }
  it('printed payment shortage rejects before a legal companion retry', () => {
    for (const food of [0, 1]) {
      const s = setup({ food })
      deny(s, CARD_ID)
      assert.equal(s.getState().state.players[0]!.resources.wood, 0)
    }
  })
  it('food and grain alternatives each pay once for two rooms', () => {
    for (const resources of [
      { food: 2, grain: 0 },
      { food: 0, grain: 1 },
    ]) {
      const r = buy(setup(resources), CARD_ID)
      assert.deepEqual(goods(r), { food: 0, wood: 2, clay: 0, grain: 0 })
      passed(r, CARD_ID)
    }
  })
  it('three rooms and two actual people give one additional wood', () => {
    const r = buy(
      setup({ food: 2 }, (state) => rooms(state.players[0]!, 3)),
      CARD_ID,
    )
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(
      r.state.players[0]!.workers.filter((w) => w.isActive).length,
      2,
    )
    assert.deepEqual(goods(r), { food: 0, wood: 4, clay: 0, grain: 0 })
    passed(r, CARD_ID)
  })
  it('three rooms and three actual people give no additional wood', () => {
    const r = buy(
      setup({ food: 2 }, (state) => rooms(state.players[0]!, 3, 3)),
      CARD_ID,
    )
    assert.equal(r.state.players[0]!.workers.length, 5)
    assert.equal(
      r.state.players[0]!.workers.filter((w) => w.isActive).length,
      3,
    )
    assert.deepEqual(goods(r), { food: 0, wood: 3, clay: 0, grain: 0 })
    passed(r, CARD_ID)
  })
  it('only buyer rooms and people determine the immediate reward', () => {
    const s = setup({ food: 2 }, (state) => rooms(state.players[1]!, 3))
    const r = buy(s, CARD_ID)
    assert.deepEqual(goods(r), { food: 0, wood: 2, clay: 0, grain: 0 })
    assert.deepEqual(goods(r, 1), { food: 40, wood: 0, clay: 0, grain: 0 })
    passed(r, CARD_ID)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, CARD_ID))
  })
  it('actual passing purchase undo restores payment both hands and reward', () => {
    const s = setup({ food: 2 })
    const before = undoRuleSnapshot(s.getState())
    passed(buy(s, CARD_ID), CARD_ID)
    assertUndoRestored(before, s.undoAction())
    const r = buy(s, CARD_ID)
    assert.deepEqual(goods(r), { food: 0, wood: 2, clay: 0, grain: 0 })
    passed(r, CARD_ID)
  })
})
