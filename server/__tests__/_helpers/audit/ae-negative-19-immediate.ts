// Helpers of ae-negative-19-immediate-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const MANTLE='B033_Mantlepiece',BOTTLES='B036_Bottles',GRANGE='B037_Grange'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/19-immediate-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});state.players[0]!.minorHand=[card,'A030_BakingSheet','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function menu(s:GameSession){let r=turn(s,0,'meeting-place');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=ok(s.resolveChoice(0,card));assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function score(r:SessionResponse,card:string,key='cards'){assert.ok(r.scores);return r.scores[0]!.categories.find(c=>c.key===key)?.entries.filter(e=>'cardId'in e&&e.cardId===card).reduce((n,e)=>n+e.score,0)??0}
export function denied(s:GameSession,card:string){const pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,card));const r=ok(s.resolveChoice(0,'A030_BakingSheet'));assert.ok(r.state.players[0]!.minorHand.includes(card));return{pending,r}}
export function family(state:GameState,n:number){const p=state.players[0]!;p.rooms=n;p.roomTiles=[{row:1,col:0},{row:2,col:0},{row:1,col:1},{row:2,col:1},{row:0,col:1}].slice(0,n);assert.equal(p.workers.length,5);p.workers.forEach((w,i)=>{w.isActive=i<n;w.isNewborn=false})}
export function farm(state:GameState,fields=6,missing=''){const p=state.players[0]!;p.fields=Array.from({length:fields},(_,i)=>({row:Math.floor(i/3),col:i%3+2,stacks:[]}));const edges=new Set<string>();for(let row=0;row<3;row++)for(const e of[`H-${row}-1`,`H-${row+1}-1`,`V-${row}-1`,`V-${row}-2`])edges.add(e);assert.ok(edges.size<=15);p.fenceSegments=[...edges].map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}));p.pastures=(['sheep','boar','cattle']as const).map((animal,row)=>({id:animal,tiles:[{row,col:1}],animalType:animal===missing?null:animal,animalCount:animal===missing?0:1}));for(const animal of['sheep','boar','cattle']as const)p.resources[animal]=animal===missing?0:1}
