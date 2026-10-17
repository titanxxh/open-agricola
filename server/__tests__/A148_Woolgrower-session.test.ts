import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit16Animals from './_helpers/audit/ae-negative-16-animals'

describe('ae-negative-16-animals', () => {
  const { WOOL, sessions, save, ok, turn, wool, menu } = audit16Animals
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A148 N1 completed feeding phases one two and six bound legal sheep housing on the card',()=>{for(const cap of[1,2,6]){const s=wool(cap),r=turn(s,0,'day-laborer'),q=menu(r);const z=q.zones.find(z=>z.id===`card:${WOOL}`);assert.ok(z);assert.equal(z.capacity,cap);const done=ok(s.resolveChoice(0,'confirm',{zones:[{...z,animalType:'sheep',animalCount:cap}]}));assert.equal(done.state.players[0]!.resources.sheep,cap);save(`A148-N1-${cap}`,{r,done})}})
  it('A148 N2 zero phases and hand exclude the holder independently of round number',()=>{for(const[cap,played]of[[0,true],[2,false]]as const){const s=wool(cap,'sheep',played),r=turn(s,0,'day-laborer');assert.ok(!menu(r).zones.some(z=>z.id===`card:${WOOL}`));save(`A148-N2-${cap}-${played}`,r)}})
  it('A148 N3 overcapacity wrong species and fabricated card reject before legal sheep placement',()=>{const s=wool(2),r=turn(s,0,'day-laborer'),z=menu(r).zones.find(z=>z.id===`card:${WOOL}`);assert.ok(z);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'confirm',{zones:[{...z,animalType:'sheep',animalCount:3}]}));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'confirm',{zones:[{...z,animalType:'boar',animalCount:1}]}));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'confirm',{zones:[{...z,id:'card:unknown',animalCount:1}]}));const done=ok(s.resolveChoice(0,'confirm',{zones:[{...z,animalCount:2}]}));assert.equal(done.state.players[0]!.resources.sheep,2);save('A148-N3',done)})
})
