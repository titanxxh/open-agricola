// Helpers of ae-negative-19-cooking-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B029_CookeryLesson',OCC='A110_Roughcaster'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/19-cooking-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(played=true,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players){Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});p.occupationHand=[OCC,'A114_SeasonalWorker']}const p=state.players[0]!;p.minorHand=played?['A030_BakingSheet']:[CARD,'A030_BakingSheet','A006_StorageBarn'];p.minorPlayed=played?[CARD]:[];p.improvements=['Major_Fireplace1'];p.resources.vegetable=2;configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finish(s:GameSession,r:SessionResponse){for(let n=0;n<16&&r.interaction.stateId==='wait'&&(r.interaction.request.kind==='choice'||r.interaction.request.kind==='select-trigger');n++){const o=r.interaction.request.options.find(o=>o.value!=='__skip__'&&o.value!=='__done__')??r.interaction.request.options[0];assert.ok(o);r=ok(s.resolveChoice(r.interaction.playerIndex,o.value))}return r}
export function points(r:SessionResponse){return r.scores![0]!.categories.find(c=>c.key==='cardBonusVp')?.entries.filter(e=>'cardId'in e&&e.cardId===CARD).reduce((n,e)=>n+e.score,0)??0}
export function exchange(s:GameSession,index:number){const pending=ok(s.takeAnytimeAction(0,'exchange')),r=ok(s.resolveChoice(0,`bulk:${index}=1`));return{pending,r}}
export function cookIndex(r:SessionResponse,resource:string){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const o=r.interaction.request.options.find(o=>o.value.startsWith('trade:')&&JSON.stringify(o).toLowerCase().includes(resource));assert.ok(o,JSON.stringify(r.interaction));return Number(o.value.split(':')[1])}
export function cook(s:GameSession,resource='vegetable'){const pending=ok(s.takeAnytimeAction(0,'exchange')),index=cookIndex(pending,resource),r=ok(s.resolveChoice(0,`bulk:${index}=1`));return{pending,r}}
export function occupation(s:GameSession){const r=s.getState();assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.request.options.some(o=>o.value===OCC));return finish(s,ok(s.resolveChoice(0,OCC)))}
