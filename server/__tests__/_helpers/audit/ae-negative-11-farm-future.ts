// Helpers of ae-negative-11-farm-future-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync } from '../audit-evidence-fs'
import { it } from 'vitest'
import type { GameState, PlayerState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'
import { getOwnOrdinaryFenceReserveCount } from '../../../../shared/domain/supply-tokens'
import '../../../../shared/cards/A/A087_Conservator'
import '../../../../shared/cards/A/A088_HedgeKeeper'
import '../../../../shared/cards/A/A090_PlowDriver'

export const CONS='A087_Conservator', HEDGE='A088_HedgeKeeper', DRIVER='A090_PlowDriver'
export const OUT=process.env.AGRICOLA_NEGATIVE_OUTPUT_DIR??'output/ae-negative'
export const sessions:GameSession[]=[]
export function artifact(name:string,data:object){mkdirSync(OUT,{recursive:true});appendFileSync(`${OUT}/11-oa-actions-${process.env.AGRICOLA_NEGATIVE_RAW==='1'?'raw':'normal'}.jsonl`,JSON.stringify({name,...data})+'\n')}
export function scenario(name:string,run:()=>object){it(name,()=>{const actual=run();mkdirSync(OUT,{recursive:true});appendFileSync(`${OUT}/11-oa-facts-${process.env.AGRICOLA_NEGATIVE_RAW==='1'?'raw':'normal'}.jsonl`,JSON.stringify({name,actual})+'\n')})}
export type Setup={played?:boolean;round?:number;house?:PlayerState['houseType'];rooms?:number;resources?:Partial<PlayerState['resources']>;occupations?:number;opponent?:boolean;configure?:(state:GameState)=>void}
export function setup(card:string,{played=true,round=6,house='wood',rooms=2,resources={},occupations=0,opponent=false,configure=()=>{}}:Setup={}){const s=createWorkSession({seed:4242,configure(state){state.round=round;state.players.forEach(p=>{p.minorHand=['__test_placeholder__'];p.occupationHand=['__test_placeholder__'];p.minorPlayed=[];p.occupationPlayed=[];p.improvements=[];Object.assign(p.resources,{wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,food:0,sheep:0,boar:0,cattle:0})});const p=state.players[0]!;p.houseType=house;p.rooms=rooms;p.roomTiles=[{row:1,col:0},{row:2,col:0},...Array.from({length:rooms-2},(_,n)=>({row:2,col:n+1}))];p.occupationPlayed=['A116_WoodCutter'].slice(0,occupations);if(played&&!opponent)p.occupationPlayed.push(card);else p.occupationHand.push(card);if(opponent)state.players[1]!.occupationPlayed=[card];Object.assign(p.resources,resources);configure(state)}});sessions.push(s);assert.equal(s.getState().interaction.stateId,'idle');assert.equal(s.getState().state.players.length,2);for(const p of s.getState().state.players){assert.equal(p.workers.length,5);assert.equal(p.workers.filter(w=>w.isActive).length,2);assert.equal(p.stableTiles.length,0);assert.ok(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p))>=0);if(p.fenceSegments.length)s.withCtx(()=>assert.equal(getOwnOrdinaryFenceReserveCount(p),15-p.fenceSegments.length))}return s}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function res(r:SessionResponse,actor=0){return r.state.players[actor]!.resources}
export function opts(r:SessionResponse){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r.interaction.request.options}
export function ready(s:GameSession,actor:number){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));assert.equal(r.state.currentPlayerIndex,actor);return r}
export function turn(s:GameSession,actor:number,space:string){ready(s,actor);const r=ok(s.takeAction(actor,space));assert.ok(r.state.actionSpaces.find(a=>a.id===space)!.takenBy.some(w=>w.playerId===r.state.players[actor]!.id));artifact('place',{space,actor,response:r});return r}
export function complete(r:SessionResponse){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player',JSON.stringify(r.interaction));return r}
export function lessons(s:GameSession,card:string){let r=turn(s,0,'lessons');if(r.state.players[0]!.occupationHand.includes(card)){assert.ok(opts(r).some(o=>o.value===card&&!o.disabled));r=ok(s.resolveChoice(0,card))}if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='prompt.selectPayment')r=ok(s.resolveChoice(0,opts(r).find(o=>o.value!=='cancel')!.value));assert.ok(r.state.players[0]!.occupationPlayed.includes(card));return complete(r)}
export function renoEntry(s:GameSession){return turn(s,0,'house-redevelopment')}
export function renoFinish(s:GameSession,r:SessionResponse,target:'clay'|'stone'){if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='ui.interactionChooseRenovationTarget')r=ok(s.resolveChoice(0,target));if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='prompt.selectPayment')r=ok(s.resolveChoice(0,opts(r).find(o=>o.value!=='cancel')!.value));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&opts(r).some(o=>o.value==='__skip__'))r=ok(s.resolveChoice(0,'__skip__'));assert.equal(r.state.players[0]!.houseType,target);return complete(r)}
export function renovate(s:GameSession,target:'clay'|'stone'='stone'){return renoFinish(s,renoEntry(s),target)}
export function denyHost(s:GameSession,space:string){assertRejectedUnchanged(s,()=>s.takeAction(0,space));complete(turn(s,0,'day-laborer'));return{hostRejected:true,legalRetryCompleted:true}}
export const FOUR=['H-0-1','H-1-1','V-0-1','V-0-2'], SIX=['H-0-1','H-0-2','H-1-1','H-1-2','V-0-1','V-0-3']
export function boundary(tiles:{row:number;col:number}[]){const edges=new Map<string,number>();for(const {row,col}of tiles)for(const edge of[`H-${row}-${col}`,`H-${row+1}-${col}`,`V-${row}-${col}`,`V-${row}-${col+1}`])edges.set(edge,(edges.get(edge)??0)+1);return [...edges].filter(([,n])=>n===1).map(([e])=>e)}
export function closed(state:GameState,tiles:{row:number;col:number}[],individual=false){const p=state.players[0]!;const edges=individual?[...new Set(tiles.flatMap(t=>boundary([t])))]:boundary(tiles);p.fenceSegments=edges.map(edge=>({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}));p.pastures=individual?tiles.map((t,i)=>({id:`closed-${i}`,tiles:[t],animalType:null,animalCount:0})):[{id:'closed',tiles,animalType:null,animalCount:0}]}
export function fenceEntry(s:GameSession){const r=turn(s,0,'fencing');assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='fence',JSON.stringify(r.interaction));return r}
export function fenceCommit(s:GameSession,edges:string[]){return complete(ok(s.commitSelectionChoice(0,{edges,palisadeEdges:[],extraWood:0})))}
export function fence(s:GameSession,edges=FOUR){fenceEntry(s);return fenceCommit(s,edges)}
export function fields(r:SessionResponse,actor=0){return r.state.players[actor]!.fields.length}
export function workEnd(s:GameSession){turn(s,0,'forest');turn(s,1,'grain-seeds');turn(s,0,'clay-pit');return confirmNext(s,turn(s,1,'reed-bank'))}
export function driverChoice(r:SessionResponse){return r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.sourceCard===DRIVER}
export function acceptDriver(s:GameSession,r:SessionResponse){assert.equal(driverChoice(r),true,JSON.stringify(r.interaction));r=ok(s.resolveChoice(0,opts(r).find(o=>o.value!=='__skip__')!.value));if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='prompt.selectPayment')r=ok(s.resolveChoice(0,opts(r).find(o=>o.value!=='cancel')!.value));assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='plow',JSON.stringify(r.interaction));return r}
export function driverPlow(s:GameSession,r:SessionResponse,col=1){acceptDriver(s,r);return ok(s.commitSelectionChoice(0,{tile:{row:0,col}}))}
