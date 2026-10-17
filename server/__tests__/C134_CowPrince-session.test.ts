import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit52Animals from './_helpers/audit/ae-negative-52-animals'

describe('ae-negative-52-animals', () => {
  const { sessions, save, make, lesson, progress, bonus, pasture, COW } = audit52Animals
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C134 N1 actual purchase gives no early animal points and two real independent room cattle score two after natural final harvest',()=>{const bought=lesson(make(COW,false),COW);assert.equal(bonus(bought,COW),0);const s=make(COW,true,state=>{const p=state.players[0]!;p.occupationPlayed.push('A086_AnimalTamer');p.resources.cattle=2;p.houseAnimals=Object.fromEntries(p.roomTiles.map(t=>[`${t.row}-${t.col}`,'cattle']))}),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.equal(r.state.players[0]!.resources.cattle,2);assert.equal(Object.values(r.state.players[0]!.houseAnimals).filter(t=>t==='cattle').length,2);assert.equal(bonus(r,COW),2);assert.equal(bonus(r,COW,1),0);save('C134-N1',{bought,r})})
  it('C134 N2 four cattle in two pasture spaces score only two and an unfenced stable is one occupied cattle space',()=>{for(const mode of['pasture','stable']){const s=make(COW,true,state=>{const p=state.players[0]!;if(mode==='pasture'){pasture(p,2,2,false,'cattle',4);p.resources.sheep=1;p.houseAnimals={[`${p.roomTiles[0]!.row}-${p.roomTiles[0]!.col}`]:'sheep'}}else{p.stableTiles=[{row:0,col:2}];p.stableAnimals={'0-2':{animalType:'cattle',animalCount:1}};p.resources.cattle=1}}),r=progress(s,15);assert.equal(bonus(r,COW),mode==='pasture'?2:1);assert.equal(r.state.players[0]!.resources.cattle,mode==='pasture'?4:1);save(`C134-N2-${mode}`,r)}})
  it('C134 N3 empty holders sheep and a held card cannot score owner cattle spaces',()=>{for(const mode of['empty','sheep','hand']){const s=make(COW,mode!=='hand',state=>{if(mode==='empty')return;const p=state.players[0]!,type=mode==='sheep'?'sheep':'cattle';p.resources[type]=1;p.houseAnimals={[`${p.roomTiles[0]!.row}-${p.roomTiles[0]!.col}`]:type}}),r=progress(s,15);assert.equal(bonus(r,COW),0);save(`C134-N3-${mode}`,r)}})
})
