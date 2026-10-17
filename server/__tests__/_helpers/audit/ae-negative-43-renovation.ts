// Helpers of ae-negative-43-renovation-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, ActionChoiceOption } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const EARLY='C083_EarlyCattle',ROOF='D081_RoofLadder',TROPHY='D082_HuntingTrophy',SWILL='D083_Pigswill'
export const sessions: GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/43/renovation-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,`${r.error} ${JSON.stringify(r.interaction)}`);const frozen:SessionResponse=JSON.parse(JSON.stringify(r));return frozen}
export function make(card:string,played=true,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4343,options:{playerCount:2},configure(state){state.round=14;state.availableMajorImprovements=[];for(const p of state.players){Object.assign(p.resources,{food:0,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});p.minorHand=['__test_placeholder__'];p.occupationHand=['__test_placeholder__'];p.minorPlayed=[];p.occupationPlayed=[]}const p=state.players[0]!;p.minorHand=played?['B004_WoodPile']:[card,'B004_WoodPile','B007_Wage'];p.minorPlayed=played?[card]:[];configure(state)}});sessions.push(s);return s}
export function options(r:SessionResponse):ActionChoiceOption[]{assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r.interaction.request.options}
export function choose(s:GameSession,r:SessionResponse,predicate:(o:ActionChoiceOption)=>boolean){assert.ok(r.interaction.stateId==='wait');const o=options(r).find(o=>!o.disabled&&predicate(o));assert.ok(o,JSON.stringify(r.interaction));return ok(s.resolveChoice(r.interaction.playerIndex,o.value))}
export function finish(s:GameSession,r:SessionResponse,accept=false){for(let n=0;n<24&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){r=passPreparationExchanges(s,r);if(r.interaction.stateId!=='wait')break;if(r.interaction.request.kind==='animal-reorg'){const zones=r.interaction.request.zones,p=r.state.players[r.interaction.playerIndex]!;const pasture=zones.find(z=>z.zoneType==='pasture'),house=zones.find(z=>z.zoneType==='house');const zone=pasture??house;assert.ok(zone);const animal=p.resources.cattle?'cattle':p.resources.boar?'boar':'sheep';r=ok(s.resolveChoice(r.interaction.playerIndex,'confirm',{zones:[{...zone,animalType:animal,animalCount:p.resources[animal]}]}));continue}if(r.interaction.request.kind==='confirm-player-switch'){r=ok(s.resolveChoice(r.interaction.request.fromPlayerIndex,'confirm'));continue}r=choose(s,r,o=>accept?!['__skip__','__done__','__pass__'].includes(o.value):['__skip__','__done__','__pass__'].includes(o.value))}return r}
export function ready(s:GameSession){let r=ok(s.getState());if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=ok(confirmNext(s,r));return r}
export function menu(s:GameSession){ready(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.request.options.some(o=>o.value.startsWith('action-improvement-')))r=choose(s,r,o=>o.value.startsWith('action-improvement-'));return r}
export function purchase(s:GameSession,card:string){const pending=menu(s),r=finish(s,ok(s.resolveChoice(0,card)));assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function buildings(r:SessionResponse,p=0){const a=r.state.players[p]!.resources;return{food:a.food,wood:a.wood,clay:a.clay,reed:a.reed,stone:a.stone}}
export function pasture(state:GameState){const p=state.players[0]!;p.pastures=[{id:'early-pasture',tiles:[{row:0,col:0}],animalType:null,animalCount:0}];p.fenceSegments=['H-0-0','H-1-0','V-0-0','V-0-1'].map(edge=>({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}))}
export function oneBoar(state:GameState){const p=state.players[0]!;p.resources.boar=1;p.houseAnimals={'1-0':'boar'}}
export function renovation(s:GameSession,space:string){let r=ok(s.takeAction(0,space));if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='ui.interactionChooseRenovationTarget')r=ok(s.resolveChoice(0,r.state.players[0]!.houseType==='wood'?'clay':'stone'));return r}
