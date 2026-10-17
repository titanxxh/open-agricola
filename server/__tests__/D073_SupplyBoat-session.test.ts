import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit41Future from './_helpers/audit/ae-negative-41-future'

describe('ae-negative-41-future', () => {
  const { sessions, ok, save, opts, setup, finish, select, play, reward } = audit41Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D073 N1 newly collected Fishing food funds exactly one grain or vegetable purchase and action undo restores the pile',()=>{
   for(const crop of ['grain','vegetable']as const){const amount=crop==='grain'?1:3,s=setup('D073_SupplyBoat',st=>{st.players[0]!.resources.food=0;st.actionSpaces.find(a=>a.id==='fishing')!.resources.food=amount}),p=ok(s.takeAction(0,'fishing')),r=finish(s,select(s,p,o=>reward(o,crop)===1),true),u=ok(s.undoAction());assert.equal(r.state.players[0]!.resources[crop],1);assert.equal(r.state.players[0]!.resources.food,0);assert.equal(u.state.players[0]!.resources[crop],0);assert.equal(u.state.actionSpaces.find(a=>a.id==='fishing')!.resources.food,amount);save(`D073-N1-${crop}`,{p,r,u})}
  })
  it('D073 N2 one or two collected food excludes unaffordable vegetable and decline preserves all Fishing food',()=>{
   for(const amount of [1,2]){const s=setup('D073_SupplyBoat',st=>{st.players[0]!.resources.food=0;st.actionSpaces.find(a=>a.id==='fishing')!.resources.food=amount}),p=ok(s.takeAction(0,'fishing'));assert.ok(!opts(p).some(o=>!o.disabled&&reward(o,'vegetable')===1));const r=finish(s,p);assert.equal(r.state.players[0]!.resources.food,amount);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.vegetable,0);save(`D073-N2-${amount}`,{p,r})}
  })
  it('D073 N3 actual purchase pays one wood and held card opponent Fishing and nonFishing food cannot grant owner crops',()=>{
   const s=setup('D073_SupplyBoat',st=>{st.players[0]!.occupationPlayed=['A100_Curator'];st.players[0]!.resources.wood=1},false,5),bought=play(s,'D073_SupplyBoat');assert.equal(bought.state.players[0]!.resources.wood,0);save('D073-N3-buy',bought);for(const mode of ['hand','other','nonfishing']){const actor=mode==='other'?1:0,t=setup('D073_SupplyBoat',st=>{st.currentPlayerIndex=actor;st.actionSpaces.find(a=>a.id==='fishing')!.resources.food=3},mode!=='hand'),r=finish(t,ok(t.takeAction(actor,mode==='nonfishing'?'day-laborer':'fishing')),true,'D073_SupplyBoat');assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.vegetable,0);save(`D073-N3-${mode}`,r)}
  })
})
