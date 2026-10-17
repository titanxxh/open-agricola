import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit49Future from './_helpers/audit/ae-negative-49-future'

describe('ae-negative-49-future', () => {
  const { CLAY, sessions, save, ok, make, lesson, progress, buy, resources, queue } = audit49Future
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D120 N1 actual round four purchase pays only future rounds six through fourteen one clay at each real start',()=>{const{s,bought}=buy(CLAY),rows=[];for(const[round,clay]of[[5,0],[6,1],[7,2],[8,3],[9,4],[10,5],[11,6],[12,7],[13,8],[14,9]] as const){const r=progress(s,round);assert.deepEqual(resources(r),{wood:0,clay});assert.deepEqual(resources(r,1),{wood:0,clay:0});rows.push(r)}save('D120-N1',{bought,rows})})
  it('D120 N2 actual late purchase never pays past or current dates and held card cannot receive clay',()=>{const{s,bought}=buy(CLAY,8),rows=[];for(const[round,clay]of[[9,1],[10,2],[11,3],[12,4],[13,5],[14,6]] as const){const r=progress(s,round);assert.deepEqual(resources(r),{wood:0,clay});rows.push(r)}const last=buy(CLAY,14).bought;assert.equal(queue(last,CLAY).length,0);const t=make(CLAY,false,state=>state.round=8),hand=progress(t,9);assert.deepEqual(resources(hand),{wood:0,clay:0});save('D120-N2',{bought,rows,last,hand})})
  it('D120 N3 whole purchase undo removes clay delivery facts and one replay gives only one clay in round six',()=>{const{s,bought}=buy(CLAY),u=ok(s.undoAction());assert.equal(queue(u,CLAY).length,0);const replay=lesson(s,CLAY),r=progress(s,6);assert.deepEqual(resources(r),{wood:0,clay:1});assert.equal(queue(replay,CLAY).length,9);save('D120-N3',{bought,u,replay,r})})
})
