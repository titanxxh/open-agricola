import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit27Capacity from './_helpers/audit/ae-negative-27-capacity'

describe('ae-negative-27-capacity', () => {
  const { BED, sessions, save, ok, finish, make, capacityCase, menu } = audit27Capacity
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E012 N1 actual free purchase requires own planted grain field and awards exactly one printed point',()=>{const s=make(BED,1,true,false),pending=menu(s),r=finish(s,ok(s.resolveChoice(0,BED)),false);assert.ok(r.state.players[0]!.minorPlayed.includes(BED));assert.equal(r.scores![0]!.categories.find(c=>c.key==='cards')!.entries.find(e=>'cardId'in e&&e.cardId===BED)!.score,1);assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.kind,'grain');save('E012-N1',{pending,r})})
  it('E012 N2 bare own field cannot satisfy grain field prerequisite before a real free alternative',()=>{const s=make(BED,1,true,false,false),pending=menu(s),error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,BED)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.ok(r.state.players[0]!.minorHand.includes(BED));save('E012-N2',{pending,error,r})})
  it('E012 N3 actual unfenced stable holds two and stabled one or two cell pasture adds exactly two capacity',()=>{for(const[size,cap]of[[0,2],[1,6],[2,10]])capacityCase(BED,size,true,cap,`E012-N3-${size}`)})
  it('E012 N4 pasture without stable keeps capacity two and whole animal action undo restores herd and finite stable identities',()=>{const a=capacityCase(BED,1,false,2,'E012-N4-capacity'),undone=ok(a.s.undoAction());assert.equal(undone.state.players[0]!.resources.sheep,0);assert.equal(undone.state.players[0]!.stableTiles.length,0);assert.ok(undone.state.players[0]!.minorPlayed.includes(BED));save('E012-N4',{a:{pending:a.pending,r:a.r},undone})})
})
