import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit49Fields from './_helpers/audit/ae-negative-49-fields'

describe('ae-negative-49-fields', () => {
  const { PIPE, sessions, save, make, lesson, progress, action, field } = audit49Fields
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E117 N1 real purchase has no early wood and one or three grain fields grant exactly two wood once before native harvest reap',()=>{for(const count of[1,3]){const s=make(PIPE,false,state=>field(state,count,'grain',1)),bought=lesson(s,PIPE);assert.equal(bought.state.players[0]!.resources.wood,0);const r=progress(s,8);assert.equal(r.state.players[0]!.resources.wood,2);assert.equal(r.state.players[0]!.resources.grain,count);assert.ok(r.state.players[0]!.fields.every(f=>f.stacks.length===0));assert.equal(r.state.players[1]!.resources.wood,0);save(`E117-N1-${count}`,{bought,r})}})
  it('E117 N2 grain only in supply empty fields vegetable fields and card in hand cannot grant harvest wood',()=>{for(const mode of['supply','empty','vegetable','hand']){const s=make(PIPE,mode!=='hand',state=>{field(state,mode==='supply'?0:1,mode==='vegetable'?'vegetable':mode==='hand'?'grain':null,2);if(mode==='supply')state.players[0]!.resources.grain=10}),r=progress(s,8);assert.equal(r.state.players[0]!.resources.wood,0);save(`E117-N2-${mode}`,r)}})
  it('E117 N3 ordinary work and nonharvest never add wood and only a field still growing at the next real harvest qualifies again',()=>{for(const[remaining,last]of[[1,2],[3,4]] as const){const s=make(PIPE,true,state=>field(state,1,'grain',remaining)),mid=action(s,0,'reed-bank');assert.equal(mid.state.players[0]!.resources.wood,0);const eight=progress(s,8),nine=progress(s,9),ten=progress(s,10);assert.equal(eight.state.players[0]!.resources.wood,2);assert.equal(nine.state.players[0]!.resources.wood,2);assert.equal(ten.state.players[0]!.resources.wood,last);save(`E117-N3-${remaining}`,{mid,eight,nine,ten})}})
})
