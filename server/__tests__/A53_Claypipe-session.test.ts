import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { playImprovement } from '../../shared/actions/effects/improvement'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import '../../shared/cards/A/A053_Claypipe'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
describe('A053_Claypipe session flow', () => {
  it('triggers Claypipe at round 7 round-end after being played mid-work phase', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 7
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
      player.resources.food = 10
    })
    const player = state.players[0]!
    player.minorHand = ['A053_Claypipe']
    player.resources.clay = 1
    state.workPhaseObtainedResources[player.id] = { clay: 8 }
    const playResult = session.withCtx(() => playImprovement(state, player, 'minor:A053_Claypipe', 'any', undefined, undefined, session.actionHooks))
    expect(playResult.type).toBe('ok')
    expect(player.cardStates?.A053_Claypipe?.infobox).toBe('8 / 7')
    session.loadState(state)
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(8)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.cardStates?.A053_Claypipe?.infobox).toBe('0 / 7')
    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A053_Claypipe',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 2 })
  })
  it('triggers after taking Hollow and then playing Claypipe via Meeting Place in the same round', () => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 4 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 7
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    setActiveWorkerCount(state.players[0]!, 2)
    state.players[0]!.resources.food = 10
    state.players[0]!.resources.clay = 1
    state.players[0]!.minorHand = ['A053_Claypipe']
    setActiveWorkerCount(state.players[1]!, 1)
    markAllWorkersUsed(state, state.players[1]!)
    state.players[1]!.resources.food = 10
    setActiveWorkerCount(state.players[2]!, 0)
    setActiveWorkerCount(state.players[3]!, 0)
    const hollow = state.actionSpaces.find((space) => space.id === 'hollow-4')
    expect(hollow).toBeDefined()
    hollow!.resources.clay = 8
    session.loadState(state)
    let resp = session.takeAction(0, 'hollow-4')
    expect(resp.ok).toBe(true)
    expect(resp.state.workPhaseObtainedResources[resp.state.players[0]!.id]).toEqual({ clay: 8 })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.currentPlayerIndex).toBe(0)
    resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const improvementOption = getChoiceOptions(resp)?.find((option) => option.value.startsWith('action-improvement-'))
    expect(improvementOption).toBeDefined()
    resp = session.resolveChoice(0, improvementOption!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const claypipeOption = getChoiceOptions(resp)?.find((option) => option.value === 'A053_Claypipe')
      if (claypipeOption) {
        resp = session.resolveChoice(0, claypipeOption.value)
        expect(resp.ok).toBe(true)
      }
    }
    expect(resp.state.players[0]!.cardStates?.A053_Claypipe?.infobox).toBe('8 / 7')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(8)
    expect(resp.state.roundPhase).toBe('work')
    const harvestLog = resp.state.log.find(
      (entry) => entry.key === 'log.harvest' && entry.params?.round === 7,
    )
    expect(harvestLog).toBeDefined()
    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A053_Claypipe',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 2 })
  })
})
describe("A053 command boundaries", () => {
  const BOAT = 'A051_DriftNetBoat', PIPE = 'A053_Claypipe'
  function setup({ played = true, round = 5, resources = {}, forest = 3, fishing = 2, pigs = 1, configure = () => { } }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    forest?: number
    fishing?: number
    pigs?: number
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = ["A053_Claypipe"]
        else
          p.minorHand.push("A053_Claypipe")
        Object.assign(p.resources, resources)
        stock(state, 'forest', 'wood', forest)
        stock(state, 'fishing', 'food', fishing)
        stock(state, 'pig-market', 'boar', pigs)
        configure(state)
      } }))
    assert.equal(s.getState().state.roundPhase, 'work')
    assert.equal(s.getState().interaction.stateId, 'idle')
    return s
  }
  function stock(state: GameState, space: string, resource: 'wood' | 'food' | 'boar' | 'clay', count: number) {
    const action = state.actionSpaces.find(a => a.id === space)
    assert.ok(action)
    action.resources[resource] = count
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); const r = ok(s.takeAction(actor, space)); assert.equal(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id), true); return r; }
  function choices(r: SessionResponse) { ok(r); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return getChoiceOptions(r); }
  function enter(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function offered(r: SessionResponse, card: string) { return choices(r).some(o => o.value === card && !o.disabled); }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.equal(offered(r, card), true)
    const result = ok(s.resolveChoice(0, card))
    assert.equal(result.state.players[0]!.minorPlayed.includes(card), card !== 'A006_StorageBarn')
    assert.equal(result.state.players[0]!.minorHand.includes(card), false)
    if (card === 'A006_StorageBarn') {
      assert.equal(result.state.players[1]!.minorHand.includes(card), true)
      const gains = result.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === card)
      assert.equal(gains.length, 1)
      const gain = gains[0]!
      assert.ok(gain.type === 'resource.moved')
      assert.deepEqual(gain.resources, { wood: 1 })
      return result
    }
    const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.equal(event.actorPlayerId, result.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources ?? {}, card === BOAT ? { wood: 1, reed: 1 } : card === PIPE ? { clay: 1 } : {})
    return result
  }
  function values(r: SessionResponse, actor = 0) { return r.state.players[actor]!.resources; }
  function bonus(r: SessionResponse, card: string, amount: number) {
    const events = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === card && e.reason === 'cardEffect')
    assert.equal(events.length, amount === 0 ? 0 : 1)
    if (amount) {
      const e = events[0]!
      assert.ok(e.type === 'resource.moved')
      assert.deepEqual(e.resources, { food: amount })
      assert.deepEqual(e.to, { kind: 'player', playerId: r.state.players[0]!.id })
    }
  }
  function retryFree(s: GameSession, card: string) { const r = enter(s); assert.equal(offered(r, card), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); return buy(s, r, 'A054_Credit'); }
  function barn(s: GameSession) { return buy(s, enter(s), 'A006_StorageBarn'); }
  function addBarn(state: GameState) { state.players[0]!.minorHand.push('A006_StorageBarn'); state.players[0]!.improvements = ['Major_Joinery']; }
  function endAfterFirst(s: GameSession, ownerSpace = 'grain-seeds') { turn(s, 1, 'fishing'); turn(s, 0, ownerSpace); const r = confirmNext(s, turn(s, 1, 'reed-bank')); assert.equal(r.state.round, 6); assert.equal(r.state.roundPhase, 'work'); assert.equal(r.interaction.stateId, 'idle'); return r; }
  function endAfterSecond(s: GameSession) { const r = confirmNext(s, turn(s, 1, 'reed-bank')); assert.equal(r.state.round, 6); assert.equal(r.state.roundPhase, 'work'); return r; }
  function assertReset(r: SessionResponse) { assert.equal(r.state.players[0]!.cardStates[PIPE]?.infobox, '0 / 7'); }
  it("actual one clay purchase initializes a zero work phase total", () => { const s = setup({ played: false, resources: { clay: 1 } }); const r = buy(s, enter(s), PIPE); assert.equal(values(r).clay, 0); assertReset(r); return { clay: 0, counter: '0 / 7', cardPlayed: true }; })
  it("zero clay rejects a forged purchase before a legal retry", () => { const s = setup({ played: false }); const r = retryFree(s, PIPE); assert.equal(values(r).clay, 0); assert.equal(r.state.players[0]!.minorHand.includes(PIPE), true); return { clay: 0, cardInHand: true }; })
  it("six actually obtained wood grant no returning home food", () => { const s = setup({ forest: 6 }); const first = turn(s, 0, 'forest'); assert.deepEqual(first.state.workPhaseObtainedResources[first.state.players[0]!.id], { wood: 6 }); const r = endAfterFirst(s); assert.equal(values(r).food, 20); assertReset(r); bonus(r, PIPE, 0); return { obtainedWood: 6, food: 20, nextRound: 6 }; })
  it("seven actually obtained wood grant exactly two returning home food", () => { const s = setup({ forest: 7 }); const first = turn(s, 0, 'forest'); assert.deepEqual(first.state.workPhaseObtainedResources[first.state.players[0]!.id], { wood: 7 }); const r = endAfterFirst(s); assert.equal(values(r).food, 22); assertReset(r); bonus(r, PIPE, 2); return { obtainedWood: 7, food: 22, nextRound: 6 }; })
  it("carried building resources and new grain or food do not satisfy the threshold", () => { const s = setup({ resources: { wood: 7 } }); turn(s, 0, 'grain-seeds'); const r = endAfterFirst(s, 'day-laborer'); assert.equal(values(r).wood, 7); assert.equal(values(r).food, 22); bonus(r, PIPE, 0); return { carriedWood: 7, food: 22 }; })
  it("seven resources obtained before the actual purchase count at return home", () => { const s = setup({ played: false, forest: 7, resources: { clay: 1 } }); turn(s, 0, 'forest'); turn(s, 1, 'fishing'); const bought = buy(s, enter(s), PIPE); assert.equal(bought.state.players[0]!.cardStates[PIPE]?.infobox, '7 / 7'); assert.equal(values(bought).clay, 0); const r = endAfterSecond(s); assert.equal(values(r).wood, 7); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { paidClay: 1, wood: 7, food: 22 }; })
  it("three wood and four clay count together as seven building resources", () => { const s = setup({ configure(state) { stock(state, 'clay-pit', 'clay', 4); } }); turn(s, 0, 'forest'); const r = endAfterFirst(s, 'clay-pit'); assert.equal(values(r).wood, 3); assert.equal(values(r).clay, 4); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { wood: 3, clay: 4, food: 22 }; })
  it("spending obtained wood on a real boat purchase preserves the seven gained threshold", () => { const s = setup({ forest: 7, resources: { reed: 1 }, configure(state) { state.players[0]!.minorHand.push(BOAT); } }); turn(s, 0, 'forest'); turn(s, 1, 'fishing'); buy(s, enter(s), BOAT); const r = endAfterSecond(s); assert.equal(values(r).wood, 6); assert.equal(values(r).reed, 0); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { wood: 6, reed: 0, food: 22 }; })
  it("six accumulated wood plus Storage Barn wood count as seven actual gains", () => { const s = setup({ forest: 6, configure: addBarn }); turn(s, 0, 'forest'); turn(s, 1, 'fishing'); barn(s); const r = endAfterSecond(s); assert.equal(values(r).wood, 7); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { wood: 7, food: 22 }; })
  it("opponent gains do not contribute to the owner threshold", () => { const s = setup({ forest: 7 }); turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'day-laborer'); const r = endAfterSecond(s); assert.equal(values(r).food, 22); assert.equal(values(r, 1).food, 20); assert.equal(values(r, 1).wood, 7); bonus(r, PIPE, 0); return { ownerFood: 22, opponentFood: 20, opponentWood: 7 }; })
  it("seven wood gained while Claypipe stays in hand grant no bonus", () => { const s = setup({ played: false, forest: 7 }); turn(s, 0, 'forest'); const r = endAfterFirst(s); assert.equal(values(r).wood, 7); assert.equal(values(r).food, 20); bonus(r, PIPE, 0); return { wood: 7, food: 20 }; })
  it("a second natural work phase resets prior gains and does not pay twice", () => { const s = setup({ forest: 7 }); turn(s, 0, 'forest'); const first = endAfterFirst(s); assert.equal(values(first).food, 22); const initialBonuses = first.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === PIPE).length; assert.equal(initialBonuses, 1); turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'day-laborer'); const r = confirmNext(s, turn(s, 1, 'reed-bank')); assert.equal(r.state.round, 7); assert.equal(values(r).food, 24); assertReset(r); assert.equal(r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === PIPE).length, initialBonuses); return { round: 7, food: 24 }; })
  it("undo restores the actual gain ledger before a single returning home bonus", () => { const s = setup({ forest: 7 }); const before = undoRuleSnapshot(s.getState()); turn(s, 0, 'forest'); assertUndoRestored(before, s.undoAction()); const retried = turn(s, 0, 'forest'); assert.deepEqual(retried.state.workPhaseObtainedResources[retried.state.players[0]!.id], { wood: 7 }); const r = endAfterFirst(s); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { oaRestored: true, retryFood: 22 }; })
})
