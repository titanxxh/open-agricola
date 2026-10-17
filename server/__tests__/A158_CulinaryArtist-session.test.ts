import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit17Trade from './_helpers/audit/ae-negative-17-trade'

describe('ae-negative-17-trade', () => {
  const { CULINARY, sessions, save, setup, turn, finish, offer, material, prepareHousing } = audit17Trade
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A158 N1 actual opponent Traveling Players exchanges exactly one selected supply good for four five or seven food',()=>{for(const[type,food]of[['grain',4],['sheep',5],['vegetable',7]]as const){const s=setup(CULINARY,{[type]:1},true,prepareHousing);const pending=offer(s,'traveling-players'),r=finish(s,pending,true,type);assert.equal(material(r)[type],0);assert.equal(material(r).food,22+food);assert.equal(material(r,1)[type],0);save(`A158-N1-${type}`,{pending,r})}})
  it('A158 N2 decline absent goods own space unrelated opponent and hand cannot exchange',()=>{const s=setup(CULINARY,{grain:1});const declined=finish(s,offer(s,'traveling-players'),false);assert.equal(material(declined).grain,1);assert.equal(material(declined).food,22);const poor=setup(CULINARY);const noGoods=finish(poor,offer(poor,'traveling-players'),false);assert.equal(material(noGoods).food,22);for(const[played,own,space]of[[false,false,'traveling-players'],[true,true,'traveling-players'],[true,false,'fishing']]as const){const ss=setup(CULINARY,{grain:1},played);const r=own?turn(ss,0,space):finish(ss,offer(ss,space));assert.equal(material(r).grain,1);if(!own)assert.equal(material(r).food,22);save(`A158-N2-${played}-${own}-${space}`,r)}save('A158-N2',{declined,noGoods})})
  it('A158 N3 single choice cannot exchange all goods or repeat after completion',()=>{const s=setup(CULINARY,{grain:1,sheep:1,vegetable:1},true,prepareHousing);const pending=offer(s,'traveling-players');assertRejectedUnchanged(s,()=>s.resolveChoice(0,'trade-all-goods'));const r=finish(s,pending,true,'vegetable');assert.equal(material(r).grain,1);assert.equal(material(r).sheep,1);assert.equal(material(r).vegetable,0);assert.equal(material(r).food,29);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'trade-again'));save('A158-N3',{pending,r})})
})
