import '../../shared/cards/A/A016_RammedClay'
import '../../shared/cards/A/A017_ReclamationPlow'
import '../../shared/cards/A/A019_Handplow'
import '../../shared/cards/A/A009_YoungAnimalMarket'
import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { markAllWorkersUsed } from '../../shared/domain/player'
import * as audit05Fields from './_helpers/audit/ae-negative-05-fields'

describe('ae-negative-05-fields', () => {
  const { HANDPLOW, sessions, setup, ok, choices, enter, buy, accept, plow, future, due } = audit05Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A019 N1 paid real purchases schedule exactly round plus five within the fourteen round boundary', () => {
    for (const [round,target] of [[5,10],[9,14],[10,0]]) {
      const s = setup(HANDPLOW,{played:false,round,resources:{wood:1}})
      const r = buy(s,enter(s),HANDPLOW)
      assert.equal(r.state.players[0]!.resources.wood,0)
      assert.equal(r.state.players[0]!.fields.length,0)
      assert.deepEqual(future(r),target?[{round:target,resources:{field:1},owner:r.state.players[0]!.id}]:[])
      assertRejectedUnchanged(s,()=>s.resolveChoice(0,HANDPLOW))
    }
  })
  it('A019 N2 unpaid forged purchase cannot schedule a field before legal retry', () => {
    const s=setup(HANDPLOW,{played:false})
    const offer=enter(s)
    assert.equal(choices(offer).some(o=>o.value===HANDPLOW&&!('disabled' in o && o.disabled)),false)
    assertRejectedUnchanged(s,()=>s.resolveChoice(0,HANDPLOW))
    const r=buy(s,offer,'A054_Credit')
    assert.deepEqual(future(r),[]); assert.equal(r.state.players[0]!.minorHand.includes(HANDPLOW),true)
  })
  it('A019 N3 actual queued due field rejects occupied outboard nonadjacent and wrong actor before one legal plow', () => {
    const {s,r}=due({existingField:true})
    const entered=accept(s,r)
    assertRejectedUnchanged(s,()=>s.commitSelectionChoice(1,{tile:{row:1,col:2}}))
    for(const tile of [{row:1,col:0},{row:99,col:99},{row:2,col:4}]) assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{tile}))
    const built=plow(s,entered,{row:1,col:2},2)
    assert.equal(built.state.players[0]!.fields.length,2); assert.deepEqual(future(built),[])
    assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{tile:{row:1,col:2}}))
  })
  it('A019 N4 declining due field consumes the token without field or refund', () => {
    const {s,r:dueResponse}=due()
    assert.ok(dueResponse.interaction.stateId==='wait' && dueResponse.interaction.request.kind==='select-trigger')
    assert.ok(dueResponse.interaction.request.options.some(o=>o.value==='__pass__'&&!('disabled' in o && o.disabled)))
    const r=ok(s.resolveChoice(0,'__pass__'))
    assert.equal(r.state.players[0]!.fields.length,0); assert.equal(r.state.players[0]!.resources.wood,0); assert.deepEqual(future(r),[])
  })
  it('A019 N5 undo restores purchase cost scheduled field card and worker before retry', () => {
    const s=setup(HANDPLOW,{played:false,resources:{wood:1}})
    const before=undoRuleSnapshot(s.getState())
    buy(s,enter(s),HANDPLOW)
    assertUndoRestored(before,s.undoAction())
    const r=buy(s,enter(s),HANDPLOW)
    assert.deepEqual(future(r),[{round:10,resources:{field:1},owner:r.state.players[0]!.id}])
  })
  it('A019 N6 preparation due flow exposes its actual undo boundary', () => {
    const {s,r}=due()
    const field=plow(s,accept(s,r),{row:0,col:1})
    assert.equal(field.state.players[0]!.fields.length,1); assert.deepEqual(future(field),[])
    assertRejectedUnchanged(s,()=>s.undoStep())
  })
  it('A019 N7 actual purchase queue remains inactive in preparation before the due round', () => {
    const s=setup(HANDPLOW,{played:false,resources:{wood:1}})
    buy(s,enter(s),HANDPLOW)
    const state=s.getState().state
    state.round=8
    state.players.forEach(p=>{p.resources.food=20;markAllWorkersUsed(state,p)})
    s.loadState(state)
    const early=ok(s.performRoundEnd())
    assert.equal(early.state.round,9);assert.equal(early.state.players[0]!.fields.length,0)
    assert.deepEqual(future(early),[{round:10,resources:{field:1},owner:early.state.players[0]!.id}])
    assert.equal(early.interaction.stateId,'idle')
  })
})
