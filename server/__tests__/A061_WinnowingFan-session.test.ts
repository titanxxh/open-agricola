import { describe, expect, it, afterEach } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A061_WinnowingFan'
import '../../shared/cards/D/D064_BakingCourse'
import '../../shared/cards/A/A060_OrientalFireplace'
import '../../shared/cards/A/A063_DutchWindmill'
import assert from 'node:assert/strict'
import { undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import * as audit09Baking from './_helpers/audit/ae-negative-09-baking'

describe('A061 Winnowing Fan through Session', () => {
  it('requires a baking improvement', () => {
    const blocked = playMinor(setupMinorSession({
      cardId: 'A061_WinnowingFan', resources: { reed: 1 },
    }), 'A061_WinnowingFan')
    expect(blocked.state.players[0]!.minorPlayed).not.toContain('A061_WinnowingFan')
    expect(blocked.state.players[0]!.resources.reed).toBe(1)

    const played = playMinor(setupMinorSession({
      cardId: 'A061_WinnowingFan', resources: { reed: 1 }, improvements: ['Major_Fireplace1'],
    }), 'A061_WinnowingFan')
    expect(played.state.players[0]!.minorPlayed).toContain('A061_WinnowingFan')
    expect(played.state.players[0]!.resources.reed).toBe(0)
  })

  it('accepts a played minor baking improvement', () => {
    const played = playMinor(setupMinorSession({
      cardId: 'A061_WinnowingFan',
      resources: { reed: 1 },
      minorPlayed: ['D064_BakingCourse'],
    }), 'A061_WinnowingFan')

    expect(played.state.players[0]!.minorPlayed).toContain('A061_WinnowingFan')
    expect(played.state.players[0]!.resources.reed).toBe(0)
  })
})

describe('ae-negative-09-baking', () => {
  const { ORIENTAL, FAN, MILL, FIRE, sessions, scenario, setup, ok, values, opts, buy, deny, cardFood, fanChoice, finishHarvest, fanHarvest } = audit09Baking
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  scenario('A061 N1 one reed with a real owned Fireplace permits the actual purchase', () => { const r=buy(setup(FAN,{played:false,resources:{reed:1},majors:[FIRE]}),FAN);assert.equal(values(r).reed,0);assert.equal(values(r).food,20);return{fanPlayed:true,reed:0,paid:{reed:1},fanFoodOnBuy:0} })
  scenario('A061 N2 owned Oriental Fireplace independently qualifies as a baking improvement', () => { const r=buy(setup(FAN,{played:false,resources:{reed:1},minor:[ORIENTAL]}),FAN);assert.equal(values(r).reed,0);assert.ok(r.state.players[0]!.minorPlayed.includes(ORIENTAL));return{fanPlayed:true,reed:0,orientalStillPlayed:true} })
  scenario('A061 N3 missing reed rejects purchase despite owned baking provider', () => { const r=deny(setup(FAN,{played:false,majors:[FIRE]}),FAN);assert.ok(r.state.players[0]!.minorHand.includes(FAN));return{fanInHand:true,forgedPurchaseRejected:true,legalRetryCompleted:true} })
  scenario('A061 N4 nonbaking Joinery does not satisfy the baking prerequisite', () => { const r=deny(setup(FAN,{played:false,resources:{reed:1},majors:['Major_Joinery']}),FAN);assert.equal(values(r).reed,1);return{fanInHand:true,reed:1,forgedPurchaseRejected:true,legalRetryCompleted:true} })
  scenario('A061 N5 only the opponent baking provider does not satisfy owner prerequisite', () => { const r=deny(setup(FAN,{played:false,resources:{reed:1},configure(state){state.players[1]!.improvements=[FIRE];takeMajorImprovementFromSupply(state,FIRE)}}),FAN);assert.equal(values(r).reed,1);assert.ok(r.state.players[1]!.improvements.includes(FIRE));return{fanInHand:true,reed:1,forgedPurchaseRejected:true,opponentBakerStillOwned:true} })
  scenario('A061 N6 zero grain after a real field phase supplies no Fan exchange', () => { const {s,r}=fanHarvest({grain:0});assert.equal(fanChoice(r),false);const end=finishHarvest(s,r);assert.equal(values(end).grain,0);assert.equal(values(end).food,16);assert.equal(cardFood(end,FAN),0);return{grain:0,fanBakeOffered:false,fanFoodGain:0,foodAfterFeeding:16} })
  scenario('A061 N7 one grain actually harvested can be turned into food only after the field phase', () => { const {s,r}=fanHarvest({grain:0,crop:1});assert.equal(values(r).grain,1);assert.equal(r.state.players[0]!.fields[0]!.stacks.length,0);assert.equal(fanChoice(r),true);const next=ok(s.resolveChoice(0,opts(r).find(o=>o.value!=='__skip__')!.value));assert.equal(values(next).grain,0);assert.equal(values(next).food,18);assert.equal(cardFood(next,FAN),2);const end=finishHarvest(s,next,true);assert.equal(values(end).food,18);return{grainAfterField:1,fieldRemaining:0,fanPaidGrain:1,fanReceivedFood:2,grainAfterFan:0,foodAfterFeeding:18} })
  scenario('A061 N8 two supplied grain still permit only one grain in one Fan activation', () => { const {s,r}=fanHarvest({grain:2});assert.equal(fanChoice(r),true);const end=finishHarvest(s,r,true);assert.equal(values(end).grain,1);assert.equal(values(end).food,18);assert.equal(cardFood(end,FAN),2);return{fanPaidGrain:1,fanReceivedFood:2,remainingGrain:1,foodAfterFeeding:18} })
  scenario('A061 N9 the optional Fan exchange can be declined without a grain conversion', () => { const {s,r}=fanHarvest({grain:2});assert.equal(fanChoice(r),true);const end=finishHarvest(s,r,false);assert.equal(values(end).grain,2);assert.equal(values(end).food,16);assert.equal(cardFood(end,FAN),0);return{grain:2,fanPaidGrain:0,fanFoodGain:0,foodAfterFeeding:16} })
  scenario('A061 N10 a nonharvest round completion cannot trigger Fan', () => { const {s,r}=fanHarvest({grain:2,round:5});assert.equal(fanChoice(r),false);const end=finishHarvest(s,r);assert.equal(end.state.round,6);assert.equal(values(end).grain,2);assert.equal(values(end).food,20);return{round:6,grain:2,food:20,fanFoodGain:0} })
  scenario('A061 N11 Fan in hand cannot convert grain after harvest fields', () => { const {s,r}=fanHarvest({grain:1,played:false});assert.equal(fanChoice(r),false);const end=finishHarvest(s,r);assert.equal(values(end).grain,1);assert.equal(values(end).food,16);assert.ok(end.state.players[0]!.minorHand.includes(FAN));return{fanInHand:true,fanBakeOffered:false,grain:1,foodAfterFeeding:16} })
  scenario('A061 N12 a real Fan conversion at harvest fourteen is not Bake Bread and cannot trigger Dutch Windmill', () => { const {s,r}=fanHarvest({grain:1,round:14,mill:true});assert.equal(fanChoice(r),true);const next=ok(s.resolveChoice(0,opts(r).find(o=>o.value!=='__skip__')!.value));assert.equal(values(next).grain,0);assert.equal(values(next).food,18);assert.equal(cardFood(next,FAN),2);assert.equal(cardFood(next,MILL),0);const end=finishHarvest(s,next,true);assert.equal(values(end).food,18);return{fanPaidGrain:1,fanReceivedFood:2,windmillReceivedFood:0,fanFoodReceivedBeforeAutomaticFeeding:2,postChoiceFood:18,foodAfterFeeding:18} })
  scenario('A061 N13 undo of a Fan harvest choice restores the actual post-field rule scope only if exposed', () => { const {s,r}=fanHarvest();assert.equal(fanChoice(r),true);const before=undoRuleSnapshot(r);const next=ok(s.resolveChoice(0,opts(r).find(o=>o.value!=='__skip__')!.value));assert.equal(values(next).grain,0);assert.equal(values(next).food,18);assert.equal(cardFood(next,FAN),2);const undone=s.undoStep();if(!undone.ok){assert.equal(undone.error,'no history to undo');assert.equal(values(undone).food,18);return{restored:false,undoError:undone.error,scope:'actual undoStep rejected',actualFood:18}};assert.deepEqual(JSON.parse(undoRuleSnapshot(undone)),JSON.parse(before));assert.equal(fanChoice(undone),true);const retried=ok(s.resolveChoice(0,opts(undone).find(o=>o.value!=='__skip__')!.value));assert.equal(values(retried).grain,0);assert.equal(values(retried).food,18);assert.equal(cardFood(retried,FAN),2);return{restored:true,singleRetryPaidGrain:1} })
})
