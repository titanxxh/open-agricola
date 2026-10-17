import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit15Scoring from './_helpers/audit/ae-negative-15-scoring'

describe('ae-negative-15-scoring', () => {
  const { REEVE, sessions, save, setup, bonus, read, play, pasture, animals } = audit15Scoring
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A135 N1 complete rounds left zero one two three five six eight nine yield exact wood staircase',()=>{for(const [left,wood] of [[0,0],[1,1],[2,1],[3,2],[5,2],[6,3],[8,3],[9,4]]){const s=setup(REEVE,undefined,false,0,14-left!);const r=play(s,REEVE);assert.equal(r.state.players[0]!.resources.wood,wood);assertRejectedUnchanged(s,()=>s.resolveChoice(0,REEVE));save(`A135-N1-${left}`,r)}})
  it('A135 N2 each player animal sets one through four uses zero one three five bonus independently',()=>{for(const [count,expected] of [[1,0],[2,1],[3,3],[4,5]]){const s=setup(REEVE,state=>{animals(state,0,count!);animals(state,1,2);animals(state,2,1)});const r=read(s,REEVE,expected!);assert.equal(bonus(r,REEVE,1),1);assert.equal(bonus(r,REEVE,2),0);save(`A135-N2-${count}`,r)}})
  it('A135 N3 missing animal species and unplayed Reeve cannot give shared points',()=>{const s=setup(REEVE,state=>{pasture(state,[{row:0,col:1},{row:0,col:2}],'sheep',4);pasture(state,[{row:1,col:1},{row:1,col:2}],'boar',4)});const missing=read(s,REEVE,0);const hand=read(setup(REEVE,state=>animals(state,1,3),false),REEVE,0);assert.equal(bonus(hand,REEVE,1),0);save('A135-N3',{missing,hand})})
})
