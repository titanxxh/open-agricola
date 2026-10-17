import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit42Future from './_helpers/audit/ae-negative-42-future'

describe('ae-negative-42-future', () => {
  const { sessions, ok, save, setup, play, complete, future } = audit42Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C078 N1 actual paid purchase uses five seven nine eleven thirteen offsets rather than next round',()=>{const s=setup('C078_ReedHattedToad',()=>{},false,4),r=play(s,'C078_ReedHattedToad');assert.equal(r.state.players[0]!.resources.food,99);assert.equal(r.state.players[0]!.resources.reed,0);assert.deepEqual(future(r,'C078_ReedHattedToad'),[9,11,13].map(round=>({round,resources:{reed:1}})));const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.food,100);assert.deepEqual(future(u,'C078_ReedHattedToad'),[]);save('C078-N1',{r,u})})
  it('C078 N2 natural eight to nine grants one queued reed and a late thirteen purchase queues none',()=>{const s=setup('C078_ReedHattedToad',()=>{},false,4),bought=play(s,'C078_ReedHattedToad');let r=complete(s,['clay-pit','grain-seeds','fishing']);for(let round=5;round<=7;round++)r=complete(s,['clay-pit','grain-seeds','fishing','forest']);assert.equal(r.state.round,8);assert.equal(r.state.players[0]!.resources.reed,0);r=complete(s,['clay-pit','grain-seeds','fishing','forest']);assert.equal(r.state.round,9);assert.equal(r.state.players[0]!.resources.reed,1);const t=setup('C078_ReedHattedToad',()=>{},false,13),late=play(t,'C078_ReedHattedToad');assert.deepEqual(future(late,'C078_ReedHattedToad'),[]);save('C078-N2',{bought,r,late})})
  it('C078 N3 held Toad never generates future resources at a natural round boundary',()=>{const s=setup('C078_ReedHattedToad',()=>{},false,8),r=complete(s,['clay-pit','grain-seeds','fishing','forest']);assert.equal(r.state.round,9);assert.equal(r.state.players[0]!.resources.reed,0);assert.deepEqual(future(r,'C078_ReedHattedToad'),[]);save('C078-N3',r)})
})
