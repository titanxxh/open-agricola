import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit18Immediate from './_helpers/audit/ae-negative-18-immediate'

describe('ae-negative-18-immediate', () => {
  const { STALL, sessions, save, ok, setup, menu, buy } = audit18Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B008 N1 actual passing card pays one grain for one vegetable without food cost',()=>{const s=setup(STALL,state=>state.players[0]!.resources.grain=1);const r=buy(s,STALL);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.vegetable,1);assert.equal(r.state.players[0]!.resources.food,20);assert.equal(r.state.players[1]!.resources.vegetable,0);save('B008-N1',r)})
  it('B008 N2 no grain and wrong actor reject before a legal alternative',()=>{const s=setup(STALL);const pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,STALL));assertRejectedUnchanged(s,()=>s.resolveChoice(1,'A030_BakingSheet'));const legal=ok(s.resolveChoice(0,'A030_BakingSheet'));assert.equal(legal.state.players[0]!.resources.vegetable,0);assert.ok(legal.state.players[0]!.minorHand.includes(STALL));save('B008-N2',{pending,legal})})
  it('B008 N3 stale and undo cannot duplicate grain exchange or passing',()=>{const s=setup(STALL,state=>state.players[0]!.resources.grain=1);const r=buy(s,STALL);assertRejectedUnchanged(s,()=>s.resolveChoice(0,STALL));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.grain,1);assert.equal(undone.state.players[0]!.resources.vegetable,0);assert.ok(undone.state.players[0]!.minorHand.includes(STALL));assert.ok(!undone.state.players[1]!.minorHand.includes(STALL));const retry=buy(s,STALL);assert.equal(retry.state.players[0]!.resources.vegetable,1);save('B008-N3',{r,undone,retry})})
})
