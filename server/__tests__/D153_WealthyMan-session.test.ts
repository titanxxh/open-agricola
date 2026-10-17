import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit55Phase from './_helpers/audit/ae-negative-55-phase'

describe('ae-negative-55-phase', () => {
  const { sessions, save, make, finish, score, end, grainFields } = audit55Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D153 N1 all six real harvest starts award exactly one point at the grain-field threshold and zero one field below',()=>{for(const[round,threshold]of[[4,1],[7,2],[9,3],[11,4],[13,5],[14,6]])for(const count of[threshold!-1,threshold!]){const s=make('D153_WealthyMan',st=>grainFields(st,count),true,round),r=finish(s,end(s));assert.equal(score(r,'D153_WealthyMan'),count===threshold?1:0);assert.equal(r.state.players[0]!.resources.grain,count);assert.ok(r.state.players[0]!.fields.every(f=>f.stacks[0]!.remaining===1));save(`D153-N1-${round}-${count}`,r)}})
  it('D153 N2 vegetable fields nonharvest round and hand card cannot award harvest grain-field points',()=>{for(const mode of['vegetable','round','hand']){const s=make('D153_WealthyMan',st=>grainFields(st,6,mode==='vegetable'?'vegetable':'grain'),mode!=='hand',mode==='round'?5:14),r=finish(s,end(s));assert.equal(score(r,'D153_WealthyMan'),0);save(`D153-N2-${mode}`,r)}})
})
