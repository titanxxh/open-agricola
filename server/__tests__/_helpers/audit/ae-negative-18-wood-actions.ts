// Helpers of ae-negative-18-wood-actions-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const BENCH='B015_CarpentersBench',PLOW='B017_ForestPlow'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/18-wood-actions-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,wood=0,pile=3,played=true,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.resources.wood=wood;p.minorPlayed=played?[card]:[];p.minorHand=played?['A030_BakingSheet']:[card,'A030_BakingSheet','A006_StorageBarn'];state.actionSpaces.find(a=>a.id==='forest')!.resources.wood=pile;configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function choose(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<8&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice';n++){const c=r.interaction.request.options.find(o=>!o.disabled&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(c,JSON.stringify(r.interaction));r=ok(s.resolveChoice(r.interaction.playerIndex,c.value))}return r}
export const FIRST=['H-0-2','H-1-2','V-0-2','V-0-3']
export function fence(s:GameSession){return ok(s.commitSelectionChoice(0,{edges:FIRST,palisadeEdges:[],extraWood:0}))}
export function plow(s:GameSession,r:SessionResponse){r=choose(s,r);assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='plow');return ok(s.commitSelectionChoice(0,{tile:r.interaction.request.farm.selectableTiles[0]!}))}
