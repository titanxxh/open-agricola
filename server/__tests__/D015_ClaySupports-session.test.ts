import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit28Construct from './_helpers/audit/ae-negative-28-construct'

describe('ae-negative-28-construct', () => {
  const { SUPPORT, sessions, save, ok, make, tiles, open, payment, build } = audit28Construct
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D015 N1 real clay room chooses either alternative two clay one wood one reed or ordinary five clay two reed',()=>{for(const paid of[{clay:2,wood:1,reed:1},{clay:5,reed:2}])save(`D015-N1-${paid.clay}`,build(make(SUPPORT,'clay',{clay:5,wood:1,reed:2}),1,paid))})
  it('D015 N2 real two clay rooms apply the replacement independently and pay four clay two wood two reed',()=>{save('D015-N2',build(make(SUPPORT,'clay',{clay:4,wood:2,reed:2}),2,{clay:4,wood:2,reed:2}))})
  it('D015 N3 wood stone rooms and card in hand retain their ordinary five material two reed costs',()=>{for(const[house,key,played]of[['wood','wood',true],['stone','stone',true],['clay','clay',false]]as const)save(`D015-N3-${house}`,build(make(SUPPORT,house,{[key]:5,reed:2},played),1,{[key]:5,reed:2}))})
  it('D015 N4 unaffordable second clay room rejects before one legal replacement payment without duplicate charges',()=>{const s=make(SUPPORT,'clay',{clay:2,wood:1,reed:1}),pending=open(s),rejected=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{rooms:tiles})),r=payment(s,ok(s.commitSelectionChoice(0,{rooms:tiles.slice(0,1)})),{clay:2,wood:1,reed:1});assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.reed,0);save('D015-N4',{pending,rejected,r})})
  it('D015 N5 whole replacement construction undo restores room farm and all payment resources before one replay',()=>{const s=make(SUPPORT,'clay',{clay:4,wood:2,reed:2}),before=ok(s.getState()),a=build(s,2,{clay:4,wood:2,reed:2}),undone=ok(s.undoAction());assert.deepEqual(undone.state.players[0]!.resources,before.state.players[0]!.resources);assert.deepEqual(undone.state.players[0]!.roomTiles,before.state.players[0]!.roomTiles);save('D015-N5',{before,a,undone,retry:build(s,2,{clay:4,wood:2,reed:2})})})
})
