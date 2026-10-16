import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

describe('E156 rule boundaries', () => {

  function options(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    const request = r.interaction.request
    assert.ok(request.kind === 'choice', JSON.stringify(request))
    return request.options
  }

  function enterImprovement(s: GameSession, actor = 0, space = 'meeting-place') {
    let r = s.takeAction(actor, space)
    const branch = options(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = s.resolveChoice(actor, branch.value)
    return r
  }

  function chooseCard(s: GameSession, r: SessionResponse, card: string, actor = 0) {
    assert.ok(options(r).some(o => o.value === card), JSON.stringify(r.interaction))
    return s.resolveChoice(actor, card)
  }

  function claypit({ self = false, wood = 1, stone = 1, clay = 0, discounted = false } = {}) {
    return evidence.track(createWorkSession({
      seed: 3156, options: { playerCount: 4 }, configure(state) {
        state.round = 14
        state.players[0]!.occupationPlayed = ['E156_ClaypitOwner']
        state.players.forEach(p => Object.assign(p.resources, { food: 0, clay: 0, wood: 0, stone: 0 }))
        const actor = state.players[self ? 0 : 1]!
        actor.minorHand = ['E030_ChildsToy', 'E047_SyrupTap', 'B007_Wage', 'C054_MarketBooth']
        Object.assign(actor.resources, { wood, stone, clay })
        if (discounted)
          actor.occupationPlayed = ['C122_Bricklayer']
      }
    }))
  }

  function toOpponent(s: GameSession) {
    const r = confirmNext(s, s.takeAction(0, 'grain-seeds'))
    assert.equal(r.state.currentPlayerIndex, 1)
  }

  const clayObserved = (r: SessionResponse) => ({ ownerFood: r.state.players[0]!.resources.food, ownerClay: r.state.players[0]!.resources.clay, actorWood: r.state.players[1]!.resources.wood, built: r.state.players[1]!.minorPlayed.includes('E030_ChildsToy') })

  function assertConfirmation(r: SessionResponse, actor: number, next: number) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait')
    assert.equal(r.interaction.playerIndex, actor)
    assert.ok(r.interaction.request.kind === 'confirm-next-player')
    assert.equal(r.interaction.request.nextPlayerIndex, next)
    assert.equal(r.state.currentPlayerIndex, actor)
  }

  function finishForeign(s: GameSession, initial: SessionResponse) {
    let r = initial
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') {
      r = s.resolveChoice(r.interaction.playerIndex, 'confirm')
      assert.equal(r.ok, true, r.error)
    }
    assertConfirmation(r, 1, 2)
    return r
  }

  it("printed clay alternative rewards owner even when opponent actually pays wood", () => {
    const s = claypit()
    toOpponent(s)
    const r = finishForeign(s, chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1))
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(clayObserved(r), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
  })

  it("owners own printed clay improvement never rewards itself", () => {
    const s = claypit({ self: true })
    const r = chooseCard(s, enterImprovement(s), 'E030_ChildsToy')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.clay], [0, 0])
    assert.ok(r.state.players[0]!.minorPlayed.includes('E030_ChildsToy'))
    assertConfirmation(r, 0, 1)
  })

  it("opponents non clay improvement does not reward the owner", () => {
    const s = claypit()
    toOpponent(s)
    const r = chooseCard(s, enterImprovement(s, 1), 'E047_SyrupTap', 1)
    assert.equal(r.ok, true, r.error)
    assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.clay], [0, 0])
    assert.ok(r.state.players[1]!.minorPlayed.includes('E047_SyrupTap'))
    assertConfirmation(r, 1, 2)
  })

  it("rejected unpaid printed clay purchase leaves no reward before free retry", () => {
    const s = claypit({ wood: 0 })
    toOpponent(s)
    const r = enterImprovement(s, 1)
    assert.equal(options(r).some(o => o.value === 'E030_ChildsToy'), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'E030_ChildsToy'))
    const retry = chooseCard(s, r, 'B007_Wage', 1)
    assert.deepEqual(clayObserved(retry), { ownerFood: 0, ownerClay: 0, actorWood: 0, built: false })
    assert.equal(retry.state.players[1]!.resources.food, 2)
    assertConfirmation(retry, 1, 2)
  })

  it("stale repeated opponent purchase cannot award the owner twice", () => {
    const s = claypit()
    toOpponent(s)
    const r = finishForeign(s, chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1))
    assert.deepEqual(clayObserved(r), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'E030_ChildsToy'))
  })

  it("undo before foreign confirmation restores purchase and leaves no reward", () => {
    const s = claypit()
    toOpponent(s)
    const purchase = chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1)
    assert.equal(purchase.ok, true, purchase.error)
    assert.ok(purchase.interaction.stateId === 'wait')
    assert.equal(purchase.interaction.playerIndex, 1)
    assert.ok(purchase.interaction.request.kind === 'confirm-next-player')
    assert.equal(purchase.interaction.request.nextPlayerIndex, 2)
    assert.equal(purchase.state.currentPlayerIndex, 1)
    assert.deepEqual(clayObserved(purchase), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
    const undone = s.undoAction()
    assert.equal(undone.ok, true, undone.error)
    assert.deepEqual(clayObserved(undone), { ownerFood: 0, ownerClay: 0, actorWood: 1, built: false })
    assert.equal(undone.state.players[0]!.resources.grain, 1)
    assert.equal(undone.state.actionSpaces.flatMap(space => space.takenBy).filter(worker => worker.playerId === undone.state.players[1]!.id).length, 0)
    const retry = finishForeign(s, chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1))
    assert.deepEqual(clayObserved(retry), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
  })

  it("printed clay rewards survive Bricklayers complete actual clay discount", () => {
    const s = claypit({ wood: 0, discounted: true })
    toOpponent(s)
    const r = finishForeign(s, chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1))
    assert.deepEqual(clayObserved(r), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
    assert.equal(r.state.players[1]!.resources.clay, 0)
  })

  it("opponents printed clay major Fireplace rewards the owner exactly once", () => {
    const s = claypit({ wood: 0, clay: 2 })
    toOpponent(s)
    const r = finishForeign(s, chooseCard(s, enterImprovement(s, 1, 'major-improvement'), 'Major_Fireplace1', 1))
    assert.equal(r.ok, true, r.error)
    assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.clay, r.state.players[1]!.resources.clay], [1, 1, 0])
    assert.ok(r.state.players[1]!.improvements.includes('Major_Fireplace1'))
  })
})
