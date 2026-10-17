// Helpers of ae-negative-15-build-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const RIPARIAN='A128_RiparianBuilder',SWAG='A129_Swagman'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/15-build-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,options:{playerCount:3},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:10,clay:10,reed:4,stone:10,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);assert.equal(s.getState().state.players.length,3);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function switchActor(s:GameSession,r:SessionResponse){for(let n=0;n<6&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-player-switch';n++)r=ok(s.resolveChoice(r.interaction.request.fromPlayerIndex,'confirm'));return r}
export function select(s:GameSession,r:SessionResponse,accept=true){r=switchActor(s,r);assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));const actor=r.interaction.playerIndex;const o=r.interaction.request.options.find(o=>accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__');assert.ok(o);return ok(s.resolveChoice(actor,o.value))}
export function close(s:GameSession,r:SessionResponse){for(let n=0;n<10&&r.interaction.stateId==='wait';n++){if(r.interaction.request.kind==='confirm-player-switch')r=switchActor(s,r);else if(r.interaction.request.kind==='choice'&&r.interaction.request.options.some(o=>o.value==='__skip__'||o.value==='__done__'))r=select(s,r,false);else break}return r}
export function riparian(material:'wood'|'clay'|'stone',amount:number,played=true){return setup(RIPARIAN,state=>{const p=state.players[0]!;p.houseType=material;Object.assign(p.resources,{wood:0,clay:0,stone:0,reed:2});p.resources[material]=amount},played)}
export function offer(s:GameSession){turn(s,0,'day-laborer');return switchActor(s,turn(s,1,'reed-bank'))}
export function commitRoom(s:GameSession,r:SessionResponse){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice')r=select(s,r);assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='room');r=ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1}]}));if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='prompt.selectPayment')r=select(s,r);return close(s,r)}
export function driveSwag(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<15&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='farm-select'&&i.request.farm.farmType==='stable')r=ok(s.commitSelectionChoice(i.playerIndex,{stables:[{row:0,col:1}]}));else if(i.request.kind==='choice'){const jump=i.request.options.find(o=>o.sourceCard===SWAG&&o.value!=='__skip__');const choice=jump?(accept?jump:i.request.options.find(o=>o.value==='__skip__')):i.request.options.find(o=>o.labelKey==='actions.stables.name')??i.request.options.find(o=>o.value==='__skip__'||o.value==='__done__');assert.ok(choice,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,choice.value))}else assert.fail(JSON.stringify(i))}return r}
export function placements(r:SessionResponse,space:string,owner=0){return r.state.actionSpaces.find(s=>s.id===space)!.takenBy.filter(w=>w.playerId===r.state.players[owner]!.id).map(w=>w.workerId)}
