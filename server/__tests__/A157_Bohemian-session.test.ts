import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit17Bohemian from './_helpers/audit/ae-negative-17-bohemian'

describe('ae-negative-17-bohemian', () => {
  const { CARD, sessions, save, ok, setup, turn, EIGHT, play } = audit17Bohemian
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A157 N1 actual returning home with both Lessons empty grants exactly one owner food',()=>{const on=play(EIGHT),off=play(EIGHT,false);assert.equal(on.r.state.round,6);assert.equal(on.r.state.players[0]!.resources.food-off.r.state.players[0]!.resources.food,1);for(const actor of[1,2,3])assert.equal(on.r.state.players[actor]!.resources.food,off.r.state.players[actor]!.resources.food);save('A157-N1',{on:on.r,off:off.r})})
  it('A157 N2 either empty Lessons space grants one food and both occupied grant none',()=>{for(const mode of['lessons','lessons-4','both']){const spaces=[...EIGHT];spaces[1]=mode==='lessons-4'?'lessons-4':'lessons';if(mode==='both')spaces[2]='lessons-4';const on=play(spaces),off=play(spaces,false);assert.equal(on.r.state.players[0]!.resources.food-off.r.state.players[0]!.resources.food,mode==='both'?0:1);save(`A157-N2-${mode}`,{on:on.r,off:off.r})}})
  it('A157 N3 work placement cannot grant early reward and normal harvest does not duplicate',()=>{const s=setup(CARD,4);const early=turn(s,0,'grain-seeds');assert.equal(early.state.players[0]!.resources.food,60);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,60);const on=play(EIGHT,true,4),off=play(EIGHT,false,4);assert.equal(on.r.state.round,5);assert.equal(on.r.state.players[0]!.resources.food-off.r.state.players[0]!.resources.food,1);assert.equal(on.s.getState().state.players[0]!.resources.food,on.r.state.players[0]!.resources.food);save('A157-N3',{early,undone,on:on.r,off:off.r})})
})
