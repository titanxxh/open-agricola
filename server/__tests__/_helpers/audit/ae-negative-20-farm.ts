// Helpers of ae-negative-20-farm-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B052_GrowingFarm'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/20-farm-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function pasture(state:GameState,n:number,owner=0){if(!n)return;const p=state.players[owner]!,edges:string[]=[];assert.ok(n<=5);for(let col=0;col<n;col++)edges.push(`H-0-${col}`,`H-1-${col}`);edges.push('V-0-0',`V-0-${n}`);p.pastures=[{id:'one-pasture',tiles:Array.from({length:n},(_,col)=>({row:0,col})),animalType:null,animalCount:0}];p.fenceSegments=edges.map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}));assert.ok(edges.length<=15)}
export function setup(round=5,n=4,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:3},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[CARD,'B004_WoodPile','A006_StorageBarn'];p.resources.clay=2;p.resources.reed=1;pasture(state,n);configure(state)}});sessions.push(s);return s}
export function menu(s:GameSession){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}return r}
export function buy(s:GameSession){const pending=menu(s),r=ok(s.resolveChoice(0,CARD));assert.ok(r.state.players[0]!.minorPlayed.includes(CARD));return{pending,r}}
