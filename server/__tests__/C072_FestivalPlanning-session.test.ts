import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit41Private from './_helpers/audit/ae-negative-41-private'

describe('ae-negative-41-private', () => {
  const { sessions, ok, save, setup, finish, select, play, next, buyPending, field, cardSow, slots, extraMajor, occupations } = audit41Private
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C072 N1 actual purchase reaps only owner farm then real extra major purchase pays ordinary cost without feeding breeding or round advance',()=>{
   const s=setup('C072_FestivalPlanning',st=>{occupations(st);field(st,2);field(st,2,1);st.players[0]!.resources.clay=2},false,4),p=buyPending(s,'C072_FestivalPlanning'),r=extraMajor(s,p,'Major_Fireplace1');assert.equal(r.state.players[0]!.resources.food,99);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.clay,0);assert.ok(r.state.players[0]!.improvements.includes('Major_Fireplace1'));assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining,1);assert.equal(r.state.players[1]!.fields[0]!.stacks[0]!.remaining,2);assert.equal(r.state.players[1]!.resources.grain,0);assert.equal(r.state.round,4);assert.equal(r.state.roundPhase,'work');assert.equal(r.state.players[0]!.resources.begging,0);save('C072-N1',{p,r})
  })
  it('C072 N2 one occupation or zero food rejects before another legal improvement and never reaps fields',()=>{
   for(const mode of ['occupation','food']){const s=setup('C072_FestivalPlanning',st=>{occupations(st,mode==='occupation'?1:2);field(st,2);Object.assign(st.players[0]!.resources,{food:mode==='food'?0:100,wood:2,reed:1});st.players[0]!.minorHand.push('A057_MilkingParlor','A056_Basket')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'C072_FestivalPlanning')),r=finish(s,select(s,p,o=>o.value==='A057_MilkingParlor'));assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining,2);assert.equal(r.state.players[0]!.resources.grain,0);assert.ok(r.state.players[0]!.minorHand.includes('C072_FestivalPlanning'));save(`C072-N2-${mode}`,{p,bad,r})}
  })
  it('C072 N3 declining extra improvement preserves its hand while private Artichoke reap grants no food bonus',()=>{
   const s=setup('C072_FestivalPlanning',st=>{occupations(st);st.players[0]!.minorPlayed=['E072_ArtichokeField'];st.players[0]!.minorHand.push('A057_MilkingParlor');Object.assign(st.players[0]!.resources,{grain:1,wood:2})},false,5),planted=finish(s,cardSow(s,ok(s.takeAction(0,'grain-utilization')),'grain'));next(s,planted);next(s,finish(s,ok(s.takeAction(1,'reed-bank'))));const r=play(s,'C072_FestivalPlanning');assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.food,99);assert.equal(r.state.players[0]!.resources.wood,2);assert.ok(r.state.players[0]!.minorHand.includes('A057_MilkingParlor'));assert.deepEqual(slots(r,'E072_ArtichokeField'),[{crop:'grain',remaining:2}]);assert.equal(r.state.round,5);save('C072-N3',{planted,r})
  })
})
