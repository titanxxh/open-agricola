import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit26RoundStart from './_helpers/audit/ae-negative-26-round-start'

describe('ae-negative-26-round-start', () => {
  const { CHILD, sessions, save, finish, nextRound, make, crop } = audit26RoundStart
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B114 N1 natural round start with three or four actual rooms and two people gains one food plus exactly one chosen crop',()=>{for(const[rooms,kind]of[[3,'grain'],[4,'vegetable']]as const){const s=make(CHILD,8,true,0,rooms),control=make(CHILD,8,false,0,rooms),pending=nextRound(s,9),r=crop(s,pending,kind),c=finish(control,nextRound(control,9),false);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food+1);assert.equal(r.state.players[0]!.resources[kind],c.state.players[0]!.resources[kind]+1);assert.equal(r.state.players[0]!.resources[kind==='grain'?'vegetable':'grain'],c.state.players[0]!.resources[kind==='grain'?'vegetable':'grain']);save(`B114-N1-${rooms}-${kind}`,{pending,r,c})}})
  it('B114 N2 two rooms three people or card still in hand excludes both crop and food reward',()=>{for(const mode of['rooms','people','hand']){const s=make(CHILD,8,mode!=='hand',0,mode==='rooms'?2:3,mode==='people'?3:2),control=make(CHILD,8,false,0,mode==='rooms'?2:3,mode==='people'?3:2),r=finish(s,nextRound(s,9),false),c=finish(control,nextRound(control,9),false);assert.deepEqual(['food','grain','vegetable'].map(k=>r.state.players[0]!.resources[k as 'food']),['food','grain','vegetable'].map(k=>c.state.players[0]!.resources[k as 'food']));save(`B114-N2-${mode}`,{r,c})}})
  it('B114 N3 unknown round start crop rejects without state mutation before the exact legal crop',()=>{const s=make(CHILD),pending=nextRound(s,9),error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'missing-crop')),r=crop(s,pending,'vegetable');assert.equal(r.state.players[0]!.resources.vegetable,1);save('B114-N3',{pending,error,r})})
})
