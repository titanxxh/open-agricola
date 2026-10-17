// Helpers of ae-negative-20-roundend-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B053_SculptureCourse'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/20-roundend-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=false,round=4){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});const p=state.players[0]!;p.minorHand=played?['B004_WoodPile','A006_StorageBarn']:[card,'B004_WoodPile','A006_StorageBarn'];p.minorPlayed=played?[card]:[];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finish(s:GameSession,r:SessionResponse){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const o=i.request.options.find(o=>o.value==='__skip__'||o.value==='__done__')??i.request.options[0];assert.ok(o);r=ok(s.resolveChoice(i.playerIndex,o.value))}}return r}
export function menu(s:GameSession){let r=turn(s,0,'meeting-place');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=finish(s,ok(s.resolveChoice(0,card)));assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function end(s:GameSession){let r=s.getState();for(const[n,space]of ['grain-seeds','day-laborer','reed-bank','clay-pit'].entries())r=turn(s,n%2,space);if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function choose(s:GameSession,pending:SessionResponse,resource:'wood'|'stone'|'skip'){assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice');const o=pending.interaction.request.options.find(o=>resource==='skip'?o.value==='__skip__':JSON.stringify(o.descriptionPreview).includes(`"${resource}":1`));assert.ok(o,JSON.stringify(pending.interaction));return finish(s,ok(s.resolveChoice(0,o.value)))}
