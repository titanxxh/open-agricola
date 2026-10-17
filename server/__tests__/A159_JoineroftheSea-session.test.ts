import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit17Trade from './_helpers/audit/ae-negative-17-trade'

describe('ae-negative-17-trade', () => {
  const { JOINER, sessions, save, setup, finish, offer, material } = audit17Trade
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A159 N1 actual opponent Fishing and Reed Bank receive one wood while owner gains two or three food',()=>{for(const[space,food]of[['fishing',2],['reed-bank',3]]as const){const s=setup(JOINER,{wood:1});const pending=offer(s,space),r=finish(s,pending);assert.equal(material(r).wood,0);assert.equal(material(r,1).wood,1);assert.equal(material(r,2).wood,0);assert.equal(material(r).food,22+food);save(`A159-N1-${space}`,{pending,r})}})
  it('A159 N2 decline no wood hand own and unrelated opponent cannot grant food',()=>{const s=setup(JOINER,{wood:1});const decline=finish(s,offer(s,'fishing'),false);assert.equal(material(decline).wood,1);assert.equal(material(decline).food,22);const poor=setup(JOINER);const none=finish(poor,offer(poor,'reed-bank'),false);assert.equal(material(none).food,22);for(const [played,space]of[[false,'fishing'],[true,'grain-seeds']]as const){const ss=setup(JOINER,{wood:1},played),r=finish(ss,offer(ss,space));assert.equal(material(r).wood,1);assert.equal(material(r).food,22);save(`A159-N2-${played}`,r)}save('A159-N2',{decline,none})})
  it('A159 N3 invalid actor and stale exchange cannot duplicate wood or food',()=>{const s=setup(JOINER,{wood:2});const pending=offer(s,'fishing');assertRejectedUnchanged(s,()=>s.resolveChoice(0,'give-zero-wood'));assertRejectedUnchanged(s,()=>s.resolveChoice(1,'trade'));const r=finish(s,pending);assert.equal(material(r).wood,1);assert.equal(material(r,1).wood,1);assert.equal(material(r).food,24);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'trade'));save('A159-N3',r)})
})
