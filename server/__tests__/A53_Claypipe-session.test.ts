import { describe, expect, it, afterEach } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { playImprovement } from '../../shared/actions/effects/improvement'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import '../../shared/cards/A/A051_DriftNetBoat'
import '../../shared/cards/A/A052_ThrowingAxe'
import '../../shared/cards/A/A053_Claypipe'
import '../../shared/cards/A/A006_StorageBarn'
import assert from 'node:assert/strict'
import { assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Triggers from './_helpers/audit/ae-negative-08-triggers'
describe('A053_Claypipe session flow', () => {
  it('triggers Claypipe at round 7 round-end after being played mid-work phase', () => {
    const session = new GameSession(42)
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
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
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
    const improvementOption = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    expect(improvementOption).toBeDefined()
    resp = session.resolveChoice(0, improvementOption!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const claypipeOption = resp.interaction.request.options?.find((option) => option.value === 'A053_Claypipe')
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

describe('ae-negative-08-triggers', () => {
  const { BOAT, PIPE, sessions, scenario, setup, stock, turn, enter, buy, values, bonus, retryFree, barn, addBarn, endAfterFirst, endAfterSecond, assertReset } = audit08Triggers
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  scenario('A053 N1 actual one clay purchase initializes a zero work phase total', () => { const s = setup(PIPE, { played: false, resources: { clay: 1 } }); const r = buy(s, enter(s), PIPE); assert.equal(values(r).clay, 0); assertReset(r); return { clay: 0, counter: '0 / 7', cardPlayed: true } })
  scenario('A053 N2 zero clay rejects a forged purchase before a legal retry', () => { const s = setup(PIPE, { played: false }); const r = retryFree(s, PIPE); assert.equal(values(r).clay, 0); assert.equal(r.state.players[0]!.minorHand.includes(PIPE), true); return { clay: 0, cardInHand: true } })
  scenario('A053 N3 six actually obtained wood grant no returning home food', () => { const s = setup(PIPE, { forest: 6 }); const first = turn(s, 0, 'forest'); assert.deepEqual(first.state.workPhaseObtainedResources[first.state.players[0]!.id], { wood: 6 }); const r = endAfterFirst(s); assert.equal(values(r).food, 20); assertReset(r); bonus(r, PIPE, 0); return { obtainedWood: 6, food: 20, nextRound: 6 } })
  scenario('A053 N4 seven actually obtained wood grant exactly two returning home food', () => { const s = setup(PIPE, { forest: 7 }); const first = turn(s, 0, 'forest'); assert.deepEqual(first.state.workPhaseObtainedResources[first.state.players[0]!.id], { wood: 7 }); const r = endAfterFirst(s); assert.equal(values(r).food, 22); assertReset(r); bonus(r, PIPE, 2); return { obtainedWood: 7, food: 22, nextRound: 6 } })
  scenario('A053 N5 carried building resources and new grain or food do not satisfy the threshold', () => { const s = setup(PIPE, { resources: { wood: 7 } }); turn(s, 0, 'grain-seeds'); const r = endAfterFirst(s, 'day-laborer'); assert.equal(values(r).wood, 7); assert.equal(values(r).food, 22); bonus(r, PIPE, 0); return { carriedWood: 7, food: 22 } })
  scenario('A053 N6 seven resources obtained before the actual purchase count at return home', () => { const s = setup(PIPE, { played: false, forest: 7, resources: { clay: 1 } }); turn(s, 0, 'forest'); turn(s, 1, 'fishing'); const bought = buy(s, enter(s), PIPE); assert.equal(bought.state.players[0]!.cardStates[PIPE]?.infobox, '7 / 7'); assert.equal(values(bought).clay, 0); const r = endAfterSecond(s); assert.equal(values(r).wood, 7); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { paidClay: 1, wood: 7, food: 22 } })
  scenario('A053 N7 three wood and four clay count together as seven building resources', () => { const s = setup(PIPE, { configure(state) { stock(state, 'clay-pit', 'clay', 4) } }); turn(s, 0, 'forest'); const r = endAfterFirst(s, 'clay-pit'); assert.equal(values(r).wood, 3); assert.equal(values(r).clay, 4); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { wood: 3, clay: 4, food: 22 } })
  scenario('A053 N8 spending obtained wood on a real boat purchase preserves the seven gained threshold', () => { const s = setup(PIPE, { forest: 7, resources: { reed: 1 }, configure(state) { state.players[0]!.minorHand.push(BOAT) } }); turn(s, 0, 'forest'); turn(s, 1, 'fishing'); buy(s, enter(s), BOAT); const r = endAfterSecond(s); assert.equal(values(r).wood, 6); assert.equal(values(r).reed, 0); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { wood: 6, reed: 0, food: 22 } })
  scenario('A053 N9 six accumulated wood plus Storage Barn wood count as seven actual gains', () => { const s = setup(PIPE, { forest: 6, configure: addBarn }); turn(s, 0, 'forest'); turn(s, 1, 'fishing'); barn(s); const r = endAfterSecond(s); assert.equal(values(r).wood, 7); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { wood: 7, food: 22 } })
  scenario('A053 N10 opponent gains do not contribute to the owner threshold', () => { const s = setup(PIPE, { forest: 7 }); turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'day-laborer'); const r = endAfterSecond(s); assert.equal(values(r).food, 22); assert.equal(values(r, 1).food, 20); assert.equal(values(r, 1).wood, 7); bonus(r, PIPE, 0); return { ownerFood: 22, opponentFood: 20, opponentWood: 7 } })
  scenario('A053 N11 seven wood gained while Claypipe stays in hand grant no bonus', () => { const s = setup(PIPE, { played: false, forest: 7 }); turn(s, 0, 'forest'); const r = endAfterFirst(s); assert.equal(values(r).wood, 7); assert.equal(values(r).food, 20); bonus(r, PIPE, 0); return { wood: 7, food: 20 } })
  scenario('A053 N12 a second natural work phase resets prior gains and does not pay twice', () => { const s = setup(PIPE, { forest: 7 }); turn(s, 0, 'forest'); const first = endAfterFirst(s); assert.equal(values(first).food, 22); const initialBonuses = first.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === PIPE).length; assert.equal(initialBonuses, 1); turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'day-laborer'); const r = confirmNext(s, turn(s, 1, 'reed-bank')); assert.equal(r.state.round, 7); assert.equal(values(r).food, 24); assertReset(r); assert.equal(r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === PIPE).length, initialBonuses); return { round: 7, food: 24 } })
  scenario('A053 N13 undo restores the actual gain ledger before a single returning home bonus', () => { const s = setup(PIPE, { forest: 7 }); const before = undoRuleSnapshot(s.getState()); turn(s, 0, 'forest'); assertUndoRestored(before, s.undoAction()); const retried = turn(s, 0, 'forest'); assert.deepEqual(retried.state.workPhaseObtainedResources[retried.state.players[0]!.id], { wood: 7 }); const r = endAfterFirst(s); assert.equal(values(r).food, 22); bonus(r, PIPE, 2); return { oaRestored: true, retryFood: 22 } })
})
