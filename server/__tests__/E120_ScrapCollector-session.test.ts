import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit49Future from './_helpers/audit/ae-negative-49-future'

describe('ae-negative-49-future', () => {
  const { SCRAP, sessions, save, ok, make, lesson, progress, buy, resources, queue } = audit49Future
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E120 N1 actual purchase creates six alternating deliveries and real round starts pay wood first with no seventh gain',()=>{const{s,bought}=buy(SCRAP),rows=[];for(const[round,wood,clay]of[[5,1,0],[6,1,1],[7,2,1],[8,2,2],[9,3,2],[10,3,3],[11,3,3]] as const){const r=progress(s,round);assert.deepEqual(resources(r),{wood,clay});assert.deepEqual(resources(r,1),{wood:0,clay:0});rows.push(r)}save('E120-N1',{bought,rows})})
  it('E120 N2 only the last two existing round spaces can receive late alternating deliveries and hand card grants nothing',()=>{const{s,bought}=buy(SCRAP,12),thirteen=progress(s,13),fourteen=progress(s,14);assert.deepEqual(resources(thirteen),{wood:1,clay:0});assert.deepEqual(resources(fourteen),{wood:1,clay:1});const last=buy(SCRAP,14).bought;assert.equal(queue(last,SCRAP).length,0);const t=make(SCRAP,false,state=>state.round=12),hand=progress(t,14);assert.deepEqual(resources(hand),{wood:0,clay:0});save('E120-N2',{bought,thirteen,fourteen,last,hand})})
  it('E120 N3 whole purchase undo removes both alternating schedules and replay creates only one of each delivery',()=>{const{s,bought}=buy(SCRAP),u=ok(s.undoAction());assert.equal(queue(u,SCRAP).length,0);const replay=lesson(s,SCRAP),five=progress(s,5),six=progress(s,6);assert.deepEqual(resources(five),{wood:1,clay:0});assert.deepEqual(resources(six),{wood:1,clay:1});assert.equal(queue(replay,SCRAP).length,6);save('E120-N3',{bought,u,replay,five,six})})
})
