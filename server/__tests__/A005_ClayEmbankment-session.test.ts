import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A005_ClayEmbankment'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { buildLogPresentationPlan } from '../../shared/events/log-mapper'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A005_ClayEmbankment'

const setup = ({ clay, food }: { clay: number; food: number }) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.clay = clay
  player.resources.food = food
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (getChoiceOptions(response).some((option) => option.value === CARD_ID)) return response
  const improvement = getChoiceOptions(response).find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response).find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A005 Clay Embankment parity', () => {
  it('A005 S1: four clay grants two clay after paying one food and passes', () => {
    const response = playMinor(setup({ clay: 4, food: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 6, food: 0 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A005 S2: one clay grants no clay after paying one food and passes', () => {
    const response = playMinor(setup({ clay: 1, food: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 0 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A005 S3: no food keeps Clay Embankment unavailable and preserves state', () => {
    const session = setup({ clay: 4, food: 0 })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 4, food: 0 })
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })
})

describe('A005 command boundaries', () => {
  const CARD_ID = 'A005_ClayEmbankment'
  const WAGE = 'B007_Wage',
    COMPANION = 'A016_RammedClay'
  function confirmed(r: SessionResponse, actor = 0) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    return r
  }
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
    return confirmed(ok(s.resolveChoice(0, card)))
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
    const retry = confirmed(ok(s.resolveChoice(0, WAGE)))
    assert.equal(retry.state.players[0]!.resources.food, beforeFood + 2)
    assert.equal(retry.state.players[0]!.minorHand.includes(card), true)
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
  function turn(s: GameSession, actor: number, action: string) {
    let r = s.getState()
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'confirm-next-player'
    )
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return confirmed(ok(s.takeAction(actor, action)), actor)
  }
  it('zero food purchase is denied before legitimate same prompt retry', () => {
    const s = setup({ food: 0, clay: 4 })
    deny(s, CARD_ID)
    assert.equal(s.getState().state.players[0]!.resources.clay, 4)
  })
  it('zero through five initial clay use the printed floor threshold', () => {
    for (const [clay, expected] of [
      [0, 0],
      [1, 1],
      [2, 3],
      [3, 4],
      [4, 6],
      [5, 7],
    ] satisfies Array<[number, number]>) {
      const r = buy(setup({ food: 1, clay }), CARD_ID)
      assert.deepEqual(goods(r), { food: 0, wood: 0, clay: expected, grain: 0 })
      passed(r, CARD_ID)
    }
  })
  it('large initial clay gives only the initial stock reward once', () => {
    const r = buy(setup({ food: 1, clay: 10 }), CARD_ID)
    assert.deepEqual(goods(r), { food: 0, wood: 0, clay: 15, grain: 0 })
    passed(r, CARD_ID)
    const gain = r.state.events.filter(
      (e) => e.type === 'resource.moved' && e.sourceCardId === CARD_ID,
    )
    assert.equal(gain.length, 1)
    const event = gain[0]
    assert.ok(event?.type === 'resource.moved')
    assert.deepEqual(event.resources, { clay: 5 })
  })
  it('opponent clay and passed recipient never change buyer reward', () => {
    const r = buy(
      setup({ food: 1, clay: 1 }, (state) => {
        state.players[1]!.resources.clay = 6
      }),
      CARD_ID,
    )
    assert.deepEqual(goods(r), { food: 0, wood: 0, clay: 1, grain: 0 })
    assert.deepEqual(goods(r, 1), { food: 40, wood: 0, clay: 6, grain: 0 })
    passed(r, CARD_ID)
  })
  it('in hand clay gain and later clay collection do not replay onBuy', () => {
    const unplayed = setup({}, (state) => {
      state.actionSpaces.find((a) => a.id === 'clay-pit')!.resources.clay = 1
    })
    assert.equal(
      turn(unplayed, 0, 'clay-pit').state.players[0]!.resources.clay,
      1,
    )
    const s = setup({ food: 1, clay: 2 }, (state) => {
      state.actionSpaces.find((a) => a.id === 'clay-pit')!.resources.clay = 1
    })
    passed(buy(s, CARD_ID), CARD_ID)
    turn(s, 1, 'forest')
    const r = turn(s, 0, 'clay-pit')
    assert.equal(r.state.players[0]!.resources.clay, 4)
    assert.equal(r.state.players[1]!.resources.clay, 0)
    assert.equal(
      r.state.events.filter(
        (e) => e.type === 'resource.moved' && e.sourceCardId === CARD_ID,
      ).length,
      1,
    )
  })
  it('actual whole passing undo restores clay payment and both card hands', () => {
    const s = setup({ food: 1, clay: 4 })
    const initial = s.getState()
    assert.equal(initial.interaction.stateId, 'idle')
    assert.equal(initial.state.currentPlayerIndex, 0)
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    passed(buy(s, CARD_ID), CARD_ID)
    const restored = s.undoAction()
    assertUndoRestored(before, restored)
    assert.equal(JSON.stringify(restored.interaction), beforeInteraction)
    assert.equal(JSON.stringify(s.getState().interaction), beforeInteraction)
    assert.equal(restored.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    const r = buy(s, CARD_ID)
    assert.deepEqual(goods(r), { food: 0, wood: 0, clay: 6, grain: 0 })
    passed(r, CARD_ID)
  })
})
