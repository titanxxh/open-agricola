import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit24Resources from './_helpers/audit/ae-negative-24-resources'

describe('ae-negative-24-resources', () => {
  const { CLEAR, CLAY, sessions, save, ok, setup, ready, finish, menu, buy, FIRST, SECOND, make } = audit24Resources
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D005 N1 paid passing purchase counts planted grain and vegetable once each excluding empty and opponent fields',()=>{const s=make(CLAY,100,true);const before=ok(s.getState()),a=buy(s,CLAY);assert.equal(a.r.state.players[0]!.resources.food,99);assert.equal(a.r.state.players[0]!.resources.clay,2);assert.deepEqual(a.r.state.players[0]!.fields,before.state.players[0]!.fields);assert.equal(a.r.state.players[1]!.resources.clay,0);save('D005-N1',{before,a})})
  it('D005 N2 missing planted field or card food rejects with legal alternative and no clay',()=>{for(const mode of['field','food']){const s=make(CLAY,mode==='food'?0:100,mode!=='field'),pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,CLAY)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.equal(r.state.players[0]!.resources.clay,0);assert.ok(r.state.players[0]!.minorHand.includes(CLAY));save(`D005-N2-${mode}`,{pending,rejected,r})}})
  it('D005 N3 actual Stone Clearing purchase then later Field Clay counts stone planted field as one extra',()=>{const t=setup(CLEAR,8,state=>{const p=state.players[0]!;p.minorHand=[CLEAR,CLAY,'B004_WoodPile'];p.fields=[{...FIRST,stacks:[]},{...SECOND,stacks:[{kind:'grain',remaining:2}]}]});const cleared=buy(t,CLEAR);ready(t);finish(t,ok(t.takeAction(1,'grain-seeds')),false);ready(t);let pending=ok(t.takeAction(0,'major-improvement'));if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice'){const o=pending.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)pending=ok(t.resolveChoice(0,o.value))}const r=finish(t,ok(t.resolveChoice(0,CLAY)),false);assert.equal(r.state.players[0]!.resources.clay,2);assert.equal(r.state.players[0]!.resources.food,98);assert.deepEqual(r.state.players[0]!.fields[0]!.stacks,[{kind:'stone',remaining:1}]);save('D005-N3',{cleared,pending,r})})
})
