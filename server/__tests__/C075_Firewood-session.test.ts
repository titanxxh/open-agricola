import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit41Resources from './_helpers/audit/ae-negative-41-resources'

describe('ae-negative-41-resources', () => {
  const { sessions, ok, save, opts, setup, finish, select, play, major, complete, openMajor } = audit41Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C075 N1 real purchase pays two food and each natural return home deposits one wood without an early gain',()=>{
   const s=setup('C075_Firewood',()=>{},false,5),bought=play(s,'C075_Firewood');assert.equal(bought.state.players[0]!.resources.food,98);assert.equal(bought.state.players[0]!.cardStates.C075_Firewood?.counters?.wood??0,0);let r=complete(s,['reed-bank','clay-pit','day-laborer']);assert.equal(r.state.round,6);assert.equal(r.state.players[0]!.cardStates.C075_Firewood?.counters?.wood,1);r=complete(s);assert.equal(r.state.round,7);assert.equal(r.state.players[0]!.cardStates.C075_Firewood?.counters?.wood,2);assert.equal(r.state.players[0]!.resources.wood,0);save('C075-N1',{bought,r})
  })
  it('C075 N2 a real Fireplace offers at most four naturally accumulated wood and undo restores all stored wood',()=>{
   const s=setup('C075_Firewood',st=>{st.players[0]!.resources.clay=2},true,5);let r=ok(s.getState());for(let n=0;n<5;n++)r=complete(s);assert.equal(r.state.round,10);assert.equal(r.state.players[0]!.cardStates.C075_Firewood?.counters?.wood,5);const p=openMajor(s,'Major_Fireplace1');assert.ok(!opts(p).some(o=>o.effectPreview?.kind==='resourceMovement'&&o.effectPreview.resources.wood===5));r=finish(s,select(s,p,o=>o.effectPreview?.kind==='resourceMovement'&&o.effectPreview.resources.wood===4),true);const u=ok(s.undoAction());assert.equal(r.state.players[0]!.resources.wood,4);assert.equal(r.state.players[0]!.cardStates.C075_Firewood?.counters?.wood,1);assert.equal(u.state.players[0]!.cardStates.C075_Firewood?.counters?.wood,5);assert.equal(u.state.players[0]!.resources.wood,0);save('C075-N2',{p,r,u})
  })
  it('C075 N3 decline and noncooking improvement preserve stored wood while a held card gains no return home wood',()=>{
   for(const mode of ['decline','noncooking','hand']){const s=setup('C075_Firewood',st=>Object.assign(st.players[0]!.resources,{wood:2,stone:2,clay:2}),mode!=='hand',5);const before=complete(s),r=major(s,mode==='noncooking'?'Major_Joinery':'Major_Fireplace1');assert.equal(r.state.players[0]!.cardStates.C075_Firewood?.counters?.wood??0,mode==='hand'?0:1);assert.equal(r.state.players[0]!.resources.wood,mode==='noncooking'?0:2);assert.equal(before.state.players[0]!.cardStates.C075_Firewood?.counters?.wood??0,mode==='hand'?0:1);save(`C075-N3-${mode}`,r)}
  })
})
