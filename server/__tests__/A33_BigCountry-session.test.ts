import { expectWait } from './_helpers/trigger-select'
import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { positionKey, getAllTilePositions } from '../../shared/domain/farm'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { describe, expect, it } from 'vitest'
import { A033_BigCountry } from '../../shared/cards/A/A033_BigCountry'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A033_BigCountry prerequisite', () => {
  it('blocks when there is at least one free farmyard space', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, A033_BigCountry, state.round, state))).toBe(false)
  })

  it('allows when all 15 farmyard spaces are used', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    // Cover the 15 spaces by stuffing them as roomTiles for the prereq check.
    player.roomTiles = getAllTilePositions()
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    expect(session.withCtx(() => meetsCardPrerequisites(player, A033_BigCountry, state.round, state))).toBe(true)
  })
})

describe('A033 Big Country parity', () => {
  const CARD_ID = 'A033_BigCountry'

  const FILLER = '__test_placeholder__'

  const setup = ({ round = 10, unused = 0 } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6033, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const player = state.players[0]!
    player.minorHand = [CARD_ID, FILLER]
    const occupied = new Set(player.roomTiles.map(positionKey))
    player.fields = getAllTilePositions()
      .filter((position) => !occupied.has(positionKey(position)))
      .slice(0, 13 - unused)
      .map((position) => ({ ...position, stacks: [] }))
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? getChoiceOptions(response) ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (options(response).some((option) => option.value === CARD_ID)) return response
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(expectWait(response).interaction.playerIndex, improvement.value)
    return response
  }

  const playCard = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    if (card) response = session.resolveChoice(expectWait(response).interaction.playerIndex, card.value)
    return response
  }

  it('A033 S1: filling all farmyard spaces in round ten allows Big Country and gains four bonus points and eight food', () => {
    const response = playCard(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(8)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(4)
  })

  it('A033 S2: one unused farmyard space keeps Big Country unavailable', () => {
    const response = enterMinor(setup({ unused: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A033 S3: in round fourteen Big Country can be played but gains no food or bonus points', () => {
    const response = playCard(setup({ round: 14 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe("A033 command boundaries", () => {
  const BIG = 'A033_BigCountry'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ round = 14 }: {
    round?: number
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    return sessionEvidence.track(createWorkSession({ seed: 42, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        for (const player of state.players)
          Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.minorHand = [BIG, '__test_placeholder__']
        configure(state)
      } }))
  }
  function options(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) {
    const o = options(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    assert.ok(r.interaction.stateId === 'wait')
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  function buyMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = buyMenu(s)
    if (r.state.players[0]!.minorPlayed.includes(card))
      {
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
        assert.equal(r.interaction.playerIndex, 0)
        assert.equal(r.state.currentPlayerIndex, 0)
        return r
      }
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    const completedResponse = ok(s.resolveChoice(0, card))
    assert.ok(completedResponse.interaction.stateId === 'wait' && completedResponse.interaction.request.kind === 'confirm-next-player', JSON.stringify(completedResponse.interaction))
    assert.equal(completedResponse.interaction.playerIndex, 0)
    assert.equal(completedResponse.state.currentPlayerIndex, 0)
    return completedResponse
  }
  function deny(s: GameSession, card: string) {
    const r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  }
  function score(r: SessionResponse, card: string) {
    assert.ok(r.scores)
    assert.ok(r.scores[0])
    return r.scores[0].categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === card)?.score ?? 0
  }
  function vp(r: SessionResponse, card: string) {
    return r.state.players[0]!.cardStates[card]?.counters?.bonusVp ?? 0
  }
  function fullFarm(state: GameState, unused = 0, stable = false) {
    const p = state.players[0]!
    const occupied = new Set(p.roomTiles.map(positionKey))
    const free = getAllTilePositions().filter(t => !occupied.has(positionKey(t)))
    p.fields = free.slice(0, 13 - unused - Number(stable)).map(t => ({ ...t, stacks: [] }))
    if (stable)
      p.stableTiles = [free.at(-1)!]
  }
  it("one unused farm space rejects forged purchase before full farm control", () => {
    deny(setup({ round: 10 }, state => fullFarm(state, 1)), BIG)
    const r = buy(setup({ round: 10 }, state => fullFarm(state)), BIG)
    assert.ok(r.state.players[0]!.minorPlayed.includes(BIG))
    assert.equal(r.state.players[0]!.resources.food, 48)
    assert.equal(vp(r, BIG), 4)
  })
  it("immediate points and food survive stale rejection and whole purchase undo retry", () => {
    const s = setup({ round: 10 }, state => fullFarm(state))
    const before = undoRuleSnapshot(s.getState())
    const beforeInteraction = JSON.stringify(s.getState().interaction)
    let r = buy(s, BIG)
    assert.equal(r.state.players[0]!.resources.food, 48)
    assert.equal(vp(r, BIG), 4)
    assert.equal(score(r, BIG), 4)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, BIG))
    const undone = s.undoAction()
    assertUndoRestored(before, undone)
    assert.equal(JSON.stringify(undone.interaction), beforeInteraction)
    r = buy(s, BIG)
    assert.equal(vp(r, BIG), 4)
    assert.equal(score(r, BIG), 4)
    assert.equal(r.state.players[0]!.resources.food, 48)
  })
  it("complete rounds exclude current round and finite unfenced stable uses last tile", () => {
    for (const { round, bonus, food } of [{ round: 13, bonus: 1, food: 42 }, { round: 14, bonus: 0, food: 40 }]) {
      const r = buy(setup({ round }, state => fullFarm(state, 0, true)), BIG)
      assert.ok(r.state.players[0]!.minorPlayed.includes(BIG))
      assert.equal(vp(r, BIG), bonus)
      assert.equal(score(r, BIG), bonus)
      assert.equal(r.state.players[0]!.resources.food, food)
    }
  })
})
