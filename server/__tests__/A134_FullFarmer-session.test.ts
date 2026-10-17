import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit15Scoring from './_helpers/audit/ae-negative-15-scoring'

describe('ae-negative-15-scoring', () => {
  const { FULL, sessions, save, ok, setup, read, play, pasture, animals } = audit15Scoring
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A134 N1 real Lessons purchase grants exactly one wood one clay and undo restores both',()=>{const s=setup(FULL,undefined,false);const first=play(s,FULL);assert.equal(first.state.players[0]!.resources.wood,1);assert.equal(first.state.players[0]!.resources.clay,1);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.equal(undone.state.players[0]!.resources.clay,0);const retry=play(s,FULL);assert.equal(retry.state.players[0]!.resources.wood,1);assert.equal(retry.state.players[0]!.resources.clay,1);save('A134-N1',{first,undone,retry})})
  it('A134 N2 empty underfull and exactly full ordinary pasture score zero zero one',()=>{for(const [animals,expected] of [[0,0],[1,0],[2,1]]){const s=setup(FULL,state=>pasture(state,[{row:0,col:1}],'sheep',animals!));save(`A134-N2-${animals}`,read(s,FULL,expected!))}})
  it('A134 N3 stable doubles capacity and two filled pastures still score one each',()=>{for(const [animals,expected] of [[2,0],[3,0],[4,1]]){const s=setup(FULL,state=>pasture(state,[{row:0,col:1}],'sheep',animals!,0,true));save(`A134-N3-${animals}`,read(s,FULL,expected!))}const two=setup(FULL,state=>{pasture(state,[{row:0,col:1}],'sheep',2);pasture(state,[{row:0,col:2}],'boar',2)});save('A134-N3-two',read(two,FULL,2))})
  it('A134 N4 household pet unfenced stable hand and opponent do not count full own pastures',()=>{const pet=setup(FULL,state=>{const p=state.players[0]!;p.houseAnimals = { '2-0': 'sheep' };p.resources.sheep=1;p.stableTiles=[{row:0,col:1}];p.stableAnimals={'0-1':{animalType:'boar',animalCount:1}};p.resources.boar=1});const a=read(pet,FULL,0);const hand=read(setup(FULL,state=>pasture(state,[{row:0,col:1}],'sheep',2),false),FULL,0);const other=read(setup(FULL,state=>pasture(state,[{row:0,col:1}],'sheep',2,1)),FULL,0);save('A134-N4',{a,hand,other})})
})
