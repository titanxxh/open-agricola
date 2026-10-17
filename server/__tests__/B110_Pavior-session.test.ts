import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B110_Pavior'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit26RoundStart from './_helpers/audit/ae-negative-26-round-start'

const CARD_ID = 'B110_Pavior'

describe('B110_Pavior session', () => {
  it('onEndPreparation gives 1 food when player has stone', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 2
    player.resources.food = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onEndPreparation!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('onEndPreparation does not trigger when player has no stone', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 0
    player.resources.food = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onEndPreparation!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onEndPreparation gives 1 vegetable in round 14', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 14

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 1
    player.resources.vegetable = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onEndPreparation!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.vegetable).toBe(1)
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBeUndefined()
  })

  it('onEndPreparation gives food (not vegetable) in rounds other than 14', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 13

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 1

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onEndPreparation!(state, player))
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.vegetable).toBeUndefined()
  })

})

describe('ae-negative-26-round-start', () => {
  const { PAVIOR, sessions, save, ok, setup, finish, nextRound, make } = audit26RoundStart
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B110 N1 natural preparation after rounds eight and thirteen awards one food or final round vegetable with stone one or two',()=>{for(const[round,stone]of[[8,1],[8,2],[13,1]]){const s=make(PAVIOR,round,true,stone),control=make(PAVIOR,round,false,stone),r=finish(s,nextRound(s,round+1),false),c=finish(control,nextRound(control,round+1),false);assert.equal(r.state.players[0]!.resources.stone,stone);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food+(round===13?0:1));assert.equal(r.state.players[0]!.resources.vegetable,c.state.players[0]!.resources.vegetable+(round===13?1:0));save(`B110-N1-${round}-${stone}`,{r,c})}})
  it('B110 N2 zero own stone or card in hand excludes bonus even with opponent stone supply',()=>{for(const mode of['stone','hand']){const s=setup(PAVIOR,8,state=>{const p=state.players[0]!;p.minorHand=['B004_WoodPile','A006_StorageBarn'];p.occupationPlayed=mode==='stone'?[PAVIOR]:[];p.resources.stone=mode==='stone'?0:1;state.players[1]!.resources.stone=8}),control=setup(PAVIOR,8,state=>{state.players[0]!.minorHand=['B004_WoodPile','A006_StorageBarn'];state.players[0]!.resources.stone=mode==='stone'?0:1;state.players[1]!.resources.stone=8}),r=finish(s,nextRound(s,9),false),c=finish(control,nextRound(control,9),false);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food);save(`B110-N2-${mode}`,{r,c})}})
  it('B110 N3 real midround accumulation action with stone and Pavior creates no preparation reward',()=>{const s=make(PAVIOR),before=ok(s.getState()),r=finish(s,ok(s.takeAction(0,'grain-seeds')),false);assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food);assert.equal(r.state.players[0]!.resources.vegetable,0);save('B110-N3',{before,r})})
})
