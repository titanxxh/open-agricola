import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit16Spaces from './_helpers/audit/ae-negative-16-spaces'

describe('ae-negative-16-spaces', () => {
  const { CONJURER, sessions, save, ok, setup, pile, turn } = audit16Spaces
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A155 N1 empty Traveling Players rejects while nonempty piles add one wood and grain',()=>{for(const count of[0,2,5]){const s=setup(CONJURER,state=>pile(state,'traveling-players','food',count));const r=count===0?assertEmptyAccumulationRejected(s,0,'traveling-players'):turn(s,0,'traveling-players');assert.equal(r.state.players[0]!.resources.food,40+count);assert.equal(r.state.players[0]!.resources.wood,count===0?0:1);assert.equal(r.state.players[0]!.resources.grain,count===0?0:1);save(`A155-N1-${count}`,r)}})
  it('A155 N2 unrelated Fishing and Day Laborer cannot grant wood or grain',()=>{for(const space of['fishing','day-laborer']){const r=turn(setup(CONJURER),0,space);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.grain,0);save(`A155-N2-${space}`,r)}})
  it('A155 N3 hand and actual opponent Traveling Players do not grant owner rewards',()=>{const hand=turn(setup(CONJURER,undefined,false),0,'traveling-players');assert.equal(hand.state.players[0]!.resources.wood,0);const s=setup(CONJURER);turn(s,0,'day-laborer');const other=turn(s,1,'traveling-players');assert.equal(other.state.players[0]!.resources.wood,0);assert.equal(other.state.players[0]!.resources.grain,0);assert.equal(other.state.players[1]!.resources.wood,0);save('A155-N3',{hand,other})})
  it('A155 N4 invalid repeated input and whole undo preserve exactly one retry reward',()=>{const s=setup(CONJURER,state=>pile(state,'traveling-players','food',2));const first=turn(s,0,'traveling-players');assertRejectedUnchanged(s,()=>s.takeAction(0,'traveling-players'));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.equal(undone.state.players[0]!.resources.grain,0);assert.equal(undone.state.players[0]!.resources.food,40);const retry=turn(s,0,'traveling-players');assert.equal(retry.state.players[0]!.resources.wood,1);assert.equal(retry.state.players[0]!.resources.grain,1);save('A155-N4',{first,undone,retry})})
})
