import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit55Renovation from './_helpers/audit/ae-negative-55-renovation'

describe('ae-negative-55-renovation', () => {
  const { sessions, save, make, renovate, bonus } = audit55Renovation
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C153 N1 real opponent clay or stone renovation pays exactly two wood for one grain food and scored bonus point',()=>{for(const target of['clay','stone']){const s=make('C153_PatternMaker',st=>{st.currentPlayerIndex=1;st.players[0]!.resources.wood=2;st.players[1]!.houseType=target==='stone'?'clay':'wood';Object.assign(st.players[1]!.resources,{stone:2,clay:2,reed:1});},true,14),r=renovate(s,1,true);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.food,101);assert.equal(bonus(r,'C153_PatternMaker'),1);save(`C153-N1-${target}`,r)}})
  it('C153 N2 one wood optional decline own renovation and hand-only card cannot grant grain food or points',()=>{for(const mode of['wood','decline','self','hand']){const actor=mode==='self'?0:1,s=make('C153_PatternMaker',st=>{st.currentPlayerIndex=actor;st.players[0]!.resources.wood=mode==='wood'?1:2;Object.assign(st.players[actor]!.resources,{clay:2,reed:1});},mode!=='hand',14),r=renovate(s,actor,mode!=='decline');assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.food,100);assert.equal(bonus(r,'C153_PatternMaker'),0);save(`C153-N2-${mode}`,r)}})
})
