import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit52Competition from './_helpers/audit/ae-negative-52-competition'

describe('ae-negative-52-competition', () => {
  const { sessions, save, ok, make, lesson, progress, bonus, geometry } = audit52Competition
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E135 N1 actual Lessons purchase at all printed boundaries gives exact wood once and whole undo restores the purchase',()=>{for(const[round,wood]of [[5,4],[8,3],[11,2],[12,1],[13,1],[14,0]] as const){const s=make('E135_Pickler',false,state=>state.round=round),r=lesson(s,'E135_Pickler');assert.equal(r.state.players[0]!.resources.wood,wood);assert.ok(r.state.players[0]!.occupationPlayed.includes('E135_Pickler'));if(round===5){const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,0);assert.equal(u.state.players[0]!.occupationPlayed.includes('E135_Pickler'),false);const replay=lesson(s,'E135_Pickler');assert.equal(replay.state.players[0]!.resources.wood,4);save('E135-N1-undo',{u,replay})}save(`E135-N1-${round}`,r)}})
  it('E135 N2 natural final harvest scores a unique nonowner winner and each tied eligible player against the actual final geometry',()=>{for(const mode of['unique','tie']){const s=make('E135_Pickler',true,state=>geometry(state,'E135_Pickler',mode)),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.deepEqual([0,1,2].map(p=>bonus(r,'E135_Pickler',p)),[0,3,mode==='tie'?3:0]);save(`E135-N2-${mode}`,r)}})
  it('E135 N3 zero comparison and a hand card cannot invent a unique winner or a purchase reward',()=>{for(const held of[false,true]){const s=make('E135_Pickler',!held),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.deepEqual([0,1,2].map(p=>bonus(r,'E135_Pickler',p)),held?[0,0,0]:[3, 3, 3]);assert.equal(r.state.players[0]!.resources.wood,0);save(`E135-N3-${held}`,r)}})
})
