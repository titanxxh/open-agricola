import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit14Harvest from './_helpers/audit/ae-negative-14-harvest'

describe('ae-negative-14-harvest', () => {
  const { TREE, sessions, save, setup, end, harvest } = audit14Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A118 N1 harvest free wood and zero one or two purchased wood have exact food costs',()=>{for(const purchase of[0,1,2]){const s=setup(TREE);const r=harvest(s,end(s),TREE,null,purchase);assert.equal(r.state.players[0]!.resources.wood,4+purchase);assert.equal(r.state.players[0]!.resources.food,36-purchase);save(`A118-N1-${purchase}`,r)}})
  it('A118 N2 zero food allows only free wood and one food cannot buy two',()=>{for(const available of[0,1]){const s=setup(TREE,[],state=>state.players[0]!.resources.food=available);const r=harvest(s,end(s),TREE,null,available);assert.equal(r.state.players[0]!.resources.wood,4+available);assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources.begging,4);save(`A118-N2-${available}`,r)}})
  it('A118 N3 nonharvest unplayed and opponent field phase cannot give owner wood',()=>{const nonS=setup(TREE,[],undefined,true,5),non=harvest(nonS,end(nonS),TREE);assert.equal(non.state.players[0]!.resources.wood,3);const handS=setup(TREE,[],undefined,false),hand=harvest(handS,end(handS),TREE);assert.equal(hand.state.players[0]!.resources.wood,3);assert.equal(hand.state.players[1]!.resources.wood,0);save('A118-N3',{non,hand})})
  it('A118 N4 invalid wrong actor and stale purchase cannot exceed two extra wood',()=>{const s=setup(TREE);const pending=end(s);assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice');assertRejectedUnchanged(s,()=>s.resolveChoice(0,'buy-three'));const firstValue=pending.interaction.request.options[0]!.value;assertRejectedUnchanged(s,()=>s.resolveChoice(1,firstValue));const r=harvest(s,pending,TREE,null,2);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'buy-three'));assert.equal(r.state.players[0]!.resources.wood,6);save('A118-N4',{pending,r})})
  it('A118 N5 later natural harvest awards only one fresh free wood without prior purchase',()=>{const s=setup(TREE);const first=harvest(s,end(s),TREE,null,2);harvest(s,end(s),TREE);harvest(s,end(s),TREE);const next=harvest(s,end(s),TREE);assert.equal(next.state.round,8);assert.equal(next.state.players[0]!.resources.wood,16);assert.equal(next.state.players[0]!.resources.food,30);save('A118-N5',{first,next})})
})
