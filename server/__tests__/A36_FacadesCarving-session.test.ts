import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { A036_FacadesCarving } from '../../shared/cards/A/A036_FacadesCarving'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A036_FacadesCarving prerequisite', () => {
  it('blocks when wood in supply < current round', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.resources.wood = 4
    expect(session.withCtx(() => meetsCardPrerequisites(player, A036_FacadesCarving, state.round, state))).toBe(false)
  })

  it('allows when wood in supply >= current round', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.resources.wood = 5
    expect(session.withCtx(() => meetsCardPrerequisites(player, A036_FacadesCarving, state.round, state))).toBe(true)
  })
})

describe("A036 command boundaries", () => {
  const FACADES = 'A036_FacadesCarving'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ played = true, round = 14, resources = {} }: {
    played?: boolean
    round?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, food: 20 })
        }
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [FACADES, '__test_placeholder__']
        p.minorPlayed = played ? [FACADES] : []
        Object.assign(p.resources, resources)
        configure(state)
        const owned = state.players.flatMap(p => p.improvements)
        state.availableMajorImprovements = state.availableMajorImprovements.filter(id => !owned.includes(id))
      } }))
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function buy(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    for (let i = 0; i < 3 && !r.state.players[0]!.minorPlayed.includes(FACADES); i++) {
      const candidate = options(r).find(o => o.value === FACADES) ?? options(r).find(o => o.value.startsWith('action-improvement-'))
      assert(candidate && !candidate.disabled, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(0, candidate.value))
    }
    assert(r.state.players[0]!.minorPlayed.includes(FACADES))
    return r
  }
  function denied(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const c = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (c)
        r = ok(s.resolveChoice(0, c.value))
    }
    assert(!r.state.players[0]!.minorPlayed.includes(FACADES))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      assert(!getChoiceOptions(r).some(o => o.value === FACADES && !o.disabled))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, FACADES))
  }
  function bonus(r: SessionResponse, owner = 0) {
    assert(r.scores)
    return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === FACADES)?.score ?? 0
  }
  function cardMenu(s: GameSession, r: SessionResponse, actor = 0) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
      const c = getChoiceOptions(r).find(o => o.sourceCard === FACADES || o.value === FACADES)
      assert(c)
      r = ok(s.resolveChoice(actor, c.value))
    }
    return r
  }
  function accept(s: GameSession, initial: SessionResponse, amount = 1) {
    const r = cardMenu(s, initial)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assert.equal(r.interaction.sourceCard, FACADES)
    const enabled = options(r).filter(option => !option.disabled && option.effectPreview && 'resourcesPaid' in option.effectPreview && option.effectPreview.resourcesPaid?.food === amount)
    assert.equal(enabled.length, 1, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(0, enabled[0]!.value))
  }
  function decline(s: GameSession, r: SessionResponse) {
    r = cardMenu(s, r)
    const c = options(r).find(o => o.value === '__skip__' || o.value === 'skip')
    assert(c)
    return ok(s.resolveChoice(0, c.value))
  }
  function facades({ wood = 8, food = 5, round = 8, played = false, reed = 1 } = {}) {
    return setup({ played, round, resources: { wood, food, clay: 2, reed } })
  }
  it("round wood shortfall rejects forged purchase and exact prerequisite wood is retained", () => {
    denied(facades({ wood: 7 }))
    const s = facades()
    const r = buy(s)
    assert.equal(r.state.players[0]!.resources.wood, 8)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(bonus(r), 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, FACADES))
  })
  it("completed harvest boundaries cap literal food payments and bonus points", () => {
    for (const [round, cap, food] of [[4, 0, 5], [5, 1, 4], [7, 1, 4], [8, 2, 3], [9, 2, 3], [10, 3, 2], [11, 3, 2], [12, 4, 1], [13, 4, 1], [14, 5, 0]]) {
      const s = facades({ wood: round, round })
      let r = buy(s)
      if (cap) {
        const menu = options(r).filter(o => o.value !== '__skip__')
        assert.equal(menu.length, cap)
        r = accept(s, r, cap)
      }
      assert.equal(r.state.players[0]!.resources.food, food)
      assert.equal(r.state.players[0]!.resources.wood, round)
      assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.equal(bonus(r), cap)
    }
  })
  it("insufficient food excludes unaffordable exchanges and exact one food pays one point", () => {
    const s = facades({ food: 1 })
    const r = buy(s)
    assert.equal(options(r).filter(o => !o.disabled && o.value !== '__skip__').length, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'exchange-nine-food'))
    const after = accept(s, r)
    assert.equal(after.state.players[0]!.resources.food, 0)
    assert.equal(bonus(after), 1)
  })
  it("zero food and no completed harvest cannot grant free points", () => {
    for (const config of [{ food: 0, round: 8, wood: 8 }, { food: 5, round: 4, wood: 4 }]) {
      const s = facades(config)
      const r = buy(s)
      assert.equal(r.state.players[0]!.resources.food, config.food)
      assert.equal(bonus(r), 0)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'exchange-one-food'))
    }
  })
  it("declining the food exchange preserves food and prerequisite wood", () => {
    const s = facades()
    const r = decline(s, buy(s))
    assert.equal(r.state.players[0]!.resources.food, 5)
    assert.equal(r.state.players[0]!.resources.wood, 8)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(bonus(r), 0)
  })
  it("already played card and actual opponent ordinary action do not repeat on buy", () => {
    const s = facades({ played: true })
    let r = ok(s.takeAction(0, 'day-laborer'))
    assert.equal(bonus(r), 0)
    confirmNext(s, r)
    r = ok(s.takeAction(1, 'forest'))
    assert.equal(r.state.players[1]!.resources.wood, 3)
    assert.equal(r.state.players[0]!.resources.food, 7)
    assert.equal(bonus(r), 0)
  })
  it("paid exchange rejects wrong actor stale replay and whole action undo retries once", () => {
    const s = facades()
    const before = undoRuleSnapshot(s.getState())
    const r = buy(s)
    const c = options(r).find(option => option.effectPreview && 'resourcesPaid' in option.effectPreview && option.effectPreview.resourcesPaid?.food === 2)
    assert(c)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, c.value))
    const after = ok(s.resolveChoice(0, c.value))
    assert.equal(after.state.players[0]!.resources.food, 3)
    assert.equal(bonus(after), 2)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, c.value))
    assertUndoRestored(before, s.undoAction())
    assert.equal(bonus(accept(s, buy(s), 2)), 2)
  })
  it("two clay and zero reed permit the actual purchase", () => {
    const s = facades({ round: 4, wood: 4, reed: 0 })
    const r = buy(s)
    const control = facades({ round: 4, wood: 4, reed: 1 })
    assert(buy(control).state.players[0]!.minorPlayed.includes(FACADES))
    assert.deepEqual({ played: r.state.players[0]!.minorPlayed.includes(FACADES), clay: r.state.players[0]!.resources.clay, reed: r.state.players[0]!.resources.reed, wood: r.state.players[0]!.resources.wood, food: r.state.players[0]!.resources.food, bonus: bonus(r) }, { played: true, clay: 0, reed: 0, wood: 4, food: 5, bonus: 0 })
  })
  it("actual purchase consumes two clay and retains reed", () => {
    const s = facades({ round: 4, wood: 4, reed: 1 })
    const r = buy(s)
    assert(r.state.players[0]!.minorPlayed.includes(FACADES))
    assert.deepEqual({ clay: r.state.players[0]!.resources.clay, reed: r.state.players[0]!.resources.reed, wood: r.state.players[0]!.resources.wood, food: r.state.players[0]!.resources.food, bonus: bonus(r) }, { clay: 0, reed: 1, wood: 4, food: 5, bonus: 0 })
  })
})
