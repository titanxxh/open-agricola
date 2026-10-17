import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit22Purchase from './_helpers/audit/ae-negative-22-purchase'

describe('ae-negative-22-purchase', () => {
  const { GIFT, sessions, save, ok, setup, finish, menu, buy, OCCS, prepare, points } = audit22Purchase
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B073 N1 real three occupation purchase awards the exact two three four five room reward and one point',()=>{for(const rooms of[2,3,4,5]){const s=prepare(GIFT,5,3,rooms),{pending,r}=buy(s,GIFT),p=r.state.players[0]!;assert.equal(p.resources.reed,0);assert.equal(p.resources.vegetable,rooms===2||rooms===5?1:0);assert.equal(p.resources.food,rooms===3?101:100);assert.equal(p.resources.grain,rooms===4?1:0);assert.equal(p.rooms,rooms);assert.equal(p.roomTiles.length,rooms);assert.equal(points(r,GIFT),1);save(`B073-N1-${rooms}`,{pending,r})}})
  it('B073 N2 two occupations or absent reed refuses before a legal free improvement without the room reward',()=>{for(const mode of['occupation','reed']){const s=setup(GIFT,5,state=>{const p=state.players[0]!;p.resources.reed=mode==='reed'?0:1;p.occupationPlayed=OCCS.slice(0,mode==='occupation'?2:3)}),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,GIFT));const legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.resources.vegetable,0);save(`B073-N2-${mode}`,{pending,legal})}})
  it('B073 N3 whole purchase undo restores reed crops card and one point before one legal replay',()=>{const s=prepare(GIFT,5,3),{pending,r}=buy(s,GIFT),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.reed,1);assert.equal(undone.state.players[0]!.resources.vegetable,0);assert.ok(undone.state.players[0]!.minorHand.includes(GIFT));const retry=buy(s,GIFT).r;assert.equal(retry.state.players[0]!.resources.vegetable,1);assert.equal(points(retry,GIFT),1);save('B073-N3',{pending,r,undone,retry})})
})
