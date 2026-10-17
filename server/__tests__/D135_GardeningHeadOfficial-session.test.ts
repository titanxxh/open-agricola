import { describe, it, afterEach } from 'vitest'
import { expectSharedBonuses, setupSharedScoring } from './_helpers/batch07-shared-scoring'

import '../../shared/cards/D/D135_GardeningHeadOfficial'
import assert from 'node:assert/strict'
import * as audit52Competition from './_helpers/audit/ae-negative-52-competition'

describe('D135 Gardening Head Official through Session', () => {
  it.each([
    { amounts: [3, 1, 0], expected: [2, 0, 0] },
    { amounts: [2, 2, 1], expected: [2, 2, 0] },
    { amounts: [0, 0, 0], expected: [2, 2, 2] },
  ])('awards every player tied for the most field vegetables: $amounts', ({ amounts, expected }) => {
    const session = setupSharedScoring('D135_GardeningHeadOfficial')
    session.state.players.forEach((player, index) => {
      const amount = amounts[index] ?? 0
      player.fields = amount > 0
        ? [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: amount }] }]
        : []
    })
    session.loadState(session.state)
    expectSharedBonuses(session, 'D135_GardeningHeadOfficial', expected)
  })
})

describe('ae-negative-52-competition', () => {
  const { sessions, save, ok, make, lesson, progress, bonus, geometry } = audit52Competition
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D135 N1 actual Lessons purchase at all printed boundaries gives exact wood once and whole undo restores the purchase',()=>{for(const[round,wood]of [[5,4],[8,3],[11,2],[12,0],[13,0],[14,0]] as const){const s=make('D135_GardeningHeadOfficial',false,state=>state.round=round),r=lesson(s,'D135_GardeningHeadOfficial');assert.equal(r.state.players[0]!.resources.wood,wood);assert.ok(r.state.players[0]!.occupationPlayed.includes('D135_GardeningHeadOfficial'));if(round===5){const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,0);assert.equal(u.state.players[0]!.occupationPlayed.includes('D135_GardeningHeadOfficial'),false);const replay=lesson(s,'D135_GardeningHeadOfficial');assert.equal(replay.state.players[0]!.resources.wood,4);save('D135-N1-undo',{u,replay})}save(`D135-N1-${round}`,r)}})
  it('D135 N2 natural final harvest scores a unique nonowner winner and each tied eligible player against the actual final geometry',()=>{for(const mode of['unique','tie']){const s=make('D135_GardeningHeadOfficial',true,state=>geometry(state,'D135_GardeningHeadOfficial',mode)),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.deepEqual([0,1,2].map(p=>bonus(r,'D135_GardeningHeadOfficial',p)),[0,2,mode==='tie'?2:0]);save(`D135-N2-${mode}`,r)}})
  it('D135 N3 zero comparison and a hand card cannot invent a unique winner or a purchase reward',()=>{for(const held of[false,true]){const s=make('D135_GardeningHeadOfficial',!held),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.deepEqual([0,1,2].map(p=>bonus(r,'D135_GardeningHeadOfficial',p)),held?[0,0,0]:[2, 2, 2]);assert.equal(r.state.players[0]!.resources.wood,0);save(`D135-N3-${held}`,r)}})
})
