import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit52Competition from './_helpers/audit/ae-negative-52-competition'

describe('ae-negative-52-competition', () => {
  const { sessions, save, ok, make, lesson, progress, bonus, geometry } = audit52Competition
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C136 N1 actual Lessons purchase at all printed boundaries gives exact wood once and whole undo restores the purchase',()=>{for(const[round,wood]of [[5,4],[8,3],[11,2],[12,0],[13,0],[14,0]] as const){const s=make('C136_RanchProvost',false,state=>state.round=round),r=lesson(s,'C136_RanchProvost');assert.equal(r.state.players[0]!.resources.wood,wood);assert.ok(r.state.players[0]!.occupationPlayed.includes('C136_RanchProvost'));if(round===5){const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,0);assert.equal(u.state.players[0]!.occupationPlayed.includes('C136_RanchProvost'),false);const replay=lesson(s,'C136_RanchProvost');assert.equal(replay.state.players[0]!.resources.wood,4);save('C136-N1-undo',{u,replay})}save(`C136-N1-${round}`,r)}})
  it('C136 N2 natural final harvest scores a unique nonowner winner and each tied eligible player against the actual final geometry',()=>{for(const mode of['unique','tie']){const s=make('C136_RanchProvost',true,state=>geometry(state,'C136_RanchProvost',mode)),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.equal(r.state.players[0]!.pastures.length,2);assert.equal(r.state.players[0]!.fenceSegments.length,7);assert.deepEqual([0,1,2].map(p=>bonus(r,'C136_RanchProvost',p)),[0,3,mode==='tie'?3:0]);save(`C136-N2-${mode}`,r)}})
  it('C136 N3 zero comparison and a hand card cannot invent a unique winner or a purchase reward',()=>{for(const held of[false,true]){const s=make('C136_RanchProvost',!held),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.deepEqual([0,1,2].map(p=>bonus(r,'C136_RanchProvost',p)),held?[0,0,0]:[0, 0, 0]);assert.equal(r.state.players[0]!.resources.wood,0);save(`C136-N3-${held}`,r)}})
})
