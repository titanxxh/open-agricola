import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit42Future from './_helpers/audit/ae-negative-42-future'

describe('ae-negative-42-future', () => {
  const { sessions, ok, save, setup, finish, select, play, complete, occupations, future } = audit42Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D078 N1 occupation gated free purchase queues three reeds and actual six gives one',()=>{const s=setup('D078_ReedPond',st=>occupations(st),false,5),bought=play(s,'D078_ReedPond');assert.equal(bought.state.players[0]!.resources.food,100);assert.deepEqual(future(bought,'D078_ReedPond'),[6,7,8].map(round=>({round,resources:{reed:1}})));const r=complete(s,['clay-pit','grain-seeds','fishing']);assert.equal(r.state.round,6);assert.equal(r.state.players[0]!.resources.reed,1);save('D078-N1',{bought,r})})
  it('D078 N2 late pond clips fourteen and undo deletes all pending reeds',()=>{for(const round of [13,14]){const s=setup('D078_ReedPond',st=>occupations(st),false,round),r=play(s,'D078_ReedPond');assert.deepEqual(future(r,'D078_ReedPond'),round===13?[{round:14,resources:{reed:1}}]:[]);const u=ok(s.undoAction());assert.deepEqual(future(u,'D078_ReedPond'),[]);assert.ok(u.state.players[0]!.minorHand.includes('D078_ReedPond'));save(`D078-N2-${round}`,{r,u})}})
  it('D078 N3 two occupations reject pond before another legal minor and a held card has no reed queue',()=>{const s=setup('D078_ReedPond',st=>{occupations(st,2);st.players[0]!.minorHand.push('E080_RockGarden','D003_Furrows')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'D078_ReedPond')),r=finish(s,select(s,p,o=>o.value==='E080_RockGarden'));assert.deepEqual(future(r,'D078_ReedPond'),[]);assert.equal(r.state.players[0]!.resources.reed,0);save('D078-N3',{p,bad,r})})
})
