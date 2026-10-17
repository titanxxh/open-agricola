import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount } from '../../shared/domain/player'
import {
  getRoundPersonPlacementDetails,
  recordRoundPlacement,
} from '../../shared/cards/helpers/round-placement'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C119_SkillfulRenovator'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit49Farm from './_helpers/audit/ae-negative-49-farm'

const CARD_ID = 'C119_SkillfulRenovator'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, priorAdultPlacements = 0, placedNewborn = false,
} = {}) => {
  const session = new GameSession(5119, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setActiveWorkerCount(player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID, FILLER]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.clay = 2
  owner.resources.reed = 1
  if (played) {
    const activeNeeded = Math.max(2, priorAdultPlacements + 1 + Number(placedNewborn))
    setActiveWorkerCount(owner, activeNeeded)
    const workers = owner.workers.filter((worker) => worker.isActive)
    const occupiedSpaces = ['forest', 'clay-pit']
    for (let index = 0; index < priorAdultPlacements; index += 1) {
      const space = state.actionSpaces.find((candidate) => candidate.id === occupiedSpaces[index])!
      space.takenBy.push({ playerId: owner.id, workerId: workers[index]!.id })
      recordRoundPlacement(owner, space.id, workers[index]!.id)
    }
    if (placedNewborn) {
      const newborn = workers[priorAdultPlacements]!
      newborn.isNewborn = true
      const newbornSpace = state.actionSpaces.find((space) => space.id === 'reed-bank')!
      newbornSpace.takenBy.push({ playerId: owner.id, workerId: newborn.id })
    }
  }
  session.loadState(state)
  return session
}

const playSkillfulRenovator = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}

const finishRenovation = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let remaining = 12; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    const options = response.interaction.request.options ?? []
    const choice = response.interaction.promptKey === 'ui.interactionChooseRenovationTarget'
      ? options.find((option) => option.value === 'clay')
      : options.find((option) => option.sourceCard === CARD_ID && option.value !== '__skip__')
        ?? (response.interaction.sourceCard === CARD_ID
          ? options.find((option) => option.value !== '__skip__')
          : undefined)
        ?? options.find((option) => option.value === '__skip__' || option.value === 'skip')
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  return response
}

describe('C119 Skillful Renovator parity', () => {
  it('C119 S1: playing Skillful Renovator immediately gains one wood and one clay', () => {
    const response = playSkillfulRenovator(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 3 })
  })

  it('C119 S2: renovating with the first placed person gains one wood', () => {
    const session = setup()
    const response = finishRenovation(session, session.takeAction(0, 'house-redevelopment'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(1)
  })

  it('C119 S3: renovating with the third placed person gains three wood', () => {
    const session = setup({ priorAdultPlacements: 2 })
    const response = finishRenovation(session, session.takeAction(0, 'house-redevelopment'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(3)
  })

  it('C119 S4: a newborn placed earlier in the round is excluded from the renovation payout', () => {
    const session = setup({ priorAdultPlacements: 1, placedNewborn: true })
    const response = finishRenovation(session, session.takeAction(0, 'house-redevelopment'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(2)
  })
})

describe('ae-negative-49-farm', () => {
  const { RENOVATOR, sessions, save, ok, make, lesson, action, rooms, supply } = audit49Farm
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C119 N1 real Skillful Renovator purchase grants one wood and one clay only once through whole undo and replay',()=>{const s=make(RENOVATOR,false),a=lesson(s,RENOVATOR);assert.deepEqual(supply(a),{wood:1,clay:1,reed:0,grain:0,vegetable:0});const u=ok(s.undoAction());assert.deepEqual(supply(u),{wood:0,clay:0,reed:0,grain:0,vegetable:0});const r=lesson(s,RENOVATOR);assert.equal(r.state.players[0]!.resources.wood,1);assert.equal(r.state.players[0]!.resources.clay,1);save('C119-N1',{a,u,r})})
  it('C119 N2 actual first and third placed people renovate real rooms and receive exactly one or three wood after paying all fees',()=>{for(const[count,expected]of[[2,1],[3,3]] as const){const s=make(RENOVATOR,true,state=>{rooms(state,count);Object.assign(state.players[0]!.resources,{clay:count,reed:1})}),prior=[];if(count===3){prior.push(action(s,0,'grain-seeds'));action(s,1,'reed-bank');prior.push(action(s,0,'day-laborer'));action(s,1,'fishing')}const r=action(s,0,'house-redevelopment');assert.equal(r.state.players[0]!.houseType,'clay');assert.equal(r.state.players[0]!.resources.wood,expected);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.resources.reed,0);save(`C119-N2-${count}`,{prior,r})}})
  it('C119 N3 a real newborn is excluded from renovation placement count and unavailable payment hand card or unrelated action gives no reward',()=>{const s=make(RENOVATOR,true,state=>{rooms(state,3,2);Object.assign(state.players[0]!.resources,{clay:3,reed:1})}),birth=action(s,0,'wish-children');assert.equal(birth.state.players[0]!.workers.filter(w=>w.isActive).length,3);action(s,1,'reed-bank');const r=action(s,0,'house-redevelopment');assert.equal(r.state.players[0]!.resources.wood,2);const t=make(RENOVATOR,true,state=>Object.assign(state.players[0]!.resources,{clay:1,reed:1})),bad=assertRejectedUnchanged(t,()=>t.takeAction(0,'house-redevelopment')),legal=ok(t.takeAction(0,'grain-seeds'));assert.equal(legal.state.players[0]!.resources.wood,0);const v=make(RENOVATOR,false,state=>Object.assign(state.players[0]!.resources,{clay:2,reed:1})),hand=action(v,0,'house-redevelopment');assert.equal(hand.state.players[0]!.resources.wood,0);const unrelated=action(make(RENOVATOR),0,'grain-seeds');assert.equal(unrelated.state.players[0]!.resources.wood,0);save('C119-N3',{birth,r,bad,legal,hand,unrelated})})
})
