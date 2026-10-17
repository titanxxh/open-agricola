// Helpers of ae-negative-22-cottager-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B087_Cottager'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/22-cottager-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const options=i.request.options,o=options.find(o=>(!('disabled'in o)||!o.disabled)&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function make(played=true,wood=5,clay=2,reed=2){return setup(8,state=>{const p=state.players[0]!;p.minorHand=['B004_WoodPile'];p.occupationHand=[CARD];p.occupationPlayed=played?[CARD]:[];Object.assign(p.resources,{wood,clay,reed});Object.assign(state.players[1]!.resources,{wood:5,clay:2,reed:2})})}
export function enter(s:GameSession){ready(s);return ok(s.takeAction(0,'day-laborer'))}
export function branch(s:GameSession,r:SessionResponse,kind:'room'|'renovate'){for(let n=0;n<6&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice';n++){const i=r.interaction;assert.equal(i.request.kind,'choice');const o=i.request.options.find(o=>o.labelKey===(kind==='room'?'actions.construct.name':'actions.renovate.name'))??i.request.options.find(o=>o.value!=='__skip__'&&o.value!=='__done__');assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value));if(kind==='room'&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select')break}return r}
export function build(s:GameSession){const pending=branch(s,enter(s),'room');assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select'&&pending.interaction.request.farm.farmType==='room');const r=finish(s,ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1}]})),false);return{pending,r}}
export function setup(round:number,configure:(state:GameState)=>void){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});configure(state)}});sessions.push(s);return s}
