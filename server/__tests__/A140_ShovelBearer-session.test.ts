import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit15Spaces from './_helpers/audit/ae-negative-15-spaces'

describe('ae-negative-15-spaces', () => {
  const { SHOVEL, sessions, save, ok, setup, turn, piles, shovel } = audit15Spaces
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A140 N1 Clay Pit food equals other Hollow pile zero one or four and leaves it unchanged',()=>{for(const other of [0,1,4]){const s=shovel(2,other);const r=turn(s,0,'clay-pit');assert.equal(r.state.players[0]!.resources.clay,2);assert.equal(r.state.players[0]!.resources.food,40+other);assert.equal(r.state.actionSpaces.find(a=>a.id==='hollow')!.resources.clay,other);save(`A140-N1-${other}`,r)}})
  it('A140 N2 Hollow food equals Clay Pit pile and ignores reserve clay',()=>{const s=setup(SHOVEL,state=>{piles(state,'clay-pit','clay',4);piles(state,'hollow','clay',2);state.players[0]!.resources.clay=7});const r=turn(s,0,'hollow');assert.equal(r.state.players[0]!.resources.food,44);assert.equal(r.state.players[0]!.resources.clay,9);assert.equal(r.state.actionSpaces.find(a=>a.id==='clay-pit')!.resources.clay,4);save('A140-N2',r)})
  it('A140 N3 hand unrelated and actual opponent cannot award owner food',()=>{const hs=shovel(2,4,false);const hand=turn(hs,0,'clay-pit');assert.equal(hand.state.players[0]!.resources.food,40);const s=shovel(2,4);const unrelated=turn(s,0,'grain-seeds');const other=turn(s,1,'clay-pit');assert.equal(other.state.players[0]!.resources.food,40);assert.equal(other.state.players[1]!.resources.food,40);save('A140-N3',{hand,unrelated,other})})
  it('A140 N4 whole action undo restores collected pile and food before retry',()=>{const s=shovel(2,4);const first=turn(s,0,'clay-pit');assertRejectedUnchanged(s,()=>s.takeAction(0,'clay-pit'));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,40);assert.equal(undone.state.players[0]!.resources.clay,0);assert.equal(undone.state.actionSpaces.find(a=>a.id==='clay-pit')!.resources.clay,2);const retry=turn(s,0,'clay-pit');assert.equal(retry.state.players[0]!.resources.food,44);save('A140-N4',{first,undone,retry})})
})
