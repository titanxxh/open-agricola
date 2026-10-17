import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit16Phases from './_helpers/audit/ae-negative-16-phases'

describe('ae-negative-16-phases', () => {
  const { TURNIP, sessions, save, ok, setup, turn, end, SIX } = audit16Phases
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A141 N1 both own and opponent occupied spaces grant vegetable only at return home',()=>{for(const spaces of [SIX,['day-laborer','forest','grain-seeds','reed-bank','clay-pit','fishing']]){const s=setup(TURNIP);turn(s,0,spaces[0]!);assert.equal(s.getState().state.players[0]!.resources.vegetable,0);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.vegetable,0);const {r}=end(s,spaces);assert.equal(r.state.round,6);assert.equal(r.state.players[0]!.resources.vegetable,1);assert.equal(r.state.players[1]!.resources.vegetable,0);save(`A141-N1-${spaces[0]}`,r)}})
  it('A141 N2 either or both unoccupied named spaces cannot award vegetable',()=>{for(const spaces of [['grove','day-laborer','forest','reed-bank','clay-pit','fishing'],['grain-seeds','hollow','forest','reed-bank','clay-pit','fishing'],['grove','hollow','forest','reed-bank','clay-pit','fishing']]){const {r}=end(setup(TURNIP),spaces);assert.equal(r.state.players[0]!.resources.vegetable,0);save(`A141-N2-${spaces[0]}-${spaces[1]}`,r)}})
  it('A141 N3 hand never grants return home reward and natural harvest does not duplicate',()=>{const hand=end(setup(TURNIP,5,undefined,false),SIX).r;assert.equal(hand.state.players[0]!.resources.vegetable,0);const harvested=end(setup(TURNIP,4),SIX).r;assert.equal(harvested.state.round,5);assert.equal(harvested.state.players[0]!.resources.vegetable,1);assert.equal(sessions.at(-1)!.getState().state.players[0]!.resources.vegetable,1);save('A141-N3',{hand,harvested})})
})
