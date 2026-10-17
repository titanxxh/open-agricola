import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D084_FeedPellets'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit43Harvest from './_helpers/audit/ae-negative-43-harvest'

const CARD_ID = 'D084_FeedPellets'

describe('D084_FeedPellets session', () => {
  it('onBuy returns gain 1 sheep flow', () => {
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
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.sheep).toBe(1)
  })

  it('offers exchange during feeding when player has vegetable and sheep', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 2
    player.resources.sheep = 3

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))
    expect(flow).toBeDefined()
    // Only sheep owned → single seq (not xor)
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
  })

  it('offers xor when player has multiple animal types', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 1
    player.resources.sheep = 2
    player.resources.boar = 1

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children.length).toBe(2) // sheep and boar
  })

  it('returns undefined during feeding when no vegetable', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 0
    player.resources.sheep = 5

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))
    expect(flow).toBeUndefined()
  })

  it('returns undefined during feeding when no animals owned', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 3
    player.resources.sheep = 0
    player.resources.boar = 0
    player.resources.cattle = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))
    expect(flow).toBeUndefined()
  })

})

describe('ae-negative-43-harvest', () => {
  const { PELLETS, sessions, save, ok, make, purchase, yard, nextRound } = audit43Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D084 N1 real free purchase gains one sheep only for owner and holding card gives no sheep',()=>{const s=make(PELLETS,false,state=>state.players[0]!.stableTiles=[{row:0,col:2}]),a=purchase(s,PELLETS);assert.equal(a.r.state.players[0]!.resources.sheep,1);assert.equal(a.r.state.players[1]!.resources.sheep,0);const t=make(PELLETS,false),other=ok(t.takeAction(0,'reed-bank'));assert.equal(other.state.players[0]!.resources.sheep,0);save('D084-N1',{a,other})})
  it('D084 N2 natural feeding trades exactly one vegetable for an owned sheep and normal breeding then adds one offspring',()=>{for(const accept of[true,false]){const s=make(PELLETS,true,state=>{yard(state);state.players[0]!.resources.vegetable=2}),before=ok(s.getState()),r=nextRound(s,8,accept);assert.equal(r.state.players[0]!.resources.vegetable,accept?1:2);assert.equal(r.state.players[0]!.resources.sheep,accept?3:1);assert.equal(r.state.players[1]!.resources.sheep,0);save(`D084-N2-${accept}`,{before,r})}})
  it('D084 N3 zero vegetable no animals and midround action cannot manufacture a new animal type',()=>{for(const mode of['vegetable','animals']){const s=make(PELLETS,true,state=>{yard(state,mode==='animals'?0:1);state.players[0]!.resources.vegetable=mode==='vegetable'?0:1}),r=nextRound(s,8,false);assert.equal(r.state.players[0]!.resources.sheep,mode==='animals'?0:1);assert.equal(r.state.players[0]!.resources.boar,0);save(`D084-N3-${mode}`,r)}const s=make(PELLETS,true,state=>{yard(state);state.players[0]!.resources.vegetable=1}),mid=ok(s.takeAction(0,'reed-bank'));assert.equal(mid.state.players[0]!.resources.sheep,1);assert.equal(mid.state.players[0]!.resources.vegetable,1);save('D084-N3-mid',mid)})
})
