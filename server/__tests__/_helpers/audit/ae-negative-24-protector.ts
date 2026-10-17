// Helpers of ae-negative-24-protector-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B094_StockProtector'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/24-protector-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const options=i.request.options,o=options.find(o=>(!('disabled'in o)||!o.disabled)&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export const EDGES=['H-0-1','H-1-1','V-0-1','V-0-2']
export function make(played=true,wood=2){return setup(CARD,8,state=>{const p=state.players[0]!;p.minorHand=['B004_WoodPile','A006_StorageBarn'];p.occupationPlayed=played?[CARD]:[];p.occupationHand=played?['__test_placeholder__']:[CARD];p.resources.wood=wood;state.players[1]!.resources.wood=4})}
export function turn(s:GameSession,actor:number,space:string){ready(s);assert.equal(s.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function fencePending(s:GameSession,r:SessionResponse){for(let n=0;n<8&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='farm-select';n++){assert.ok(r.interaction.request.kind==='choice'||r.interaction.request.kind==='select-trigger',JSON.stringify(r.interaction));const o=r.interaction.request.options.find(o=>o.value!=='__skip__'&&o.value!=='__done__');assert.ok(o);r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='fence',JSON.stringify(r.interaction));return r}
export function fence(s:GameSession){return ok(s.commitSelectionChoice(0,{edges:EDGES,palisadeEdges:[],extraWood:0}))}
export function extra(s:GameSession,r:SessionResponse){for(let n=0;n<8;n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));if(r.interaction.request.options.some(o=>o.value==='grain-seeds'))return r;const o=r.interaction.request.options.find(o=>o.value!=='__skip__'&&o.value!=='__done__');assert.ok(o);r=ok(s.resolveChoice(0,o.value))}assert.fail('No actual Stock Protector placement request')}
