import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B045_StrawberryPatch } from '../../shared/cards/B/B045_StrawberryPatch'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit20FutureFood from './_helpers/audit/ae-negative-20-future-food'

describe('B045_StrawberryPatch prerequisite', () => {
  it('blocks when player has fewer than 2 vegetable fields', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    expect(session.withCtx(() => meetsCardPrerequisites(player, B045_StrawberryPatch, state.round, state))).toBe(false)
  })

  it('allows when player has 2 vegetable fields', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    expect(session.withCtx(() => meetsCardPrerequisites(player, B045_StrawberryPatch, state.round, state))).toBe(true)
  })
})

describe('ae-negative-20-future-food', () => {
  const { PATCH, sessions, save, ok, setup, menu, buy, schedule, reach, vegetables } = audit20FutureFood
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B045 N1 real one wood and two own vegetable fields purchase grants two printed points and next three food',()=>{const s=setup(PATCH,5,state=>{state.players[0]!.resources.wood=1;vegetables(state)}),{pending,r}=buy(s,PATCH);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,100);assert.deepEqual(schedule(r,PATCH),[6,7,8].map(round=>({round,resources:{food:1}})));assert.equal(r.scores![0]!.categories.find(c=>c.key==='cards')!.entries.find(e=>'cardId'in e&&e.cardId===PATCH)!.score,2);save('B045-N1',{pending,r})})
  it('B045 N2 missing wood one field empty grain or opponent fields cannot buy Strawberry Patch',()=>{for(const mode of['wood','one','empty','grain','opponent','two-stacks']){const s=setup(PATCH,5,state=>{const p=state.players[0]!;p.resources.wood=mode==='wood'?0:1;vegetables(state,mode==='one'||mode==='two-stacks'?1:2);if(mode==='empty')p.fields.forEach(f=>f.stacks=[]);if(mode==='grain')p.fields.forEach(f=>f.stacks=[{kind:'grain',remaining:2}]);if(mode==='opponent'){state.players[1]!.fields=p.fields;p.fields=[]}if(mode==='two-stacks')p.fields[0]!.stacks.push({kind:'vegetable',remaining:1})}),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,PATCH));const legal=ok(s.resolveChoice(0,'B004_WoodPile'));assert.equal(schedule(legal,PATCH).length,0);assert.equal(legal.state.players[0]!.resources.food,100);save(`B045-N2-${mode}`,{pending,legal})}})
  it('B045 N3 natural next three rounds grant food once each and late purchase never clamps invalid targets',()=>{const s=setup(PATCH,5,state=>{state.players[0]!.resources.wood=1;vegetables(state)}),control=setup(PATCH,5,state=>vegetables(state));buy(s,PATCH);buy(control,'B004_WoodPile');const six=reach(s,6),csix=reach(control,6),seven=reach(s,7),cseven=reach(control,7),eight=reach(s,8),ceight=reach(control,8);assert.equal(six.state.players[0]!.resources.food,csix.state.players[0]!.resources.food+1);assert.equal(seven.state.players[0]!.resources.food,cseven.state.players[0]!.resources.food+2);assert.equal(eight.state.players[0]!.resources.food,ceight.state.players[0]!.resources.food+3);assert.equal(eight.state.players[1]!.resources.food,ceight.state.players[1]!.resources.food);for(const round of[12,13,14]){const ss=setup(PATCH,round,state=>{state.players[0]!.resources.wood=1;vegetables(state)}),r=buy(ss,PATCH).r;assert.deepEqual(schedule(r,PATCH).map(e=>e.round),[1,2,3].map(n=>n+round).filter(n=>n<=14));save(`B045-N3-${round}`,r)}save('B045-N3',{six,seven,eight})})
  it('B045 N4 purchase undo restores cost score and fields and retry queues only once',()=>{const s=setup(PATCH,5,state=>{state.players[0]!.resources.wood=1;vegetables(state)}),r=buy(s,PATCH).r,undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.equal(schedule(undone,PATCH).length,0);assert.equal(undone.state.players[0]!.fields.length,2);const retry=buy(s,PATCH).r;assert.equal(schedule(retry,PATCH).length,3);save('B045-N4',{r,undone,retry})})
})
