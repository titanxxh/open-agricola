// Helpers of ae-negative-16-phases-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const TURNIP='A141_TurnipFarmer',ROPE='A145_Ropemaker',STUDENT='A152_NightSchoolStudent'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/16-phases-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,options:{playerCount:card===STUDENT?4:3},configure(state){state.round=round;state.actionSpaces.find(a=>a.id==='reed-bank')!.resources.reed=1;for(const p of state.players)Object.assign(p.resources,{food:60,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=card===STUDENT?['A110_Roughcaster','A114_SeasonalWorker']:played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finish(s:GameSession,r:SessionResponse,occupation:string|null=null){for(let n=0;n<24&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else{if(i.request.kind==='choice'&&i.promptKey==='ui.interactionChooseOccupation'&&i.playerIndex!==0){const other=i.request.options.find(o=>o.value==='A110_Roughcaster');assert.ok(other);r=ok(s.resolveChoice(i.playerIndex,other.value));continue}assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const o=i.request.options.find(o=>occupation?o.value===occupation:o.value==='__skip__'||o.value==='__done__')??(occupation?i.request.options.find(o=>o.value!=='__skip__'&&o.value!=='__done__'):undefined);assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return r}
export function end(s:GameSession,spaces:string[],occupation:string|null=null){let r=s.getState();for(const [n,space] of spaces.entries()){const actor=n%r.state.players.length;r=turn(s,actor,space);if(n<spaces.length-1)r=finish(s,r);}if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);save('before-phase-choice',r);return {pending:r,r:finish(s,r,occupation)}}
export const SIX=['grain-seeds','day-laborer','forest','reed-bank','clay-pit','fishing']
export const ROPE_SIX=['grain-seeds','day-laborer','forest','grove','clay-pit','fishing']
export const EIGHT=['grain-seeds','day-laborer','forest','reed-bank','clay-pit','fishing','hollow-4','traveling-players']
