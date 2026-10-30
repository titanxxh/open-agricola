// Helpers of ae-negative-19-farm-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, FarmTilePosition } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const PALISADES='B030_WoodPalisades',SITE='B038_FutureBuildingSite'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/19-farm-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=false){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:20,clay:0,reed:2,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});state.players[0]!.minorHand=played?['A030_BakingSheet']:[card,'A030_BakingSheet','A006_StorageBarn'];state.players[0]!.minorPlayed=played?[card]:[];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function menu(s:GameSession){let r=turn(s,0,'meeting-place');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=ok(s.resolveChoice(0,card));assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function score(r:SessionResponse,card:string,key='cardBonusVp'){assert.ok(r.scores);return r.scores[0]!.categories.find(c=>c.key===key)?.entries.filter(e=>'cardId'in e&&e.cardId===card).reduce((n,e)=>n+e.score,0)??0}
export const REAL=['H-1-0','V-0-1'],PALI=['H-0-0','V-0-0'],ALL=[...REAL,...PALI]
export function fence(s:GameSession){return ok(s.commitSelectionChoice(0,{edges:REAL,palisadeEdges:PALI}))}
export const LOCKED:FarmTilePosition[]=[{row:0,col:0},{row:1,col:1},{row:2,col:1}]
export function site(configure:(state:GameState)=>void=()=>{},round=4){return setup(SITE,state=>{state.round=round;configure(state)})}
export function ownerAgain(s:GameSession){turn(s,1,'grain-seeds');return confirmNext(s,s.getState())}
export function select(s:GameSession,r:SessionResponse,label:string){for(let n=0;n<6&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice';n++){const o=r.interaction.request.options.find(o=>o.labelKey===label)??r.interaction.request.options.find(o=>!o.disabled&&o.value!=='__skip__'&&o.value!=='__done__');assert.ok(o);r=ok(s.resolveChoice(r.interaction.playerIndex,o.value))}return r}
