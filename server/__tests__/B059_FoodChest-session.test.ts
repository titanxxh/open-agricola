import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

import '../../shared/cards/B/B059_FoodChest'
import '../../shared/cards/C/C096_Merchant'
import '../../shared/cards/A/A151_Minstrel'
import '../../shared/cards/D/D117_WoodExpert'
import { markAllWorkersUsed } from '../../shared/domain/player'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit21Foodchest from './_helpers/audit/ae-negative-21-foodchest'

const CARD_ID = 'B059_FoodChest'
const MERCHANT = 'C096_Merchant'
const MINSTREL = 'A151_Minstrel'
const FIREPLACE = 'Major_Fireplace1'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const track = (session: GameSession) => { sessions.push(session); return session }

const setup = (wood: number) => track(createWorkSession({
  seed: 59,
  configure: state => {
    state.currentPlayerIndex = 0
    state.round = 8
    state.availableMajorImprovements = []
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.resources = { ...player.resources, wood, food: 100 }
  },
}))

const playMinor = (session: GameSession, actionId: 'major-improvement' | 'meeting-place') => {
  let response: SessionResponse = session.takeAction(0, actionId)
  for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-')
    )
    if (!option) break
    response = session.resolveChoice(0, option.value)
  }
  return response
}

const chooseImprovement = (session: GameSession, initial: SessionResponse, cardId: string, stopAtPayment = false): SessionResponse => {
  let response = initial
  for (let guard = 0; guard < 8; guard++) {
    if (stopAtPayment && response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'prompt.selectPayment') return response
    const owner = response.state.players[0]!
    if (owner.minorPlayed.includes(cardId) || owner.improvements.includes(cardId)) return response
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('expected purchase interaction')
    const options = response.interaction.request.options ?? []
    const choice = options.find(option => option.value === cardId)
      ?? options.find(option => option.value.startsWith('action-improvement-'))
      ?? ([MERCHANT, MINSTREL].includes(response.interaction.sourceCard ?? '')
        ? options.find(option => option.value !== '__skip__') : undefined)
    expect(choice, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, choice!.value)
  }
  throw new Error('purchase did not finish')
}

const setupMinstrel = (merchant: boolean) => track(createWorkSession({
  seed: 5951, options: { playerCount: 4 },
  configure: state => {
    state.currentPlayerIndex = 0
    state.round = 5
    const stageOne = ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement']
    state.roundActionOrder = [...stageOne, ...state.roundActionOrder.filter(id => !stageOne.includes(id ?? ''))]
    const owner = state.players[0]!
    owner.occupationPlayed = merchant ? [MINSTREL, MERCHANT] : [MINSTREL]
    owner.minorHand = [CARD_ID]
    owner.resources = { ...owner.resources, wood: 1, clay: 2, food: 100 }
    state.availableMajorImprovements = merchant ? [FIREPLACE] : []
    for (const player of state.players) markAllWorkersUsed(state, player)
    const sink = state.actionSpaces.find(space => space.id === '__test-worker-sink__')!
    for (const spaceId of stageOne.slice(0, 3)) {
      state.actionSpaces.find(space => space.id === spaceId)!.takenBy = [sink.takenBy.shift()!]
    }
  },
}))

const foodChestGains = (response: SessionResponse) => response.state.events.filter(event =>
  event.type === 'resource.moved' && event.sourceCardId === CARD_ID && event.resources.food !== undefined)

describe('B059 Food Chest parity', () => {
  it('B059 S1: Major Improvement play grants four food after paying one wood', () => {
    const session = setup(1)

    const response = playMinor(session, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 104 })
  })

  it('B059 S2: Meeting Place play grants two food after paying one wood', () => {
    const session = setup(1)

    const response = playMinor(session, 'meeting-place')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 102 })
  })

  it('B059 S3: no wood keeps Food Chest unavailable on either action space', () => {
    const major = playMinor(setup(0), 'major-improvement')
    const meeting = playMinor(setup(0), 'meeting-place')

    expect(major.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(meeting.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(major.state.players[0]!.resources.food).toBe(100)
    expect(meeting.state.players[0]!.resources.food).toBe(100)
  })
  it('A151 takes the Major Improvement flow and grants four food', () => {
    const session = setupMinstrel(false)
    const response = chooseImprovement(session, session.performRoundEnd(), CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(foodChestGains(response)).toEqual([expect.objectContaining({ resources: { food: 4 } })])
  })

  it.each([false, true])('Merchant second purchase grants two food: Minstrel=%s', minstrel => {
    const session = minstrel ? setupMinstrel(true) : setup(1)
    if (!minstrel) {
      const state = session.getState().state
      state.players[0]!.occupationPlayed = [MERCHANT]
      state.players[0]!.resources.clay = 2
      state.availableMajorImprovements = [FIREPLACE]
      session.loadState(state)
    }
    let response = chooseImprovement(session,
      minstrel ? session.performRoundEnd() : session.takeAction(0, 'major-improvement'), FIREPLACE)
    response = chooseImprovement(session, response, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(foodChestGains(response)).toEqual([expect.objectContaining({ resources: { food: 2 } })])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 101 })
  })

  it.each([false, true])('keeps purchase origin across payment restore: Minstrel=%s', minstrel => {
    let session = minstrel ? setupMinstrel(false) : setup(1)
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('D117_WoodExpert')
    session.loadState(state)
    const begin = () => chooseImprovement(session,
      minstrel ? session.performRoundEnd() : session.takeAction(0, 'major-improvement'), CARD_ID, true)
    const pending = begin()
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'prompt.selectPayment' })
    expect(pending.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(pending.state.players[0]!.resources).toMatchObject({ wood: 1, food: 100 })
    expect(foodChestGains(pending)).toEqual([])
    session = track(new GameSession(JSON.parse(JSON.stringify({
      state: pending.state, sessionCursor: session.createSessionPrivateCursor(),
    }))))
    const restored = session.getState()
    if (restored.interaction.stateId !== 'wait') throw new Error('expected restored payment')
    const payment = restored.interaction.request.options?.find(option => {
      const paid = option.labelParams?.resourcesPaid
      return typeof paid === 'object' && paid !== null && 'wood' in paid && paid.wood === 1
    })
    expect(payment, JSON.stringify(restored.interaction)).toBeDefined()
    expect(session.resolveChoice(1, payment!.value).ok).toBe(false)
    expect(session.resolveChoice(0, '__invalid_payment__').ok).toBe(false)
    expect(session.state.players[0]!.resources).toMatchObject({ wood: 1, food: 100 })
    const completed = session.resolveChoice(0, payment!.value)
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.players[0]!.resources).toMatchObject({ wood: 0, food: 104 })
    expect(foodChestGains(completed)).toEqual([expect.objectContaining({ resources: { food: 4 } })])
    expect(completed.state.events.filter(event => event.type === 'card.played' && event.cardId === CARD_ID)).toHaveLength(1)
    expect(completed.state.events.filter(event => event.type === 'resource.paid' && event.resources.wood === 1)).toHaveLength(1)
    expect(session.resolveChoice(0, payment!.value).ok).toBe(false)
    expect(session.state.players[0]!.resources.food).toBe(104)

  })

  it('undo/retry restores the direct purchase without duplicate payment or reward', () => {
    const session = setup(1)
    const first = playMinor(session, 'major-improvement')
    expect(first.state.players[0]!.resources).toMatchObject({ wood: 0, food: 104 })
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 1, food: 100 })
    expect(undone.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(foodChestGains(undone)).toEqual([])
    const repeated = playMinor(session, 'major-improvement')
    expect(repeated.ok, repeated.error).toBe(true)
    expect(repeated.state.players[0]!.resources).toMatchObject({ wood: 0, food: 104 })
    expect(foodChestGains(repeated)).toHaveLength(1)
    expect(repeated.state.events.filter(event => event.type === 'card.played' && event.cardId === CARD_ID)).toHaveLength(1)
    expect(repeated.state.events.filter(event => event.type === 'resource.paid' && event.resources.wood === 1)).toHaveLength(1)
  })

  it('does not grant Food Chest rewards when purchasing a different card', () => {
    const session = setup(1)
    const state = session.getState().state
    state.availableMajorImprovements = [FIREPLACE]
    state.players[0]!.resources.clay = 2
    session.loadState(state)
    const response = chooseImprovement(session, session.takeAction(0, 'major-improvement'), FIREPLACE)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 100, wood: 1, clay: 0 })
    expect(foodChestGains(response)).toEqual([])
  })

})

describe('ae-negative-21-foodchest', () => {
  const { CARD, sessions, save, ok, setup, finish, menu, buy, major } = audit21Foodchest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B059 N1 real one wood Food Chest purchase on Major Improvement gives exactly four food',()=>{const s=setup(CARD,8,state=>state.players[0]!.resources.wood=1),{pending,r}=major(s);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[1]!.resources.food,100);save('B059-N1',{pending,r,expectedFood:104});assertRuleOutcome(r.state.players[0]!.resources.food,104)})
  it('B059 N2 actual Meeting Place purchase gives only two food and whole undo restores wood and food before replay',()=>{const s=setup(CARD,8,state=>state.players[0]!.resources.wood=1),{pending,r}=buy(s,CARD);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,102);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.equal(undone.state.players[0]!.resources.food,100);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));const retry=buy(s,CARD).r;assert.equal(retry.state.players[0]!.resources.food,102);save('B059-N2',{pending,r,undone,retry})})
  it('B059 N3 cost shortfall invalid actor and hand on Meeting Place give no Food Chest benefit',()=>{const s=setup(CARD),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD));assertRejectedUnchanged(s,()=>s.resolveChoice(1,'B004_WoodPile'));const legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.resources.food,100);assert.ok(legal.state.players[0]!.minorHand.includes(CARD));save('B059-N3',{pending,legal})})
})
