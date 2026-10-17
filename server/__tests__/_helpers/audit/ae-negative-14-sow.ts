// Helpers of ae-negative-14-sow-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const FORESTER='A115_ChiefForester',PAN='A122_PanBaker',FIELD='D075_WoodField'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/14-sow-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card];state.players[0]!.fields=[{row:0,col:1,stacks:[]},{row:0,col:2,stacks:[]}];state.players[0]!.resources.grain=2;configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function sow(s:GameSession,r:SessionResponse){for(let n=0;n<5&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='farm-select';n++){const i=r.interaction;assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger');const o=i.request.options.find(o=>o.value!=='__skip__'&&o.value!=='__done__');assert.ok(o);r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow');return r}
