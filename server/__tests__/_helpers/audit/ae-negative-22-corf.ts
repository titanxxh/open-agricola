// Helpers of ae-negative-22-corf-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B079_Corf'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/22-corf-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const options=i.request.options,o=options.find(o=>(!('disabled'in o)||!o.disabled)&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function menu(s:GameSession){ready(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=finish(s,ok(s.resolveChoice(0,card)));if(['B004_WoodPile','A006_StorageBarn'].includes(card)){assert.ok(!r.state.players[0]!.minorPlayed.includes(card));assert.ok(r.state.players[1]!.minorHand.includes(card))}else assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function make(n=3,played=false,third=false){return setup(CARD,9,state=>{const p=state.players[0]!;p.resources.reed=1;if(third){p.roomTiles.push({row:1,col:1});p.rooms=3;p.workers[2]!.isActive=true}if(played){p.minorPlayed=[CARD];p.minorHand=p.minorHand.filter(x=>x!==CARD)}state.actionSpaces.find(a=>a.id==='western-quarry')!.resources.stone=n;state.actionSpaces.find(a=>a.id==='eastern-quarry')!.resources.stone=n})}
export function use(s:GameSession,actor:number,space:string){const before=ready(s);assert.equal(before.state.currentPlayerIndex,actor);return{before,r:finish(s,ok(s.takeAction(actor,space)))}}
