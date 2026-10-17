import { describe, it, afterEach } from 'vitest'
import { expectSharedBonuses, setupSharedScoring } from './_helpers/batch07-shared-scoring'

import '../../shared/cards/D/D136_AnimalActivist'
import assert from 'node:assert/strict'
import * as audit52Competition from './_helpers/audit/ae-negative-52-competition'

describe('D136 Animal Activist through Session', () => {
  it.each([
    { amounts: [3, 1, 0], expected: [2, 0, 0] },
    { amounts: [2, 2, 1], expected: [2, 2, 0] },
    { amounts: [0, 0, 0], expected: [2, 2, 2] },
  ])('awards every player tied for the most fenced stables: $amounts', ({ amounts, expected }) => {
    const session = setupSharedScoring('D136_AnimalActivist')
    session.state.players.forEach((player, index) => {
      const amount = amounts[index] ?? 0
      player.stableTiles = Array.from({ length: amount }, (_, col) => ({ row: 1, col }))
      player.pastures = amount > 0
        ? [{
            id: `pasture-${index}`, size: amount,
            tiles: Array.from({ length: amount }, (_, col) => ({ row: 1, col })),
            stables: amount, animalType: null, animalCount: 0,
          }]
        : []
    })
    session.loadState(session.state)
    expectSharedBonuses(session, 'D136_AnimalActivist', expected)
  })
})

describe('ae-negative-52-competition', () => {
  const { sessions, save, ok, make, lesson, progress, bonus, geometry } = audit52Competition
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D136 N1 actual Lessons purchase at all printed boundaries gives exact wood once and whole undo restores the purchase',()=>{for(const[round,wood]of [[5,4],[8,3],[11,2],[12,0],[13,0],[14,0]] as const){const s=make('D136_AnimalActivist',false,state=>state.round=round),r=lesson(s,'D136_AnimalActivist');assert.equal(r.state.players[0]!.resources.wood,wood);assert.ok(r.state.players[0]!.occupationPlayed.includes('D136_AnimalActivist'));if(round===5){const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,0);assert.equal(u.state.players[0]!.occupationPlayed.includes('D136_AnimalActivist'),false);const replay=lesson(s,'D136_AnimalActivist');assert.equal(replay.state.players[0]!.resources.wood,4);save('D136-N1-undo',{u,replay})}save(`D136-N1-${round}`,r)}})
  it('D136 N2 natural final harvest scores a unique nonowner winner and each tied eligible player against the actual final geometry',()=>{for(const mode of['unique','tie']){const s=make('D136_AnimalActivist',true,state=>geometry(state,'D136_AnimalActivist',mode)),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.deepEqual([0,1,2].map(p=>bonus(r,'D136_AnimalActivist',p)),[0,2,mode==='tie'?2:0]);save(`D136-N2-${mode}`,r)}})
  it('D136 N3 zero comparison and a hand card cannot invent a unique winner or a purchase reward',()=>{for(const held of[false,true]){const s=make('D136_AnimalActivist',!held),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.deepEqual([0,1,2].map(p=>bonus(r,'D136_AnimalActivist',p)),held?[0,0,0]:[2, 2, 2]);assert.equal(r.state.players[0]!.resources.wood,0);save(`D136-N3-${held}`,r)}})
})
