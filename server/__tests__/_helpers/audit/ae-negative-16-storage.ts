// Helpers of ae-negative-16-storage-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import { getStoredResource, setStoredResource } from '../../../../shared/cards/helpers/card-storage'

export const CARD='A144_Sequestrator'
export const TWO=['H-0-2','H-1-2','V-0-2','V-0-3','H-2-2','V-1-2','V-1-3']
export const THREE=[...TWO,'H-3-2','V-2-2','V-2-3']
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/16-storage-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function fields(state:GameState,actor:number,count:number){state.players[actor]!.fields=Array.from({length:count},(_,n)=>({row:n<5?0:1,col:n%5,stacks:[],crop:null,remaining:0}))}
export function fences(state:GameState,actor:number,edges:string[]){const p=state.players[actor]!;p.fenceSegments=edges.map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}))}
export function setup(configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,options:{playerCount:3},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:15,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.occupationPlayed=played?[CARD]:[];p.occupationHand=played?['__test_placeholder__']:[CARD,'A110_Roughcaster'];if(played){setStoredResource(p,CARD,'reed',3);setStoredResource(p,CARD,'clay',4)}configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function close(s:GameSession,r:SessionResponse){for(let n=0;n<10&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else assert.fail(JSON.stringify(i))}return r}
export function plow(s:GameSession,actor:number,space='farmland'){let r=turn(s,actor,space);assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='plow');const tile=r.interaction.request.farm.selectableTiles[0];assert.ok(tile);r=ok(s.commitSelectionChoice(actor,{tile}));return close(s,r)}
export function fence(s:GameSession,actor:number,edges=THREE){const r=turn(s,actor,'fencing');assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select');return close(s,ok(s.commitSelectionChoice(actor,{edges,palisadeEdges:[]})))}
export function store(r:SessionResponse){return ['reed','clay'].map(t=>getStoredResource(r.state.players[0]!,CARD,t as 'reed'|'clay'))}
