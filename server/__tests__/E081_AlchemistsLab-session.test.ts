import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit43Exchanges from './_helpers/audit/ae-negative-43-exchanges'

describe('ae-negative-43-exchanges', () => {
  const { LAB, sessions, save, ok, finish, ready, menu, purchase, buildings, lab, labTurn } = audit43Exchanges
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E081 N1 three occupations purchase creates usable space and two occupations reject before legal alternative',()=>{const s=lab(),a=purchase(s,LAB);assert.ok(a.r.state.actionSpaces.some(a=>a.id.includes(LAB)));assert.equal(a.r.scores![0]!.categories.find(c=>c.key==='cards')?.entries.find(e=>'cardId'in e&&e.cardId===LAB)?.score,1);const t=lab(2),pending=menu(t),bad=assertRejectedUnchanged(t,()=>t.resolveChoice(0,LAB)),legal=ok(t.resolveChoice(0,'B004_WoodPile'));assert.ok(!legal.state.actionSpaces.some(a=>a.id.includes(LAB)));save('E081-N1',{a,pending,bad,legal})})
  it('E081 N2 another player pays owner one food before gaining only their owned types and occupied space refuses reuse',()=>{const s=lab();labTurn(s,LAB);const space=s.getState().state.actionSpaces.find(a=>a.id.includes(LAB));assert.ok(space);const r=finish(s,ok(s.takeAction(1,space.id)),true);assert.deepEqual(buildings(r,1),{food:0,wood:0,clay:3,reed:0,stone:2});assert.deepEqual(buildings(r),{food:1,wood:2,clay:0,reed:1,stone:0});ready(s);const bad=assertRejectedUnchanged(s,()=>s.takeAction(0,space.id));save('E081-N2',{r,bad})})
  it('E081 N3 owner pays no food and zero-food opponent cannot gain through the created space',()=>{const s=lab();labTurn(s,LAB);finish(s,ok(s.takeAction(1,'grain-seeds')));ready(s);const space=s.getState().state.actionSpaces.find(a=>a.id.includes(LAB));assert.ok(space);const r=finish(s,ok(s.takeAction(0,space.id)),true);assert.deepEqual(buildings(r),{food:0,wood:3,clay:0,reed:2,stone:0});const t=lab(3,0);labTurn(t,LAB);const target=t.getState().state.actionSpaces.find(a=>a.id.includes(LAB));assert.ok(target);const bad=assertRejectedUnchanged(t,()=>t.takeAction(1,target.id)),legal=ok(t.takeAction(1,'grain-seeds'));assert.deepEqual(buildings(legal,1),{food:0,wood:0,clay:2,reed:0,stone:1});save('E081-N3',{r,bad,legal})})
})
