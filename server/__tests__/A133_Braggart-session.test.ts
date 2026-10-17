import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import * as audit15Scoring from './_helpers/audit/ae-negative-15-scoring'

describe('ae-negative-15-scoring', () => {
  const { BRAG, MINORS, MAJORS, sessions, save, ok, setup, bonus, read } = audit15Scoring
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A133 N1 four through eleven own minors use every printed threshold and cap nine points',()=>{for(const [count,expected] of [[4,0],[5,2],[6,3],[7,4],[8,5],[9,7],[10,9],[11,9]]){const s=setup(BRAG,state=>state.players[0]!.minorPlayed=MINORS.slice(0,count));save(`A133-N1-${count}`,read(s,BRAG,expected!))}})
  it('A133 N2 mixed major minor in front counts five while occupations and hand cannot count',()=>{const s=setup(BRAG,state=>{const p=state.players[0]!;p.minorPlayed=MINORS.slice(0,3);p.improvements=MAJORS.slice(0,2);p.occupationPlayed.push('A110_Roughcaster');p.minorHand=MINORS.slice(3,8)});save('A133-N2',read(s,BRAG,2))})
  it('A133 N3 hand and opponent improvements cannot reward nonowner score',()=>{const c=(state:GameState)=>{state.players[0]!.minorPlayed=MINORS.slice(0,5);state.players[1]!.minorPlayed=MINORS.slice(5,11)};const hand=read(setup(BRAG,c,false),BRAG,0);const s=setup(BRAG,c,true,1);const other=read(s,BRAG,0);assert.equal(bonus(other,BRAG,1),3);save('A133-N3',{hand,other})})
  it('A133 N4 actual fifth improvement purchase raises threshold and undo removes it before retry',()=>{const s=setup(BRAG,state=>{state.players[0]!.minorPlayed=MINORS.slice(0,4);state.players[0]!.minorHand=['A030_BakingSheet','A056_Basket'];state.players[0]!.resources.wood=1});const before=read(s,BRAG,0);function buy(){let r=ok(s.takeAction(0,'major-improvement'));for(let n=0;n<8&&!r.state.players[0]!.minorPlayed.includes('A030_BakingSheet');n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const o=r.interaction.request.options.find(o=>o.value==='A030_BakingSheet'||o.value==='minor:A030_BakingSheet')??r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));assert.ok(o);r=ok(s.resolveChoice(0,o.value))}return r}const first=buy();assert.equal(bonus(first,BRAG),2);const undone=ok(s.undoAction());assert.equal(bonus(undone,BRAG),0);const retry=buy();assert.equal(bonus(retry,BRAG),2);save('A133-N4',{before,first,undone,retry})})
})
