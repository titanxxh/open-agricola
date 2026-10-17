// Helpers of ae-negative-14-build-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CLAY='A120_ClayHutBuilder',FRAME='A123_FrameBuilder'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/14-build-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true,round=5){const s=createWorkSession({seed:4242,configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:40,wood:10,clay:10,reed:4,stone:10,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function optional(s:GameSession,r:SessionResponse,actor=0){for(let n=0;n<5&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.request.options.some(o=>o.value==='__skip__'||o.value==='__done__');n++){const o=r.interaction.request.options.find(o=>o.value==='__skip__'||o.value==='__done__');assert.ok(o);r=ok(s.resolveChoice(actor,o.value))}return r}
export function play(s:GameSession,card:string){let r=turn(s,0,'lessons');if(!r.state.players[0]!.occupationPlayed.includes(card))r=ok(s.resolveChoice(0,card));return r}
export function renovation(s:GameSession,actor=0){let r=turn(s,actor,'house-redevelopment');if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='ui.interactionChooseRenovationTarget')r=ok(s.resolveChoice(actor,r.state.players[actor]!.houseType==='wood'?'clay':'stone'));if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='prompt.selectPayment'){const o=r.interaction.request.kind==='choice'?r.interaction.request.options.find(o=>o.value!=='cancel'):undefined;assert.ok(o);r=ok(s.resolveChoice(actor,o.value))}return optional(s,r,actor)}
export function schedule(r:SessionResponse){return r.state.futureMeeples.filter(e=>e.cardId===CLAY).map(e=>[e.round,e.resources.clay,e.playerId]).sort((a,b)=>Number(a[0])-Number(b[0]))}
export function finish(s:GameSession){turn(s,0,'grain-seeds');turn(s,1,'reed-bank');turn(s,0,'day-laborer');return cleanup(s,confirmNext(s,turn(s,1,'clay-pit')))}
export function cleanup(s:GameSession,r:SessionResponse){for(let n=0;n<20&&r.interaction.stateId==='wait';n++){const i=r.interaction;if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.toPlayerIndex,'confirm'));else assert.fail(JSON.stringify(i))}assert.equal(r.interaction.stateId,'idle');return r}
export function startBuild(s:GameSession){let r=turn(s,0,'farm-expansion');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.labelKey==='actions.construct.name');assert.ok(o);r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select');return r}
export function build(s:GameSession,count:number){startBuild(s);let r=ok(s.commitSelectionChoice(0,{rooms:Array.from({length:count},(_,i)=>({row:1+i,col:1}))}));if(r.interaction.stateId==='wait'&&r.interaction.promptKey==='prompt.selectPayment'){const o=r.interaction.request.kind==='choice'?r.interaction.request.options.find(o=>o.value!=='cancel'):undefined;assert.ok(o);r=ok(s.resolveChoice(0,o.value))}return optional(s,r)}
