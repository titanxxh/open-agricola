// Helpers of ae-negative-18-immediate-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const STORE='B005_StoreofExperience',QUARRY='B006_ExcursiontotheQuarry',WAGE='B007_Wage',STALL='B008_MarketStall'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/18-immediate-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.minorHand=[card,'A030_BakingSheet','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function menu(s:GameSession){let r=turn(s,0,'meeting-place');for(let n=0;n<4;n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(!o)return r;r=ok(s.resolveChoice(0,o.value))}assert.fail('Improvement menu did not settle')}
export function buy(s:GameSession,card:string){let r=menu(s);if(r.state.players[0]!.minorHand.includes(card)){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const o=r.interaction.request.options.find(o=>o.value===card&&!o.disabled);assert.ok(o,JSON.stringify(r.interaction));r=ok(s.resolveChoice(0,card))}assert.ok(r.state.players[1]!.minorHand.includes(card));assert.ok(!r.state.players[0]!.minorHand.includes(card));return r}
export const OCCS=['A110_Roughcaster','A114_SeasonalWorker','A119_FirewoodCollector','A103_Portmonger','A116_WoodCutter','A113_HeresyTeacher','A106_SlurrySpreader']
export const BOTTOM=['Major_ClayOven','Major_StoneOven','Major_Joinery','Major_Pottery','Major_Basket']
