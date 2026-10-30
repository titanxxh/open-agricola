// Helpers of ae-negative-18-pasture-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B002_MiniPasture'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/18-pasture-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:2,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.minorHand=[CARD,'A030_BakingSheet','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function enter(s:GameSession){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');r=ok(s.takeAction(0,'meeting-place'));for(let n=0;n<5;n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const c=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(!c)break;r=ok(s.resolveChoice(0,c.value))}return r}
export function buy(s:GameSession){enter(s);const r=ok(s.resolveChoice(0,CARD));assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='fence');save('purchased-before-fence',r);return r}
export function commit(s:GameSession,edges:string[]){return ok(s.commitSelectionChoice(0,{edges,palisadeEdges:[]}))}
export const FIRST=['H-0-2','H-1-2','V-0-2','V-0-3'],ADJ=['H-0-3','H-1-3','V-0-4'],REMOTE=['H-2-3','H-3-3','V-2-3','V-2-4']
export function existing(state:GameState){const p=state.players[0]!;p.fenceSegments=FIRST.map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}));p.pastures=[{id:'old',tiles:[{row:0,col:2}],animalType:null,animalCount:0}]}
