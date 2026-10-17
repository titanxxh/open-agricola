import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit25Furniture from './_helpers/audit/ae-negative-25-furniture'

describe('ae-negative-25-furniture', () => {
  const { sessions, save, ok, finish, make, bonus, harvest } = audit25Furniture
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B101 N1 own or opponent Joinery permits exactly one harvest point for two food through natural round completion',()=>{for(const owner of[0,1]){const s=make(owner),control=make(owner,false),pending=harvest(s),r=finish(s,pending,true),c=finish(control,harvest(control),false);assert.equal(bonus(r),1);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food-2);assert.equal(r.state.round,8);save(`B101-N1-${owner}`,{pending,r,c})}})
  it('B101 N2 declining natural harvest preserves two food and grants no point',()=>{const s=make(),control=make(1,false),pending=harvest(s),r=finish(s,pending,false),c=finish(control,harvest(control),false);assert.equal(bonus(r),0);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food);save('B101-N2',{pending,r,c})})
  it('B101 N3 no Joinery hand only or insufficient two food excludes harvest bonus',()=>{for(const mode of['joinery','hand','food']){const s=make(mode==='joinery'?null:1,mode!=='hand',mode==='food'?1:100),pending=harvest(s),r=finish(s,pending,false);assert.equal(bonus(r),0);save(`B101-N3-${mode}`,{pending,r})}})
  it('B101 N4 outside harvest unrelated action never creates a point or charges two food',()=>{const s=make(),before=ok(s.getState()),pending=ok(s.takeAction(0,'reed-bank')),r=finish(s,pending,false);assert.equal(bonus(r),0);assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food);save('B101-N4',{before,pending,r})})
})
