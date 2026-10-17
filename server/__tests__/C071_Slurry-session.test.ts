import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit41Harvest from './_helpers/audit/ae-negative-41-harvest'

describe('ae-negative-41-harvest', () => {
  const { sessions, save, setup, finish, enterSow, sow, field, end, pasture, finishAnimals } = audit41Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C071 N1 two naturally accommodated newborn types grant one Sow paid with one grain and one vegetable seed',()=>{
   const s=setup('C071_Slurry',st=>{pasture(st);field(st);field(st,0,0,2);Object.assign(st.players[0]!.resources,{grain:1,vegetable:1})},true,4),p=finishAnimals(s,end(s)),q=enterSow(s,p),r=finish(s,sow(s,q,[{row:0,col:1,crop:'grain'},{row:0,col:2,crop:'vegetable'}]));assert.equal(r.state.players[0]!.resources.sheep,3);assert.equal(r.state.players[0]!.resources.cattle,3);assert.deepEqual(r.state.players[0]!.pastures.map(p=>p.animalCount),[3,3]);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.deepEqual(r.state.players[0]!.fields.map(f=>f.stacks),[[{kind:'grain',remaining:3}],[{kind:'vegetable',remaining:2}]]);save('C071-N1',{p,q,r})
  })
  it('C071 N2 declining two type newborn Sow preserves both seeds and all accommodated animals',()=>{
   const s=setup('C071_Slurry',st=>{pasture(st);field(st);Object.assign(st.players[0]!.resources,{grain:1,vegetable:1})},true,4),p=finishAnimals(s,end(s)),r=finish(s,p);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.vegetable,1);assert.deepEqual(r.state.players[0]!.pastures.map(p=>p.animalCount),[3,3]);assert.equal(r.state.players[0]!.fields[0]!.stacks.length,0);save('C071-N2',{p,r})
  })
  it('C071 N3 one newborn type or a held card never grants Sow or consumes the held seed',()=>{
   for(const mode of ['one','hand']){const s=setup('C071_Slurry',st=>{pasture(st,mode==='one'?1:2);field(st);st.players[0]!.resources.grain=1},mode!=='hand',4),r=finish(s,finishAnimals(s,end(s)),false,'C071_Slurry');assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.fields[0]!.stacks.length,0);assert.equal(r.state.players[0]!.resources.sheep,3);save(`C071-N3-${mode}`,r)}
  })
})
