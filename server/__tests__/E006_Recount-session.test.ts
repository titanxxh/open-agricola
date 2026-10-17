import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit24Resources from './_helpers/audit/ae-negative-24-resources'

describe('ae-negative-24-resources', () => {
  const { RECOUNT, sessions, save, ok, setup, buy } = audit24Resources
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E006 N1 actual passing purchase uses own building resource threshold three four five and excludes food grain and opponent',()=>{for(const count of[3,4,5]){const s=setup(RECOUNT,8,state=>{Object.assign(state.players[0]!.resources,{wood:count,clay:count,reed:count,stone:count,food:100,grain:4,vegetable:4});Object.assign(state.players[1]!.resources,{wood:8,clay:8,reed:8,stone:8})}),a=buy(s,RECOUNT),p=a.r.state.players[0]!;assert.deepEqual(['wood','clay','reed','stone'].map(k=>p.resources[k as 'wood'|'clay'|'reed'|'stone']),Array(4).fill(count+(count>=4?1:0)));assert.equal(p.resources.food,100);assert.equal(p.resources.grain,4);assert.equal(p.resources.vegetable,4);assert.equal(a.r.state.players[1]!.resources.wood,8);save(`E006-N1-${count}`,a)}})
  it('E006 N2 mixed thresholds grant only qualifying types and whole undo replay grants exactly once',()=>{const s=setup(RECOUNT,8,state=>Object.assign(state.players[0]!.resources,{wood:3,clay:4,reed:5,stone:0})),a=buy(s,RECOUNT),undone=ok(s.undoAction());assert.deepEqual(['wood','clay','reed','stone'].map(k=>a.r.state.players[0]!.resources[k as 'wood'|'clay'|'reed'|'stone']),[3,5,6,0]);assert.deepEqual(['wood','clay','reed','stone'].map(k=>undone.state.players[0]!.resources[k as 'wood'|'clay'|'reed'|'stone']),[3,4,5,0]);const retry=buy(s,RECOUNT).r;assert.deepEqual(['wood','clay','reed','stone'].map(k=>retry.state.players[0]!.resources[k as 'wood'|'clay'|'reed'|'stone']),[3,5,6,0]);save('E006-N2',{a,undone,retry})})
})
