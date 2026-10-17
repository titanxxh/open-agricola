// Helpers of ae-negative-22-muddy-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import { getCardStack } from '../../../../shared/cards/helpers/card-state'

export const CARD='B083_MuddyPuddles'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/22-muddy-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const options=i.request.options,o=options.find(o=>(!('disabled'in o)||!o.disabled)&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function menu(s:GameSession){ready(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=finish(s,ok(s.resolveChoice(0,card)));if(['B004_WoodPile','A006_StorageBarn'].includes(card)){assert.ok(!r.state.players[0]!.minorPlayed.includes(card));assert.ok(r.state.players[1]!.minorHand.includes(card))}else assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export const ANY='B83-muddy-puddles-anytime'
export function make(clay=7){return setup(CARD,5,state=>{const p=state.players[0]!;p.resources.clay=clay;const tiles=[{row:0,col:2},{row:0,col:3},{row:0,col:4}];p.pastures=tiles.map((t,i)=>({id:`muddy-${i}`,tiles:[t],animalType:null,animalCount:0}));const edges=[...tiles.flatMap(t=>[`H-0-${t.col}`,`H-1-${t.col}`]),...Array.from({length:4},(_,i)=>`V-0-${2+i}`)];p.fenceSegments=edges.map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}))})}
export function enter(s:GameSession){let r=ready(s);if(r.state.currentPlayerIndex!==0){r=finish(s,ok(s.takeAction(r.state.currentPlayerIndex,'grain-seeds')));r=ready(s)}return ok(s.takeAction(0,'farmland'))}
export function take(s:GameSession){let r=ok(s.takeAnytimeAction(0,ANY));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='animal-reorg'){const req=r.interaction.request,animals=['sheep','cattle','boar']as const,zones=req.zones.filter(z=>z.zoneType==='pasture').map((z,i)=>({...z,animalType:animals[i]!,animalCount:r.state.players[0]!.resources[animals[i]!]??0}));r=ok(s.resolveChoice(0,'confirm',{zones}))}return r}
export function stack(r:SessionResponse){return getCardStack(r.state.players[0]!,CARD)}
