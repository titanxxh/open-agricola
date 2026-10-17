import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit41Future from './_helpers/audit/ae-negative-41-future'

describe('ae-negative-41-future', () => {
  const { sessions, ok, save, setup, finish, select, complete, reward, enterSow, sow, buyPending, field, change } = audit41Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C073 N1 actual unconditional Sow plants one paid seed and gives exactly one grain before eleven or one chosen crop afterward',()=>{
   for(const [round,crop]of [[10,'grain'],[11,'grain'],[11,'vegetable']]as const){const s=setup('C073_SeaweedFertilizer',st=>{field(st);st.players[0]!.resources.grain=1},true,round);let r=sow(s,ok(s.takeAction(0,'grain-utilization')),[{row:0,col:1,crop:'grain'}]);if(round>=11)r=select(s,r,o=>reward(o,crop)===1);r=finish(s,r,true);assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining,3);assert.equal(r.state.players[0]!.resources.grain,crop==='grain'?1:0);assert.equal(r.state.players[0]!.resources.vegetable,crop==='vegetable'?1:0);save(`C073-N1-${round}-${crop}`,r)}
  })
  it('C073 N2 a real restricted Furrows Sow receives no crop while two field submission rejects before legal one field sowing',()=>{
   const s=setup('C073_SeaweedFertilizer',st=>{field(st);field(st,0,0,2);st.players[0]!.resources.grain=2;st.players[0]!.minorHand=['D003_Furrows']},true,10),p=enterSow(s,buyPending(s,'D003_Furrows'));save('C073-N2-debug',p);assert.ok(p.interaction.stateId==='wait'&&p.interaction.request.kind==='farm-select');const bad=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'},{row:0,col:2,crop:'grain'}]})),r=finish(s,sow(s,p,[{row:0,col:1,crop:'grain'}]),true,'C073_SeaweedFertilizer');assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining,3);save('C073-N2',{p,bad,r})
  })
  it('C073 N3 held card and actual opponent Sow give no owner reward',()=>{
   for(const mode of ['hand','other']){const actor=mode==='other'?1:0,s=setup('C073_SeaweedFertilizer',st=>{st.currentPlayerIndex=actor;field(st,0,actor);st.players[actor]!.resources.grain=1},mode!=='hand',10),r=finish(s,sow(s,ok(s.takeAction(actor,'grain-utilization')),[{row:0,col:1,crop:'grain'}]),true,'C073_SeaweedFertilizer');assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.vegetable,0);save(`C073-N3-${mode}`,r)}
  })
  it('C073 N4 Changeover selected field restricted Sow must not receive an unconditional Seaweed grain bonus',()=>{
   const s=setup('D071_Changeover',st=>{field(st,2);field(st,0,0,2);st.players[0]!.resources.vegetable=1;st.players[0]!.minorPlayed.push('C073_SeaweedFertilizer')},true,4),harvest=complete(s,['day-laborer','clay-pit','reed-bank','forest']),p=change(s);assert.equal(harvest.state.players[0]!.fields[0]!.stacks[0]!.remaining,1);assert.ok(p.interaction.stateId==='wait'&&p.interaction.request.kind==='selection');const q=ok(s.commitSelectionChoice(0,{positions:[{row:0,col:1}]}));assert.equal(q.state.players[0]!.resources.grain,1);assert.equal(q.state.players[0]!.fields[0]!.stacks.length,0);const bad=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{crops:[{row:0,col:2,crop:'vegetable'}]})),r=finish(s,sow(s,q,[{row:0,col:1,crop:'vegetable'}]),true,'C073_SeaweedFertilizer');assertRuleOutcome(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.deepEqual(r.state.players[0]!.fields.slice(0,2).map(f=>f.stacks),[[{kind:'vegetable',remaining:2}],[]]);save('C073-N4',{harvest,p,q,bad,r})
  })
})
