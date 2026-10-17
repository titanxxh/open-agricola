// Helpers of ae-negative-19-occupations-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const PADDLE='B025_BreadPaddle',STUDIES='B028_ForestryStudies',OCC='A110_Roughcaster'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/19-occupations-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players){Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});p.occupationHand=[OCC,'A114_SeasonalWorker']}const p=state.players[0]!;p.minorHand=played?['A030_BakingSheet']:[card,'A030_BakingSheet','A006_StorageBarn'];p.minorPlayed=played?[card]:[];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function buy(s:GameSession,card:string){let pending=turn(s,0,'meeting-place');if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice'){const o=pending.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)pending=ok(s.resolveChoice(0,o.value))}const r=ok(s.resolveChoice(0,card));assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function choose(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<12&&r.interaction.stateId==='wait'&&(r.interaction.request.kind==='choice'||r.interaction.request.kind==='select-trigger');n++){const options=r.interaction.request.options;if(options.some(o=>o.value===OCC))break;const o=options.find(o=>(!('disabled'in o)||!o.disabled)&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(o,JSON.stringify(r.interaction));r=ok(s.resolveChoice(r.interaction.playerIndex,o.value))}return r}
export function occupation(s:GameSession,r:SessionResponse,actor=0){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');assert.ok(r.interaction.request.options.some(o=>o.value===OCC&&!o.disabled));return ok(s.resolveChoice(actor,OCC))}
export function paddle(played=true,grain=1,oven=true){return setup(PADDLE,state=>{const p=state.players[0]!;p.resources.grain=grain;p.improvements=oven?['Major_Fireplace1']:[];p.resources.wood=played?0:1},played)}
export function studies(wood=0,pile=2,played=true,configure:(state:GameState)=>void=()=>{}){return setup(STUDIES,state=>{state.players[0]!.resources.wood=wood;state.actionSpaces.find(a=>a.id==='forest')!.resources.wood=pile;configure(state)},played)}
