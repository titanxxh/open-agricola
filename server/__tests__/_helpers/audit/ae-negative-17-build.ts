// Helpers of ae-negative-17-build-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='A167_BreederBuyer'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/17-build-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,options:{playerCount:4},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function build(s:GameSession,r:SessionResponse,first:'room'|'stable',counts={room:1,stable:1}){const remaining={...counts};for(let n=0;n<20&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){const kind=i.request.farm.farmType;assert.ok(kind==='room'||kind==='stable');if(kind==='room')r=ok(s.commitSelectionChoice(i.playerIndex,{rooms:[{row:1,col:1},{row:2,col:1}].slice(0,remaining.room)}));else r=ok(s.commitSelectionChoice(i.playerIndex,{stables:[{row:0,col:1},{row:0,col:2}].slice(0,remaining.stable)}));remaining[kind]=0;}else{assert.ok(i.request.kind==='choice',JSON.stringify(i));const kind=remaining[first]?first:remaining.room?'room':remaining.stable?'stable':null;const label=kind==='room'?'actions.construct.name':'actions.stables.name';const o=i.request.options.find(o=>kind?o.labelKey===label:o.value==='__skip__'||o.value==='__done__')??i.request.options.find(o=>o.value==='__skip__'||o.value==='__done__');assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value));}}return r}
export function farm(type:'wood'|'clay'|'stone',played=true,counts={room:1,stable:1}){return setup(CARD,state=>{const p=state.players[0]!;p.houseType=type;Object.assign(p.resources,{wood:2*counts.stable+(type==='wood'?5*counts.room:0),clay:type==='clay'?5*counts.room:0,stone:type==='stone'?5*counts.room:0,reed:2*counts.room})},played)}
