import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { Field } from '../../shared/contract/types'

import '../../shared/cards/B/B093_Confidant'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit26Delayed from './_helpers/audit/ae-negative-26-delayed'

const CARD_ID = 'B093_Confidant'
const FILLER = '__test_placeholder__'

const setup = ({ food = 4, round = 5 }: { food?: number; round?: number } = {}) => {
  const session = createWorkSession({ seed: 5393 + round, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  state.players[0]!.occupationHand = [CARD_ID]
  state.players[0]!.resources.food = food
  state.players[0]!.resources.wood = 4
  state.players[0]!.resources.grain = 1
  state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] } satisfies Field]
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.ok || !response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return response
}

const schedule = (session: GameSession, response: SessionResponse, count: 2 | 3 | 4) => {
  expect(response.ok, response.error).toBe(true)
  const alreadyScheduled = response.state.futureMeeples.filter(
    (entry) => entry.cardId === CARD_ID && entry.resources.food === 1,
  )
  if (alreadyScheduled.length === count) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const options = response.interaction.request.options ?? []
  expect(options).toHaveLength(Math.min(4, 14 - response.state.round) - 1)
  expect(options.some((option) => option.value === '__skip__')).toBe(false)
  const option = options[count - 2]
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const scheduledRounds = (response: SessionResponse) =>
  response.state.futureMeeples
    .filter((entry) => entry.cardId === CARD_ID && entry.resources.food === 1)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

describe('B093 Confidant parity', () => {
  it('B093 S1: two food schedules two future food tokens and spends both food', () => {
    const session = setup({ food: 2 })

    const response = schedule(session, play(session), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(scheduledRounds(response)).toEqual([6, 7])
  })

  it('B093 S2: four food can choose the four-round schedule', () => {
    const session = setup({ food: 4 })

    const response = schedule(session, play(session), 4)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(scheduledRounds(response)).toEqual([6, 7, 8, 9])
  })

  it('B093 S3: at round twelve only the two-round schedule remains and is selected automatically', () => {
    const response = play(setup({ food: 4, round: 12 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(scheduledRounds(response)).toEqual([13, 14])
  })

  it('B093 S4: one food makes Confidant unavailable without consuming the Lessons action', () => {
    const response = play(setup({ food: 1 }))

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.occupationHand).toContain(CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.workers.some((worker) => worker.action === 'lessons')).toBe(false)
    expect(scheduledRounds(response)).toEqual([])
  })

  it('B093 S5: receiving future food offers a skippable Sow-or-Build-Fences choice', () => {
    const session = setup({ food: 2 })
    const scheduled = schedule(session, play(session), 2)
    expect(scheduledRounds(scheduled)).toEqual([6, 7])
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    const foodBefore = state.players[0]!.resources.food
    session.loadState(state)

    let response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(foodBefore)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the scheduled receipt')
    const receipt = response.interaction.request.options?.find(option => option.labelKey === 'actions.receive.name')
    expect(receipt).toBeDefined()
    expect(response.state.events.some(event => event.type === 'futureMeeple.resolved' && event.cardId === CARD_ID && event.round === 6)).toBe(false)
    response = session.resolveChoice(response.interaction.playerIndex, receipt!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(foodBefore + 1)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the optional action after receipt')
    expect(response.interaction.request.options?.some(option => option.sourceCard === CARD_ID && !option.disabled)).toBe(true)
    const skipped = session.resolveChoice(response.interaction.playerIndex, '__pass__')
    expect(skipped.ok, skipped.error).toBe(true)
    expect(scheduledRounds(skipped)).toEqual([7])
  })
})

describe('ae-negative-26-delayed', () => {
  const { CONF, sessions, save, ok, finish, make, lesson, future, schedule, nextRound, bonusMenu } = audit26Delayed
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B093 N1 actual first Lessons pays exactly two three or four supply food and schedules only that many next rounds',()=>{for(const n of[2,3,4]){const s=make(CONF),a=lesson(s,CONF),r=schedule(s,a.chosen,n);assert.equal(r.state.players[0]!.resources.food,100-n);assert.deepEqual(future(r,CONF),Array.from({length:n},(_,i)=>({round:9+i,resources:{food:1}})));save(`B093-N1-${n}`,{a,r})}})
  it('B093 N2 below two food rejects the actual occupation before a legal free first occupation alternative',()=>{const s=make(CONF,1),pending=ok(s.takeAction(0,'lessons')),error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,CONF)),r=finish(s,pending.state.players[0]!.occupationPlayed.includes('A110_Roughcaster')?pending:ok(s.resolveChoice(0,'A110_Roughcaster')),false);assert.ok(r.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'));assert.equal(future(r,CONF).length,0);assert.equal(r.state.players[0]!.resources.food,1);assert.ok(r.state.players[0]!.occupationHand.includes(CONF));save('B093-N2',{pending,error,r})})
  it('B093 N3 natural scheduled food delivery offers optional sow or fence and declining consumes no extra resource',()=>{const s=make(CONF),a=lesson(s,CONF),r=schedule(s,a.chosen,2),pending=nextRound(s,9),before=ok(pending),after=finish(s,pending,false);assert.equal(future(after,CONF).length,1);assert.equal(after.state.players[0]!.fields[0]!.stacks.length,0);assert.equal(after.state.players[0]!.fenceSegments.length,0);assert.equal(after.state.players[0]!.resources.grain,before.state.players[0]!.resources.grain);assert.equal(after.state.players[0]!.resources.wood,before.state.players[0]!.resources.wood);save('B093-N3',{a,r,pending,after})})
  it('B093 N4 whole Lessons undo restores paid food card and future schedule before one replay',()=>{const s=make(CONF),a=lesson(s,CONF),r=schedule(s,a.chosen,4),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,100);assert.ok(undone.state.players[0]!.occupationHand.includes(CONF));assert.equal(future(undone,CONF).length,0);const second=lesson(s,CONF),retry=schedule(s,second.chosen,2);assert.equal(future(retry,CONF).length,2);save('B093-N4',{a,r,undone,second,retry})})
  it('B093 N5 natural scheduled food accepts one ordinary sow or four wood fencing without placing a worker',()=>{for(const kind of['sow','fence']as const){const s=make(CONF),a=lesson(s,CONF),scheduled=schedule(s,a.chosen,2),pending=nextRound(s,9),before=ok(pending),selected=bonusMenu(s,pending,kind),r=finish(s,ok(s.commitSelectionChoice(0,kind==='sow'?{crops:[{row:0,col:1,crop:'grain'}]}:{edges:['H-0-2','H-1-2','V-0-2','V-0-3'],palisadeEdges:[]})),false);assert.equal(future(r,CONF).length,1);assert.equal(selected.state.players[0]!.resources.food,scheduled.state.players[0]!.resources.food+1);assert.equal(r.state.players[0]!.resources.food,selected.state.players[0]!.resources.food);assert.deepEqual(r.state.players[0]!.workers,before.state.players[0]!.workers);if(kind==='sow'){assert.equal(r.state.players[0]!.resources.grain,before.state.players[0]!.resources.grain-1);assert.deepEqual(r.state.players[0]!.fields[0]!.stacks,[{kind:'grain',remaining:3}]);assert.equal(r.state.players[0]!.resources.wood,before.state.players[0]!.resources.wood)}else{assert.equal(r.state.players[0]!.resources.wood,before.state.players[0]!.resources.wood-4);assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.equal(r.state.players[0]!.pastures[0]!.tiles.length,1);assert.equal(r.state.players[0]!.resources.grain,before.state.players[0]!.resources.grain)}save(`B093-N5-${kind}`,{a,scheduled,pending,selected,r})}})
})
