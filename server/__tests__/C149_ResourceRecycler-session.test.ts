import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit55Renovation from './_helpers/audit/ae-negative-55-renovation'

describe('ae-negative-55-renovation', () => {
  const { sessions, ok, save, finish, choose, renovate, recycled } = audit55Renovation
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C149 N1 real opponent stone renovation buys exactly one free clay room for two food and rejects an occupied room target before retry',()=>{const s=recycled();let p=ok(s.takeAction(1,'house-redevelopment'));p=choose(s,p,o=>o.value!=='__skip__');assert.ok(p.interaction.stateId==='wait'&&p.interaction.request.kind==='farm-select'&&p.interaction.request.farm.farmType==='room',JSON.stringify(p.interaction));const rejected=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{rooms:[{row:1,col:0}]}));const r=finish(s,ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1}]})));assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.houseType,'clay');assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(r.state.players[1]!.houseType,'stone');save('C149-N1',{p,rejected,r})})
  it('C149 N2 own renovation wood or stone owner house clay target hand-only and one food never build a free clay room',()=>{for(const mode of['self','wood','stone','claytarget','hand','food']){const s=recycled(mode==='self'?0:1,mode==='wood'?'wood':mode==='stone'?'stone':'clay',mode==='claytarget'?'clay':'stone',mode==='food'?1:2,mode!=='hand'),r=renovate(s,mode==='self'?0:1,true);assert.equal(r.state.players[0]!.rooms,2);assert.equal(r.state.players[0]!.resources.food,mode==='food'?1:2);save(`C149-N2-${mode}`,r)}})
  it('C149 N3 actual eligible offer can decline without spending owner food or adding a room',()=>{const s=recycled(),r=renovate(s,1,false);assert.equal(r.state.players[0]!.rooms,2);assert.equal(r.state.players[0]!.resources.food,2);assert.equal(r.state.players[1]!.houseType,'stone');save('C149-N3',r)})
})
