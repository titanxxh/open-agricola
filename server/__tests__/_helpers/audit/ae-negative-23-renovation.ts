// Helpers of ae-negative-23-renovation-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const ESTABLISHED='B088_EstablishedPerson',DWELLING='D002_DwellingPlan',MATERIALS='E002_RenovationMaterials'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/23-renovation-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const options=i.request.options,o=options.find(o=>(!('disabled'in o)||!o.disabled)&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function menu(s:GameSession){ready(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=finish(s,ok(s.resolveChoice(0,card)));assert.ok(!r.state.players[0]!.minorPlayed.includes(card));assert.ok(r.state.players[1]!.minorHand.includes(card));return{pending,r}}
export const FENCE=['H-0-1','H-1-1','V-0-1','V-0-2']
export function make(card:string,house:'wood'|'clay'|'stone'='wood',rooms=2,wood=0,clay=0,reed=0,food=100,animal=false){return setup(card,8,state=>{const p=state.players[0]!;Object.assign(p.resources,{food,wood,clay,reed});p.houseType=house;p.rooms=rooms;p.roomTiles=[{row:1,col:0},{row:2,col:0},...([{row:1,col:1},{row:2,col:1}]).slice(0,rooms-2)];if(animal){p.houseAnimals={'2-0':'sheep'};p.resources.sheep=1}if(card===ESTABLISHED){p.occupationHand=[card];p.minorHand=['B004_WoodPile','A006_StorageBarn']}})}
export function playEstablished(s:GameSession){ready(s);const before=ok(s.getState()),r=ok(s.takeAction(0,'lessons'));assert.ok(r.state.players[0]!.occupationPlayed.includes(ESTABLISHED));return{before,r}}
