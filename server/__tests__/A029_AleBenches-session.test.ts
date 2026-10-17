import '../../shared/cards/A/A027_OvenSite'
import '../../shared/cards/A/A028_ForestSchool'
import '../../shared/cards/A/A029_AleBenches'
import '../../shared/cards/A/A060_OrientalFireplace'
import '../../shared/cards/A/A123_FrameBuilder'
import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit06Improvements from './_helpers/audit/ae-negative-06-improvements'

describe('ae-negative-06-improvements', () => {
  const { ALE, sessions, setup, choices, enter, buy, skip, accept, offered, returnHome, reward } = audit06Improvements
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A029 N1 actual purchase requires two occupations and pays one wood',()=>{const s=setup(ALE,{occupations:2,resources:{wood:1}});const r=buy(s,enter(s),ALE);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.cardStates[ALE]?.counters?.bonusVp??0,0)})
  it('A029 N2 insufficient wood or only one occupation rejects before legal retry',()=>{for(const config of[{occupations:2,wood:0},{occupations:1,wood:1}]){const s=setup(ALE,{occupations:config.occupations,resources:{wood:config.wood}});const r=enter(s);assert.equal(offered(r,ALE),false);assertRejectedUnchanged(s,()=>s.resolveChoice(0,ALE));const done=buy(s,r,'A054_Credit');assert.equal(done.state.players[0]!.resources.wood,config.wood)}})
  it('A029 N3 returning home pays exactly one supply grain once and rewards only the opponent',()=>{const {s,r}=returnHome();assert.equal(r.state.players[0]!.resources.grain,2);const payment=choices(r).find(o=>o.value!=='__skip__'&&!o.disabled);assert.ok(payment);assertRejectedUnchanged(s,()=>s.resolveChoice(1,payment.value));const result=accept(s,r);reward(result,1,1);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'__skip__'));assert.equal(result.state.round,4)})
  it('A029 N4 declining returning home preserves grain and gives no point or food',()=>{const {s,r}=returnHome();reward(skip(s,r),2,0)})
  it('A029 N5 zero supply grain cannot earn a reward despite the accepted Pass prompt difference',()=>{const {r}=returnHome({grain:0});assert.equal(r.interaction.stateId,'idle');reward(r,0,0)})
  it('A029 N6 grain growing in a field is not supply grain and cannot pay',()=>{const {r}=returnHome({grain:0,field:true});assert.equal(r.interaction.stateId,'idle');reward(r,0,0);assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining,3)})
  it('A029 N7 with three players only the owner pays while every other player gains one food',()=>{const {s,r}=returnHome({players:3,otherGrain:4});assert.equal(r.interaction.stateId,'wait');if(r.interaction.stateId==='wait')assert.equal(r.interaction.playerIndex,0);const result=accept(s,r);reward(result,1,1,3);assert.equal(result.state.players[1]!.resources.grain,4);assert.equal(result.state.players[1]!.cardStates[ALE]?.counters?.bonusVp??0,0)})
})
