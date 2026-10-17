import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit25Immediate from './_helpers/audit/ae-negative-25-immediate'

describe('ae-negative-25-immediate', () => {
  const { TRIDENT, sessions, save, ok, finish, menu, buy, make } = audit25Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D007 N1 real purchase in printed rounds three six nine twelve pays one wood for exact food tier',()=>{for(const[round,food]of[[3,3],[6,4],[9,5],[12,6]]){const s=make(TRIDENT,1,round),a=buy(s,TRIDENT);assert.equal(a.r.state.players[0]!.resources.wood,0);assert.equal(a.r.state.players[0]!.resources.food,100+food);save(`D007-N1-${round}`,a)}})
  it('D007 N2 adjacent unlisted rounds and insufficient wood refuse before real free alternative',()=>{for(const[round,wood]of[[2,1],[4,1],[5,1],[7,1],[8,1],[10,1],[11,1],[13,1],[6,0]]){const s=make(TRIDENT,wood,round),pending=menu(s),error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,TRIDENT)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(r.state.players[0]!.resources.food,100);assert.ok(r.state.players[0]!.minorHand.includes(TRIDENT));save(`D007-N2-${round}-${wood}`,{pending,error,r})}})
  it('D007 N3 whole eligible purchase undo restores one wood payout and passing hand before one replay',()=>{const s=make(TRIDENT,1,6),a=buy(s,TRIDENT),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.equal(undone.state.players[0]!.resources.food,100);assert.ok(undone.state.players[0]!.minorHand.includes(TRIDENT));const retry=buy(s,TRIDENT);assert.equal(retry.r.state.players[0]!.resources.food,104);save('D007-N3',{a,undone,retry})})
})
