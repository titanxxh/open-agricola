import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit42Future from './_helpers/audit/ae-negative-42-future'

describe('ae-negative-42-future', () => {
  const { sessions, ok, save, setup, finish, select, play, complete, future } = audit42Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C077 N1 real food paid purchase schedules next three clay deliveries and natural six grants exactly one',()=>{const s=setup('C077_ClaySupply',()=>{},false,5),bought=play(s,'C077_ClaySupply');assert.equal(bought.state.players[0]!.resources.food,99);assert.deepEqual(future(bought,'C077_ClaySupply'),[6,7,8].map(round=>({round,resources:{clay:1}})));const r=complete(s,['reed-bank','grain-seeds','fishing']);assert.equal(r.state.round,6);assert.equal(r.state.players[0]!.resources.clay,1);save('C077-N1',{bought,r})})
  it('C077 N2 late purchase clips fourteen and action undo removes queued clay without immediate receipt',()=>{for(const round of [13,14]){const s=setup('C077_ClaySupply',()=>{},false,round),r=play(s,'C077_ClaySupply');assert.deepEqual(future(r,'C077_ClaySupply'),round===13?[{round:14,resources:{clay:1}}]:[]);assert.equal(r.state.players[0]!.resources.clay,0);const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.food,100);assert.deepEqual(future(u,'C077_ClaySupply'),[]);assert.ok(u.state.players[0]!.minorHand.includes('C077_ClaySupply'));save(`C077-N2-${round}`,{r,u})}})
  it('C077 N3 held supply has no delayed delivery and zero food purchase rejects before a legal free alternative',()=>{const s=setup('C077_ClaySupply',st=>{st.players[0]!.resources.food=0;st.players[0]!.minorHand.push('E080_RockGarden','C071_Slurry')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'C077_ClaySupply')),r=finish(s,select(s,p,o=>o.value==='E080_RockGarden'));assert.equal(r.state.players[0]!.resources.clay,0);assert.deepEqual(future(r,'C077_ClaySupply'),[]);save('C077-N3',{p,bad,r})})
})
