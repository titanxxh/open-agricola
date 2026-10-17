// Helpers of ae-negative-19-scoring-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, FarmTilePosition } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const POTTERY='B031_PotteryYard',KETTLE='B032_Kettle'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/19-scoring-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=false){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});state.players[0]!.minorHand=played?['A030_BakingSheet']:[card,'A006_StorageBarn','B004_WoodPile'];state.players[0]!.minorPlayed=played?[card]:[];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function menu(s:GameSession){let r=turn(s,0,'meeting-place');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=ok(s.resolveChoice(0,card));assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function bonus(r:SessionResponse,card:string){assert.ok(r.scores);return r.scores![0]!.categories.find(c=>c.key==='cardBonusVp')?.entries.filter(e=>'cardId'in e&&e.cardId===card).reduce((n,e)=>n+e.score,0)??0}
export function farm(state:GameState,free:FarmTilePosition[]){const p=state.players[0]!,skip=new Set([...free,...p.roomTiles].map(t=>`${t.row},${t.col}`));p.fields=[];for(let row=0;row<3;row++)for(let col=0;col<5;col++)if(!skip.has(`${row},${col}`))p.fields.push({row,col,stacks:[]})}
export function kettle(grain=0,configure:(state:GameState)=>void=()=>{},played=false){return setup(KETTLE,state=>{const p=state.players[0]!;p.resources.clay=played?0:1;p.resources.grain=grain;p.fields=[{row:0,col:2,stacks:[{kind:'grain',remaining:1}]}];configure(state)},played)}
export function exchange(s:GameSession,index:number,count=1){const pending=ok(s.takeAnytimeAction(0,'exchange'));assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice',JSON.stringify(pending.interaction));const r=ok(s.resolveChoice(0,`bulk:${index}=${count}`));return{pending,r}}
