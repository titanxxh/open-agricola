import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit24Petrified from './_helpers/audit/ae-negative-24-petrified'

describe('ae-negative-24-petrified', () => {
  const { CARD, sessions, save, ok, finish, menu, make, exchange } = audit24Petrified
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D006 N1 actual passing purchase can exchange one two or three wood for exactly that many stone preserving excess',()=>{for(const n of[1,2,3]){const s=make(),pending=menu(s),chosen=ok(s.resolveChoice(0,CARD)),r=exchange(s,chosen,n);assert.equal(r.state.players[0]!.resources.wood,4-n);assert.equal(r.state.players[0]!.resources.stone,n);assert.equal(r.state.players[0]!.resources.food,100);assert.ok(r.state.players[1]!.minorHand.includes(CARD));save(`D006-N1-${n}`,{pending,chosen,r})}})
  it('D006 N2 one occupation rejects purchase before real free alternative without exchanging wood',()=>{const s=make(4,1),pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.equal(r.state.players[0]!.resources.wood,4);assert.equal(r.state.players[0]!.resources.stone,0);assert.ok(r.state.players[0]!.minorHand.includes(CARD));save('D006-N2',{pending,rejected,r})})
  it('D006 N3 decline and zero wood preserve resources and never create stone',()=>{for(const wood of[0,4]){const s=make(wood),pending=menu(s),chosen=ok(s.resolveChoice(0,CARD)),r=finish(s,chosen,false);assert.equal(r.state.players[0]!.resources.wood,wood);assert.equal(r.state.players[0]!.resources.stone,0);save(`D006-N3-${wood}`,{pending,chosen,r})}})
  it('D006 N4 whole action undo restores exchanged wood stone and passing hands before one three-wood replay',()=>{const s=make(),pending=menu(s),chosen=ok(s.resolveChoice(0,CARD)),r=exchange(s,chosen,3),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,4);assert.equal(undone.state.players[0]!.resources.stone,0);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));assert.ok(!undone.state.players[1]!.minorHand.includes(CARD));const second=menu(s),retry=exchange(s,ok(s.resolveChoice(0,CARD)),3);assert.equal(retry.state.players[0]!.resources.wood,1);assert.equal(retry.state.players[0]!.resources.stone,3);save('D006-N4',{pending,chosen,r,undone,second,retry})})
})
