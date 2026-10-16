import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

describe('C041 rule boundaries', () => {

  function options(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    const request = r.interaction.request
    assert.ok(request.kind === 'choice', JSON.stringify(request))
    return request.options
  }

  const pairs = [{ wood: 1, clay: 1 }, { wood: 1, stone: 1 }, { wood: 1, reed: 1 }, { clay: 1, stone: 1 }, { clay: 1, reed: 1 }, { stone: 1, reed: 1 }]

  function farmStore(food = 5, round = 4) {
    return evidence.track(createWorkSession({
      seed: 3041, configure(state) {
        state.round = round
        state.players[0]!.minorPlayed = ['C041_FarmStore']
        state.players.forEach((p, index) => {
          Object.assign(p.resources, { food: index === 0 ? food : 20, wood: 0, clay: 0, reed: 0, stone: 0, vegetable: 0 })
          markAllWorkersUsed(state, p)
        })
      }
    }))
  }

  const storeObserved = (r: SessionResponse) => {
    const p = r.state.players[0]!
    return { food: p.resources.food, vegetable: p.resources.vegetable, wood: p.resources.wood, clay: p.resources.clay, reed: p.resources.reed, stone: p.resources.stone }
  }

  function storeChoice(s: GameSession, initial: SessionResponse) {
    let r = initial
    const trigger = options(r).find(o => o.value === 'C041_FarmStore')
    if (trigger)
      r = s.resolveChoice(0, trigger.value)
    assert.equal(r.state.players[0]!.resources.food, 1)
    return r
  }

  function exchange(s: GameSession, r: SessionResponse, gain: Partial<Resource>) {
    const choice = options(r).find(o => o.effectPreview?.kind === 'resourceExchange' && Object.entries(gain).every(([key, n]) => o.effectPreview?.kind === 'resourceExchange' && Object.entries(o.effectPreview.resourcesGained ?? {}).some(([k, v]) => k === key && v === n)))
    assert.ok(choice, JSON.stringify(r.interaction))
    const selected = s.resolveChoice(0, choice.value)
    assert.equal(selected.ok, true, selected.error)
    return { r: selected, value: choice.value }
  }

  it("after feeding exactly one food buys one vegetable", () => {
    const s = farmStore()
    const r = exchange(s, storeChoice(s, s.performRoundEnd()), { vegetable: 1 }).r
    assert.deepEqual(storeObserved(r), { food: 0, vegetable: 1, wood: 0, clay: 0, reed: 0, stone: 0 })
  })

  it("each of six distinct building pairs has exactly one of each resource", () => {
    for (const pair of pairs) {
      const s = farmStore()
      const r = exchange(s, storeChoice(s, s.performRoundEnd()), pair).r
      assert.deepEqual(storeObserved(r), { food: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0, ...pair })
    }
  })

  it("declining after feeding preserves the final food and grants nothing", () => {
    const s = farmStore()
    storeChoice(s, s.performRoundEnd())
    const r = s.resolveChoice(0, '__skip__')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(storeObserved(r), { food: 1, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
  })

  it("no food after feeding skips the exchange without free goods", () => {
    const s = farmStore(4)
    const r = s.performRoundEnd()
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(storeObserved(r), { food: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
    assert.ok(r.interaction.stateId !== 'wait' || r.interaction.sourceCard !== 'C041_FarmStore')
  })

  it("same resource twice and repeated harvest exchange reject before legal reward", () => {
    const s = farmStore(6)
    const r = s.performRoundEnd()
    assert.equal(r.state.players[0]!.resources.food, 2)
    const offered = options(r)
    assert.equal(offered.some(o => o.effectPreview?.kind === 'resourceExchange' && (o.effectPreview.resourcesGained?.wood ?? 0) >= 2), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'wood:2'))
    const selected = exchange(s, r, { wood: 1, clay: 1 })
    assert.deepEqual(storeObserved(selected.r), { food: 1, vegetable: 0, wood: 1, clay: 1, reed: 0, stone: 0 })
    assertRejectedUnchanged(s, () => s.resolveChoice(0, selected.value))
  })

  it("non harvest round end never offers the exchange", () => {
    const s = farmStore(5, 5)
    const r = s.performRoundEnd()
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.round, 6)
    assert.deepEqual(storeObserved(r), { food: 5, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
  })

  it("completed harvest exposes no undo history and denial changes no goods", () => {
    const s = farmStore()
    const r = exchange(s, storeChoice(s, s.performRoundEnd()), { vegetable: 1 }).r
    assert.deepEqual(storeObserved(r), { food: 0, vegetable: 1, wood: 0, clay: 0, reed: 0, stone: 0 })
    assertRejectedUnchanged(s, () => s.undoStep())
  })
})
