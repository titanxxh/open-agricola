import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C005_Remodeling'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit23Purchase from './_helpers/audit/ae-negative-23-purchase'

const CARD_ID = 'C005_Remodeling'

const setup = ({ food = 1, houseType = 'wood', majors = 0 } = {}) => {
  const session = new GameSession(5, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources = { ...player.resources, food, clay: 0 }
  player.houseType = houseType as typeof player.houseType
  player.rooms = 2
  player.improvements = ['Major_ClayOven', 'Major_Joinery'].slice(0, majors)
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response: SessionResponse = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-'),
    )
    if (!option) break
    response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('C005 Remodeling parity', () => {
  it('C005 S1: two clay rooms and two major improvements grant four clay after paying one food', () => {
    const response = playMinor(setup({ houseType: 'clay', majors: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 4 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('C005 S2: major improvements grant clay when the house is not clay', () => {
    const response = playMinor(setup({ majors: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('C005 S3: no clay rooms or major improvements grants no clay', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 0 })
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('C005 S4: no food keeps Remodeling unavailable', () => {
    const response = playMinor(setup({ food: 0, houseType: 'clay', majors: 2 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 0 })
  })
})

describe('ae-negative-23-purchase', () => {
  const { REMODEL, sessions, save, ok, setup, ready, finish, menu, buy, prepare } = audit23Purchase
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C005 N1 actual one food purchase counts own clay rooms and majors while wooden stone and minor cards do not add clay',()=>{for(const house of['wood','clay','stone']as const)for(const majors of[0,2]){const s=prepare(REMODEL,0,0,house,majors),{pending,r}=buy(s,REMODEL);assert.equal(r.state.players[0]!.resources.food,99);assert.equal(r.state.players[0]!.resources.clay,(house==='clay'?2:0)+majors);assert.equal(r.state.players[1]!.resources.clay,0);assert.equal(r.state.players[0]!.houseType,house);save(`C005-N1-${house}-${majors}`,{pending,r})}})
  it('C005 N2 zero food rejects before free passing alternative without clay reward',()=>{const s=prepare(REMODEL,0,0,'clay',2,0),pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,REMODEL)),legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.resources.clay,0);save('C005-N2',{pending,rejected,legal})})
  it('C005 N3 whole purchase undo restores clay food rooms and passing cards before one replay',()=>{const s=prepare(REMODEL,0,0,'clay',2),{pending,r}=buy(s,REMODEL),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,0);assert.equal(undone.state.players[0]!.resources.food,100);assert.equal(undone.state.players[0]!.rooms,2);assert.ok(undone.state.players[0]!.minorHand.includes(REMODEL));const retry=buy(s,REMODEL).r;assert.equal(retry.state.players[0]!.resources.clay,4);save('C005-N3',{pending,r,undone,retry})})
  it('C005 N4 actual major purchase before later passing purchase counts only the owned built major',()=>{const s=setup(REMODEL,8,state=>{state.players[0]!.resources.clay=2});let pending=ok(s.takeAction(0,'major-improvement'));if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice'){const o=pending.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)pending=ok(s.resolveChoice(0,o.value))}const built=finish(s,ok(s.resolveChoice(0,'Major_Fireplace1')),false);assert.equal(built.state.players[0]!.resources.clay,0);assert.ok(built.state.players[0]!.improvements.includes('Major_Fireplace1'));ready(s);finish(s,ok(s.takeAction(1,'grain-seeds')));const a=buy(s,REMODEL);assert.equal(a.r.state.players[0]!.resources.clay,1);assert.equal(a.r.state.players[0]!.resources.food,99);save('C005-N4',{pending,built,a})})
})
