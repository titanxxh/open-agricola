import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C010_BunkBeds'
import assert from 'node:assert/strict'
import { familySize, newbornCount } from '../../shared/domain/player'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit26Beds from './_helpers/audit/ae-negative-26-beds'

const CARD_ID = 'C010_BunkBeds'

describe('C010_BunkBeds session', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('does nothing when not played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 5
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(0)
  })

  it('grants no extra room below 4 rooms', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.rooms = 3
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(0)
  })

  it('grants +1 extra room at exactly 4 rooms', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.rooms = 4
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })

  it('grants +1 extra room at 5 rooms too', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.rooms = 5
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })
})

describe('ae-negative-26-beds', () => {
  const { CARD, sessions, save, ok, finish, menu, make, buy, grow } = audit26Beds
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C010 N1 actual one wood purchase with two major improvements retains card and whole undo restores paid wood',()=>{const s=make(false,4,4),a=buy(s);assert.equal(a.r.state.players[0]!.resources.wood,0);assert.equal(familySize(a.r.state.players[0]!),4);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));assert.ok(!undone.state.players[0]!.minorPlayed.includes(CARD));save('C010-N1',{a,undone})})
  it('C010 N2 one major or no wood rejects purchase before legal free alternative without changing capacity',()=>{for(const mode of['major','wood']){const s=make(false,4,4,mode==='major'?1:2,mode==='wood'?0:1),pending=menu(s),error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.ok(r.state.players[0]!.minorHand.includes(CARD));assert.equal(familySize(r.state.players[0]!),4);save(`C010-N2-${mode}`,{pending,error,r})}})
  it('C010 N3 actual room constrained Family Growth in four rooms activates fifth original family token and whole undo restores supply',()=>{const s=make(true),before=ok(s.getState()),a=grow(s);assert.equal(familySize(a.r.state.players[0]!),5);assert.equal(newbornCount(a.r.state.players[0]!),1);assert.equal(a.r.state.players[0]!.rooms,4);assert.deepEqual(a.r.state.players[0]!.workers.map(w=>w.id),before.state.players[0]!.workers.map(w=>w.id));const undone=ok(s.undoAction());assert.equal(familySize(undone.state.players[0]!),4);assert.equal(newbornCount(undone.state.players[0]!),0);assert.deepEqual(undone.state.players[0]!.workers,before.state.players[0]!.workers);save('C010-N3',{before,a,undone})})
  it('C010 N4 fewer than four rooms hand only or all five tokens active reject ordinary Family Growth before legal action',()=>{for(const mode of['rooms','hand','supply']){const people=mode==='rooms'?3:mode==='supply'?5:4,s=make(mode!=='hand',mode==='rooms'?3:mode==='supply'?5:4,people),error=assertRejectedUnchanged(s,()=>s.takeAction(0,'wish-children')),r=finish(s,ok(s.takeAction(0,'grain-seeds')),false);assert.equal(familySize(r.state.players[0]!),people);assert.equal(newbornCount(r.state.players[0]!),0);assert.equal(r.state.players[0]!.resources.grain,1);save(`C010-N4-${mode}`,{error,r})}})
})
