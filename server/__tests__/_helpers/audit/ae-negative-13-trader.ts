// Helpers of ae-negative-13-trader-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'

export const TRADER='A109_SmallTrader', MINOR='A030_BakingSheet', PAID='A037_Bucksaw', MAJOR='Major_Fireplace1'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/13-trader-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,configure(state){state.round=14;for(const p of state.players){Object.assign(p.resources,{food:40,wood:1,clay:2,reed:0,stone:0,grain:0,vegetable:0});p.minorHand=[MINOR,PAID]}state.players[0]!.occupationPlayed=played?[TRADER]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[TRADER];state.availableMajorImprovements=[MAJOR];configure(state)}});sessions.push(s);return s}
export function enter(s:GameSession,space:string,actor=0){let r=ok(s.takeAction(actor,space));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const action=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(action)r=ok(s.resolveChoice(actor,action.value))}return r}
export function select(s:GameSession,r:SessionResponse,card:string,actor=0){for(let n=0;n<8&&r.interaction.stateId==='wait';n++){if(r.state.players[actor]!.minorPlayed.includes(card)||r.state.players[actor]!.improvements.includes(card))break;assert.ok(r.interaction.request.kind==='choice'||r.interaction.request.kind==='select-trigger',JSON.stringify(r.interaction));const o=r.interaction.request.options.find(o=>o.value===card||o.value===`major:${card}`||o.value===`minor:${card}`)??r.interaction.request.options.find(o=>o.value==='A023_StoneCompany')??r.interaction.request.options.find(o=>o.value!=='__skip__'&&(!('disabled' in o)||!o.disabled));assert.ok(o);r=ok(s.resolveChoice(actor,o.value))}return r}
