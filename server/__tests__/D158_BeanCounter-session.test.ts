import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D158_BeanCounter'
import assert from 'node:assert/strict'
import * as audit56Purchase from './_helpers/audit/ae-negative-56-purchase'

const CARD_ID = 'D158_BeanCounter'

describe('D158 Bean Counter session', () => {
  it('resets two stored food and gains three after using actual round-action slot 8', () => {
    const session = new GameSession(1)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 8

    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.cardStates = { [CARD_ID]: { counters: { food: 2 } } }
    player.resources.food = 1
    setWorkersAtHome(state, player, 2)

    const actionId = 'western-quarry'
    const previousSlot8 = state.roundActionOrder[7]
    const quarrySlot = state.roundActionOrder.indexOf(actionId)
    expect(quarrySlot).toBeGreaterThanOrEqual(0)
    state.roundActionOrder[quarrySlot] = previousSlot8
    state.roundActionOrder[7] = actionId
    state.actionSpaces.find(space => space.id === actionId)!.resources.stone = 1
    session.loadState(state)

    const beforeLogLength = session.state.log.length
    const beforeScores = session.getState().scores
    const resp = session.takeAction(0, actionId)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]).toMatchObject({
      resources: { food: 4 },
      cardStates: { [CARD_ID]: { counters: { food: 0 } } },
    })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
    expect(resp.state.log.length).toBeGreaterThan(beforeLogLength)
    expect(resp.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.cardEffectGain',
        params: expect.objectContaining({ cardId: CARD_ID, gain: { food: 3 } }),
      }),
      expect.objectContaining({
        key: 'log.placeFarmer',
        params: expect.objectContaining({ action: 'actions.western-quarry.name' }),
      }),
    ]))
    expect(resp.scores).toEqual(beforeScores)
  })
})

describe('ae-negative-56-purchase', () => {
  const { sessions, ok, save, make, finish, transition, pasture, legalRounds } = audit56Purchase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D158 N1 three actual Sheep Market uses across natural rounds store one then two food and release exactly three on the third',()=>{const s=make('D158_BeanCounter',st=>{st.roundActionOrder=[...legalRounds];pasture(st.players[0]!);st.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=1},true,5);for(const[index,round]of[[0,5],[1,6],[2,7]]){if(index!>0)transition(s,round!);const before=ok(s.getState()),r=finish(s,ok(s.takeAction(0,'sheep-market')));assert.equal(r.state.players[0]!.resources.food-before.state.players[0]!.resources.food,index===2?3:0);assert.equal(r.state.players[0]!.cardStates.D158_BeanCounter?.counters?.food,index===2?0:index!+1);save(`D158-N1-${index}`,{before,r})}})
  it('D158 N2 base action late round-fourteen space opponent and hand-only card cannot store a Bean Counter food',()=>{for(const mode of['base','late','opponent','hand']){const actor=mode==='opponent'?1:0,s=make('D158_BeanCounter',st=>{st.currentPlayerIndex=actor;st.roundActionOrder=[...legalRounds];st.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=1;if(mode==='late')Object.assign(st.players[0]!.resources,{clay:2,reed:1});},mode!=='hand',14),r=finish(s,ok(s.takeAction(actor,mode==='late'?'farm-redevelopment':mode==='base'?'grain-seeds':'sheep-market')));assert.equal(r.state.players[0]!.cardStates.D158_BeanCounter?.counters?.food??0,0);assert.equal(r.state.players[0]!.resources.food,100);save(`D158-N2-${mode}`,r)}})
})
