import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit49Future from './_helpers/audit/ae-negative-49-future'

describe('ae-negative-49-future', () => {
  const { HEIR, sessions, save, ok, make, lesson, progress, buy, resources, queue } = audit49Future
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E119 N1 real round four purchase retains its deadline through ordinary play and grants four wood and four clay only at round nine',()=>{const{s,bought}=buy(HEIR),rows=[];for(const round of[5,6,7,8,9,10]){const r=progress(s,round);assert.deepEqual(resources(r),round<9?{wood:0,clay:0}:{wood:4,clay:4});assert.deepEqual(resources(r,1),{wood:0,clay:0});rows.push(r)}save('E119-N1',{bought,rows})})
  it('E119 N2 actual round five purchase and a held card cannot invent an early purchase fact or the round nine bundle',()=>{const{s,bought}=buy(HEIR,5),late=progress(s,9);assert.deepEqual(resources(late),{wood:0,clay:0});assert.equal(queue(bought,HEIR).length,0);const t=make(HEIR,false),hand=progress(t,9);assert.deepEqual(resources(hand),{wood:0,clay:0});save('E119-N2',{bought,late,hand})})
  it('E119 N3 whole real early purchase undo removes both deliveries before one replay pays the complete bundle once',()=>{const{s,bought}=buy(HEIR),u=ok(s.undoAction());assert.equal(queue(u,HEIR).length,0);const replay=lesson(s,HEIR),r=progress(s,9);assert.deepEqual(resources(r),{wood:4,clay:4});assert.equal(queue(r,HEIR).length,0);save('E119-N3',{bought,u,replay,r})})
})
