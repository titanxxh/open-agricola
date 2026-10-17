import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit41Future from './_helpers/audit/ae-negative-41-future'

describe('ae-negative-41-future', () => {
  const { sessions, ok, save, setup, finish, select, play, complete } = audit41Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C074 N1 actual purchase queues only future even rounds and natural six grants one wood while seven grants none',()=>{
   const s=setup('C074_PrivateForest',st=>{st.players[0]!.occupationPlayed=['A100_Curator'];st.players[0]!.resources.food=2},false,5),bought=play(s,'C074_PrivateForest');assert.equal(bought.state.players[0]!.resources.food,0);assert.equal(bought.state.players[0]!.resources.wood,0);assert.deepEqual(bought.state.futureMeeples.filter(e=>e.cardId==='C074_PrivateForest').map(e=>e.round),[6,8,10,12,14]);let r=complete(s,['reed-bank','clay-pit','day-laborer']);assert.equal(r.state.round,6);assert.equal(r.state.players[0]!.resources.wood,1);r=complete(s);assert.equal(r.state.round,7);assert.equal(r.state.players[0]!.resources.wood,1);save('C074-N1',{bought,r})
  })
  it('C074 N2 buying at current even six skips six and fourteen queues nothing while undo restores paid food and future supply',()=>{
   for(const round of [6,14]){const s=setup('C074_PrivateForest',st=>{st.players[0]!.occupationPlayed=['A100_Curator'];st.players[0]!.resources.food=2},false,round),r=play(s,'C074_PrivateForest'),u=ok(s.undoAction());assert.deepEqual(r.state.futureMeeples.filter(e=>e.cardId==='C074_PrivateForest').map(e=>e.round),round===6?[8,10,12,14]:[]);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(u.state.players[0]!.resources.food,2);assert.equal(u.state.futureMeeples.filter(e=>e.cardId==='C074_PrivateForest').length,0);assert.ok(u.state.players[0]!.minorHand.includes('C074_PrivateForest'));save(`C074-N2-${round}`,{r,u})}
  })
  it('C074 N3 missing occupation rejects before legal other purchase and a held Forest queues no delayed wood',()=>{
   const s=setup('C074_PrivateForest',st=>{st.players[0]!.resources.wood=2;st.players[0]!.resources.reed=1;st.players[0]!.minorHand.push('A057_MilkingParlor','A056_Basket')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'C074_PrivateForest')),r=finish(s,select(s,p,o=>o.value==='A057_MilkingParlor'));assert.ok(r.state.players[0]!.minorPlayed.includes('A057_MilkingParlor'));assert.equal(r.state.futureMeeples.filter(e=>e.cardId==='C074_PrivateForest').length,0);const t=setup('C074_PrivateForest',()=>{},false,5),held=complete(t);assert.equal(held.state.players[0]!.resources.wood,0);save('C074-N3',{p,bad,r,held})
  })
})
