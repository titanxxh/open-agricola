import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit56Phase from './_helpers/audit/ae-negative-56-phase'

describe('ae-negative-56-phase', () => {
  const { sessions, ok, save, make, finish, end } = audit56Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E158 N1 real end of nonharvest work phase grants zero one or two food for distinct nonempty revealed stone quarries',()=>{for(const[left,right]of[[0,0],[1,0],[0,3],[1,3]]){const s=make('E158_StoneCustodian',st=>{st.actionSpaces.find(a=>a.id==='western-quarry')!.resources.stone=left!;st.actionSpaces.find(a=>a.id==='eastern-quarry')!.resources.stone=right!},true,12),r=finish(s,end(s));assert.equal(r.state.round,13);assert.equal(r.state.players[0]!.resources.food,100+Number(left!>0)+Number(right!>0));assert.equal(r.state.actionSpaces.find(a=>a.id==='western-quarry')!.resources.stone,left!+1);assert.equal(r.state.actionSpaces.find(a=>a.id==='eastern-quarry')!.resources.stone,right!+1);save(`E158-N1-${left}-${right}`,r)}})
  it('E158 N2 neither an unrelated midround placement nor a held Stone Custodian rewards nonempty quarries',()=>{for(const hand of[true,false]){const s=make('E158_StoneCustodian',st=>{st.actionSpaces.find(a=>a.id==='western-quarry')!.resources.stone=1;st.actionSpaces.find(a=>a.id==='eastern-quarry')!.resources.stone=1},!hand,12),r=hand?finish(s,end(s)):finish(s,ok(s.takeAction(0,'grain-seeds')));assert.equal(r.state.players[0]!.resources.food,100);save(`E158-N2-${hand}`,r)}})
})
