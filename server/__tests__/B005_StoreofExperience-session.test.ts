import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit18Immediate from './_helpers/audit/ae-negative-18-immediate'

describe('ae-negative-18-immediate', () => {
  const { STORE, sessions, save, ok, setup, buy, OCCS } = audit18Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B005 N1 actual passing purchase maps zero through seven remaining occupations to exactly one good',()=>{for(const n of[0,1,2,3,4,5,6,7]){const s=setup(STORE,state=>state.players[0]!.occupationHand=OCCS.slice(0,Math.max(1,n)));if(n===0)s.state.players[0]!.occupationHand=[];assert.equal(s.getState().state.players[0]!.occupationHand.length,n);const r=buy(s,STORE),target=['stone','stone','stone','stone','stone','reed','clay','wood'][n];for(const type of['wood','clay','reed','stone']as const)assert.equal(r.state.players[0]!.resources[type],type===target?1:0);save(`B005-N1-${n}`,r)}})
  it('B005 N2 played occupations and opponent hand do not change owner hand reward',()=>{const s=setup(STORE,state=>{state.players[0]!.occupationHand=OCCS.slice(0,5);state.players[0]!.occupationPlayed=OCCS.slice(5);state.players[1]!.occupationHand=OCCS});const r=buy(s,STORE);assert.equal(r.state.players[0]!.resources.reed,1);assert.equal(r.state.players[1]!.resources.reed,0);assert.equal(r.state.players[0]!.resources.wood,0);save('B005-N2',r)})
  it('B005 N3 whole action undo restores hand and reward before one purchase retry',()=>{const s=setup(STORE,state=>state.players[0]!.occupationHand=OCCS);const r=buy(s,STORE);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.ok(undone.state.players[0]!.minorHand.includes(STORE));assert.ok(!undone.state.players[1]!.minorHand.includes(STORE));const retry=buy(s,STORE);assert.equal(retry.state.players[0]!.resources.wood,1);save('B005-N3',{r,undone,retry})})
})
