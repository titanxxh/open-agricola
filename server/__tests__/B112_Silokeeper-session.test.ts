import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit26Silokeeper from './_helpers/audit/ae-negative-26-silokeeper'

describe('ae-negative-26-silokeeper', () => {
  const { sessions, save, ok, REVEALED, make, use } = audit26Silokeeper
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B112 N1 real most recent preharvest revealed action grants exactly one grain across all ten eligible rounds',()=>{for(const round of[5,6,7,8,9,10,11,12,13,14]){const s=make(round),control=make(round,false),before=ok(s.getState()),id=before.state.roundActionOrder[REVEALED[round]!-1]!;assert.ok(id);assert.equal(id,control.state.roundActionOrder[REVEALED[round]!-1]);const r=use(s,id),c=use(control,id);assert.equal(r.state.players[0]!.resources.grain,c.state.players[0]!.resources.grain+1);assert.equal(r.state.players[1]!.resources.grain,c.state.players[1]!.resources.grain);save(`B112-N1-${round}`,{before,id,r,c})}})
  it('B112 N2 before first harvest or basic unrelated space creates no additional grain',()=>{for(const round of[1,4,8]){const s=make(round),control=make(round,false),r=use(s,'reed-bank'),c=use(control,'reed-bank');assert.equal(r.state.players[0]!.resources.grain,c.state.players[0]!.resources.grain);save(`B112-N2-${round}`,{r,c})}})
  it('B112 N3 actual opponent most recent preharvest action and owner card still in hand receive no card bonus',()=>{const s=make(8),first=use(s,'grain-seeds'),control=make(8,false);use(control,'grain-seeds');const id=s.state.roundActionOrder[6]!,r=use(s,id,1),c=use(control,id,1);assert.equal(r.state.players[0]!.resources.grain,c.state.players[0]!.resources.grain);assert.equal(r.state.players[1]!.resources.grain,c.state.players[1]!.resources.grain);save('B112-N3',{first,id,r,c})})
  it('B112 N4 whole qualifying real action undo removes one grain and occupancy before exact single replay',()=>{const s=make(8),before=ok(s.getState()),id=before.state.roundActionOrder[6]!,r=use(s,id),undone=ok(s.undoAction());assert.deepEqual(undone.state.players[0]!.resources,before.state.players[0]!.resources);assert.deepEqual(undone.state.actionSpaces,before.state.actionSpaces);const retry=use(s,id);assert.equal(retry.state.players[0]!.resources.grain,r.state.players[0]!.resources.grain);save('B112-N4',{before,id,r,undone,retry})})
})
