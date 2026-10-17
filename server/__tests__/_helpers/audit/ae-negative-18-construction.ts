// Helpers of ae-negative-18-construction-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const PARLOR='B013_CarpentersParlor',HAMMER='B016_MiningHammer'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/18-construction-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.minorPlayed=played?[card]:[];state.players[0]!.minorHand=played?['A030_BakingSheet']:[card,'A030_BakingSheet','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function choose(s:GameSession,r:SessionResponse,label?:string,accept=true){for(let n=0;n<12&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice';n++){const o=r.interaction.request.options.find(o=>!o.disabled&&(accept?(label?o.labelKey===label:o.value!=='__skip__'&&o.value!=='__done__'):o.value==='__skip__'||o.value==='__done__'))??(accept?r.interaction.request.options.find(o=>!o.disabled&&o.value!=='__skip__'&&o.value!=='__done__'):undefined);assert.ok(o,JSON.stringify(r.interaction));r=ok(s.resolveChoice(r.interaction.playerIndex,o.value));}return r}
export function room(s:GameSession,count=1){const pending=choose(s,turn(s,0,'farm-expansion'),'actions.construct.name');assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select'&&pending.interaction.request.farm.farmType==='room');let r=ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1},{row:2,col:1}].slice(0,count)}));r=choose(s,r,undefined,false);return {pending,r}}
export function renovation(type:'wood'|'clay'='wood',played=true,configure:(state:GameState)=>void=()=>{}){return setup(HAMMER,state=>{const p=state.players[0]!;p.houseType=type;p.resources[type==='wood'?'clay':'stone']=2;p.resources.reed=1;configure(state)},played)}
export function stable(s:GameSession,r:SessionResponse){const pending=choose(s,r);assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select'&&pending.interaction.request.farm.farmType==='stable');return ok(s.commitSelectionChoice(0,{stables:[pending.interaction.request.farm.selectableTiles[0]!]}))}
