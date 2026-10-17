import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B083_MuddyPuddles'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit22Muddy from './_helpers/audit/ae-negative-22-muddy'

describe('B083_MuddyPuddles session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('B083_MuddyPuddles')
    player.resources.clay = 5
    session.loadState(state)
    session.devPlayCard(0, 'B083_MuddyPuddles')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('onBuy places 5 goods on stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, 'B083_MuddyPuddles')
    expect(stack).toEqual(['boar', 'food', 'cattle', 'food', 'sheep'])
    expect(stack.length).toBe(5)
  })

  it('anytime: pay 1 clay, gain sheep (top)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 3
    player.resources.sheep = 0
    session.loadState(state)

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'B83-muddy-puddles-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.clay).toBe(2) // 3 - 1
    expect(updatedPlayer.resources.sheep).toBe(1) // top was sheep
    const stack = getCardStack(updatedPlayer, 'B083_MuddyPuddles')
    expect(stack.length).toBe(4)
    expect(stack[stack.length - 1]).toBe('food') // new top
  })

  it('not available without clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B83-muddy-puddles-anytime')
  })

  it('not available with empty stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 5
    player.cardStates!['B083_MuddyPuddles']!.stack = []
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B83-muddy-puddles-anytime')
  })
})

describe('ae-negative-22-muddy', () => {
  const { CARD, sessions, save, ok, ready, finish, menu, buy, ANY, make, enter, take, stack } = audit22Muddy
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B083 N1 actual two clay purchase stacks the five printed goods without granting reserve animals and whole undo removes stack',()=>{const s=make(),{pending,r}=buy(s,CARD);assert.equal(r.state.players[0]!.resources.clay,5);assert.deepEqual(stack(r),['boar','food','cattle','food','sheep']);assert.equal(r.state.players[0]!.resources.sheep,0);assert.equal(r.state.players[0]!.resources.food,100);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,7);assert.deepEqual(stack(undone),[]);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));save('B083-N1',{pending,r,undone})})
  it('B083 N2 five real anytime payments consume top goods in sheep food cattle food boar order and exhaust the stack',()=>{const s=make();buy(s,CARD);const held=enter(s),steps:SessionResponse[]=[];for(const[index,type]of(['sheep','food','cattle','food','boar']as const).entries()){const before=JSON.parse(JSON.stringify(s.getState()))as SessionResponse,r=take(s);assert.equal(r.state.players[0]!.resources.clay,4-index);assert.equal(r.state.players[0]!.resources[type],before.state.players[0]!.resources[type]+1);assert.equal(stack(r).length,4-index);steps.push(JSON.parse(JSON.stringify(r))as SessionResponse)}assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,ANY));assert.equal(s.getState().state.players[0]!.resources.clay,0);save('B083-N2',{held,steps,r:s.getState()})})
  it('B083 N3 one clay rejects initial purchase and postpurchase zero clay hand card or opponent cannot take a free good',()=>{const poor=make(1),pending=menu(poor);assertRejectedUnchanged(poor,()=>poor.resolveChoice(0,CARD));const legal=finish(poor,ok(poor.resolveChoice(0,'B004_WoodPile')));assert.deepEqual(stack(legal),[]);const zero=make(2);buy(zero,CARD);enter(zero);assertRejectedUnchanged(zero,()=>zero.takeAnytimeAction(0,ANY));assert.deepEqual(stack(zero.getState()),['boar','food','cattle','food','sheep']);const hand=make();enter(hand);assertRejectedUnchanged(hand,()=>hand.takeAnytimeAction(0,ANY));const owned=make();buy(owned,CARD);ready(owned);ok(owned.takeAction(1,'farmland'));assertRejectedUnchanged(owned,()=>owned.takeAnytimeAction(1,ANY));save('B083-N3',{pending,legal,zero:zero.getState(),hand:hand.getState(),opponent:owned.getState()})})
  it('B083 N4 whole farmland action undo restores clay top stack and housed animal after a real anytime payment',()=>{const s=make();buy(s,CARD);const before=ready(s);if(before.state.currentPlayerIndex!==0){finish(s,ok(s.takeAction(1,'grain-seeds')));ready(s)}const baseline=JSON.parse(JSON.stringify(s.getState()))as SessionResponse,held=enter(s),r=take(s),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,baseline.state.players[0]!.resources.clay);assert.deepEqual(stack(undone),stack(baseline));assert.equal(undone.state.players[0]!.resources.sheep,0);assert.equal(undone.state.players[0]!.fields.length,0);enter(s);const retry=take(s);assert.equal(retry.state.players[0]!.resources.sheep,1);save('B083-N4',{baseline,held,r,undone,retry})})
})
