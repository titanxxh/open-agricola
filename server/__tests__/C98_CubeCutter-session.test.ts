import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C098_CubeCutter'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit46Harvest from './_helpers/audit/ae-negative-46-harvest'

const CARD_ID = 'C098_CubeCutter'

describe('C098_CubeCutter session', () => {
  it('onBuy gives 1 wood', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 1 })
  })

  it('onHarvestFieldPhase returns optional pay wood+food for 1 VP', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 3
    player.resources.food = 5

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onHarvestFieldPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(2)
    // First child: pay wood+food
    expect(children[0].type).toBe('leaf')
    expect(children[0].actionId).toBe('pay')
    expect(children[0].params).toEqual({ wood: 1, food: 1 })
    // Second child: bonus-vp
    expect(children[1].type).toBe('leaf')
    expect(children[1].actionId).toBe('bonus-vp')
    expect(children[1].sourceCard).toBe(CARD_ID)
  })

  it('onHarvestFieldPhase returns undefined when player has no wood', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.food = 5

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onHarvestFieldPhase!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onHarvestFieldPhase returns undefined when player has no food', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 3
    player.resources.food = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onHarvestFieldPhase!(state, player))
    expect(flow).toBeUndefined()
  })

})

describe('ae-negative-46-harvest', () => {
  const { CUBE, sessions, save, ok, make, nextRound, lesson, bonus } = audit46Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C098 N1 actual Lessons grants one immediate wood and whole undo removes it before one real replay',()=>{const s=make(CUBE,false),a=lesson(s,CUBE);assert.equal(a.state.players[0]!.resources.wood,1);assert.equal(bonus(a,CUBE),0);const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,0);assert.ok(u.state.players[0]!.occupationHand.includes(CUBE));const r=lesson(s,CUBE);assert.equal(r.state.players[0]!.resources.wood,1);save('C098-N1',{a,u,r})})
  it('C098 N2 actual harvest field phase pays exactly one wood and one food for one point while decline and zero wood do not',()=>{for(const accept of[true,false]){const s=make(CUBE,true,state=>state.players[0]!.resources.wood=2),r=nextRound(s,8,accept),t=make(CUBE,false,state=>state.players[0]!.resources.wood=2),control=nextRound(t,8,false);assert.equal(r.state.players[0]!.resources.wood,accept?1:2);assert.equal(r.state.players[0]!.resources.food,control.state.players[0]!.resources.food-(accept?1:0));assert.equal(bonus(r,CUBE),accept?1:0);assert.equal(bonus(r,CUBE,1),0);save(`C098-N2-${accept}`,{r,control})}const z=make(CUBE),zero=nextRound(z,8,false);assert.equal(bonus(zero,CUBE),0);assert.equal(zero.state.players[0]!.resources.wood,0);save('C098-N2-zero',zero)})
  it('C098 N3 ordinary work never grants a harvest point and the next distinct harvest can pay once again',()=>{const s=make(CUBE,true,state=>state.players[0]!.resources.wood=2),mid=ok(s.takeAction(0,'reed-bank'));assert.equal(bonus(mid,CUBE),0);const eight=nextRound(s,8,true),nine=nextRound(s,9,false),ten=nextRound(s,10,true);assert.equal(bonus(eight,CUBE),1);assert.equal(bonus(nine,CUBE),1);assert.equal(bonus(ten,CUBE),2);assert.equal(ten.state.players[0]!.resources.wood,0);save('C098-N3',{mid,eight,nine,ten})})
})
