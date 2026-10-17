import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit49Future from './_helpers/audit/ae-negative-49-future'

describe('ae-negative-49-future', () => {
  const { WOOD, sessions, save, ok, make, lesson, progress, buy, resources, queue } = audit49Future
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C118 N1 actual round four purchase delivers exactly one wood at each next five real round starts and no sixth reward',()=>{const{s,bought}=buy(WOOD),rows=[];for(const[round,wood]of[[5,1],[6,2],[7,3],[8,4],[9,5],[10,5]] as const){const r=progress(s,round);assert.equal(r.state.round,round);assert.equal(r.state.roundPhase,'work');assert.deepEqual(resources(r),{wood,clay:0});assert.deepEqual(resources(r,1),{wood:0,clay:0});rows.push(r)}assert.equal(queue(rows.at(-1)!,WOOD).length,0);save('C118-N1',{bought,rows})})
  it('C118 N2 near game end only the next existing round pays and a held card cannot grant future wood',()=>{for(const[round,expected]of[[13,1],[14,0]] as const){const{s,bought}=buy(WOOD,round);if(round===14){assert.equal(queue(bought,WOOD).length,0);save('C118-N2-14',bought)}else{const r=progress(s,14);assert.deepEqual(resources(r),{wood:expected,clay:0});assert.equal(queue(r,WOOD).length,0);save('C118-N2-13',{bought,r})}}const s=make(WOOD,false),r=progress(s,9);assert.deepEqual(resources(r),{wood:0,clay:0});save('C118-N2-hand',r)})
  it('C118 N3 whole actual purchase undo cancels all future wood before one legal replay creates one schedule',()=>{const{s,bought}=buy(WOOD),u=ok(s.undoAction());assert.equal(queue(u,WOOD).length,0);assert.ok(u.state.players[0]!.occupationHand.includes(WOOD));const replay=lesson(s,WOOD),r=progress(s,5);assert.deepEqual(resources(r),{wood:1,clay:0});assert.equal(queue(replay,WOOD).length,5);save('C118-N3',{bought,u,replay,r})})
})
