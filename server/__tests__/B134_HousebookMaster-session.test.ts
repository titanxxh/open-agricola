import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit28Housebook from './_helpers/audit/ae-negative-28-housebook'

describe('ae-negative-28-housebook', () => {
  const { sessions, save, ok, make, vp, renovate } = audit28Housebook
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B134 N1 actual stone renovation in rounds ten eleven twelve thirteen and fourteen immediately awards three three two one zero food and points',()=>{for(const[round,bonus]of[[10,3],[11,3],[12,2],[13,1],[14,0]]){const a=renovate(make(round));assert.equal(a.r.state.players[0]!.resources.food,a.before.state.players[0]!.resources.food+bonus);assert.equal(vp(a.r)-vp(a.before),bonus);assert.equal(a.r.state.players[1]!.resources.food,100);save(`B134-N1-${round}`,a)}})
  it('B134 N2 ordinary wood to clay and card only in hand add no food or points on actual renovation',()=>{for(const mode of['clay','hand']){const a=renovate(make(11,mode==='clay'?'wood':'clay',mode!=='hand'),mode==='clay'?'clay':'stone');assert.equal(a.r.state.players[0]!.resources.food,100);assert.equal(vp(a.r),0);save(`B134-N2-${mode}`,a)}})
  it('B134 N3 reading actual scores repeatedly cannot award the immediate renovation benefit a second time',()=>{const s=make(),a=renovate(s),b=ok(s.getState()),c=ok(s.getState());assert.equal(vp(b),3);assert.equal(vp(c),3);assert.equal(c.state.players[0]!.resources.food,103);assert.deepEqual(b.state.players[0]!.cardStates,c.state.players[0]!.cardStates);save('B134-N3',{a,b,c})})
  it('B134 N4 whole stone renovation undo restores food score house and payment before exactly one replay',()=>{const s=make(),a=renovate(s),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.houseType,'clay');assert.deepEqual(undone.state.players[0]!.resources,a.before.state.players[0]!.resources);assert.equal(vp(undone),0);const retry=renovate(s);assert.equal(vp(retry.r),3);assert.equal(retry.r.state.players[0]!.resources.food,103);save('B134-N4',{a,undone,retry})})
})
