import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { getRoundPersonPlacementOrder } from '../../shared/cards/helpers/round-placement'
import * as audit17Sequence from './_helpers/audit/ae-negative-17-sequence'

describe('ae-negative-17-sequence', () => {
  const { EXPERT, sessions, save, ok, setup, turn, beforeExpert } = audit17Sequence
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A163 N1 first through fifth real placed person gains mapped material from Resource Market',()=>{for(const ordinal of[1,2,3,4,5]){const on=beforeExpert(ordinal),off=beforeExpert(ordinal,false);const a=turn(on,0,'resource-market-4'),b=turn(off,0,'resource-market-4');const target=['wood','clay','reed','stone','stone'][ordinal-1]!;for(const type of['wood','clay','reed','stone']as const)assert.equal(a.state.players[0]!.resources[type]-b.state.players[0]!.resources[type],type===target?1:0);assert.equal(getRoundPersonPlacementOrder(a.state.players[0]!).length,ordinal);save(`A163-N1-${ordinal}`,{a,b})}})
  it('A163 N2 ordinary accumulation opponent market and hand cannot grant owner mapped resource',()=>{const on=setup(EXPERT),off=setup(EXPERT,undefined,false);const a=turn(on,0,'forest'),b=turn(off,0,'forest');assert.equal(a.state.players[0]!.resources.wood,b.state.players[0]!.resources.wood);const s=setup(EXPERT);turn(s,0,'grain-seeds');const r=turn(s,1,'resource-market-4');assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.clay,0);save('A163-N2',{a,b,r})})
  it('A163 N3 occupied market rejects and whole undo restores material before one retry',()=>{const s=beforeExpert(1);const r=turn(s,0,'resource-market-4');assertRejectedUnchanged(s,()=>s.takeAction(0,'resource-market-4'));const undone=ok(s.undoAction());for(const type of['wood','clay','reed','stone']as const)assert.equal(undone.state.players[0]!.resources[type],0);const retry=turn(s,0,'resource-market-4');assert.deepEqual(retry.state.players[0]!.resources,r.state.players[0]!.resources);save('A163-N3',{r,undone,retry})})
})
