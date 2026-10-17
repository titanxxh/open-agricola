import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit25Immediate from './_helpers/audit/ae-negative-25-immediate'

describe('ae-negative-25-immediate', () => {
  const { MARKET, sessions, save, ok, finish, menu, buy, make } = audit25Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E008 N1 actual two food purchase gains exactly one vegetable and passes with no opponent gain',()=>{const s=make(MARKET,3),a=buy(s,MARKET);assert.equal(a.r.state.players[0]!.resources.food,1);assert.equal(a.r.state.players[0]!.resources.vegetable,1);assert.equal(a.r.state.players[1]!.resources.vegetable,0);save('E008-N1',a)})
  it('E008 N2 one food refuses purchase before a legal free alternative and retains original card',()=>{const s=make(MARKET,1),pending=menu(s),error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,MARKET)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(r.state.players[0]!.resources.food,1);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.ok(r.state.players[0]!.minorHand.includes(MARKET));save('E008-N2',{pending,error,r})})
  it('E008 N3 whole purchase undo restores food vegetable and passing hand before one replay',()=>{const s=make(MARKET,2),a=buy(s,MARKET),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,2);assert.equal(undone.state.players[0]!.resources.vegetable,0);assert.ok(undone.state.players[0]!.minorHand.includes(MARKET));const retry=buy(s,MARKET);assert.equal(retry.r.state.players[0]!.resources.food,0);assert.equal(retry.r.state.players[0]!.resources.vegetable,1);save('E008-N3',{a,undone,retry})})
})
